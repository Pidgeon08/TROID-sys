import { UNAUTHORIZED_EVENT, getAuthHeaders, hasSession } from './session';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

function extractErrorMessage(errorJson) {
  if (!errorJson) return null;
  if (typeof errorJson === 'string') return errorJson;
  if (errorJson.error) return errorJson.error;
  if (errorJson.detail) return errorJson.detail;
  // DRF's default validation-error shape: { field: ["message", ...], ... }
  const firstKey = Object.keys(errorJson)[0];
  if (firstKey) {
    const value = errorJson[firstKey];
    const message = Array.isArray(value) ? value[0] : value;
    return firstKey === 'non_field_errors' ? message : `${firstKey}: ${message}`;
  }
  return null;
}

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const { headers, skipUnauthorizedEvent, ...fetchOptions } = options;
  const response = await fetch(url, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...headers,
    },
  });

  // The server no longer accepts this session (signed out, signed in
  // elsewhere, or account deactivated): App.jsx signs the user out.
  if (response.status === 401 && hasSession() && !skipUnauthorizedEvent) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  if (!response.ok) {
    const text = await response.text();
    let errorMessage = `API error: ${response.status}`;
    try {
      const errorJson = JSON.parse(text);
      errorMessage = extractErrorMessage(errorJson) || errorMessage;
    } catch {
      errorMessage = text || errorMessage;
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  put: (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: 'DELETE' }),

  boats: () => api.get('/boats/'),
  botDetail: (id) => api.get(`/boats/${id}/`),
  createBoat: (data) => api.post('/boats/', data),
  updateBoat: (id, data) => api.put(`/boats/${id}/`, data),
  deleteBoat: (id) => api.delete(`/boats/${id}/`),
  // Creates the robot's device key (replacing any old one); the response is the only time it is shown.
  createBoatDeviceKey: (id) => api.post(`/boats/${id}/device-key/`),

  users: () => api.get('/users/'),
  userDetail: (id) => api.get(`/users/${id}/`),
  createUser: (data) => api.post('/users/', data),
  updateUser: (id, data) => api.patch(`/users/${id}/`, data),
  deleteUser: (id) => api.delete(`/users/${id}/`),
  resetUserPassword: (id) => api.post(`/users/${id}/reset-password/`),
  changeUserPassword: (id, data) => api.post(`/users/${id}/change-password/`, data),
  // The server checks the Authorization header; ?token= is only for backends
  // deployed before header authentication and is removed once it's enforced.
  checkUserSession: (id, token) => api.get(`/users/${id}/session-check/?token=${encodeURIComponent(token)}`),
  pendingUserCount: () => api.get('/users/pending-count/'),
  pendingRequestCount: () => api.get('/requests/pending-count/'),

  operators: () => api.get('/operators/'),
  operatorDetail: (id) => api.get(`/operators/${id}/`),
  createOperator: (data) => api.post('/operators/', data),
  updateOperator: (id, data) => api.put(`/operators/${id}/`, data),
  deleteOperator: (id) => api.delete(`/operators/${id}/`),

  requests: () => api.get('/requests/'),
  requestsArchived: () => api.get('/requests/?archived=true'),
  requestsForArea: (areaId) => api.get(`/requests/?collection_area=${encodeURIComponent(areaId)}`),
  requestDetail: (id) => api.get(`/requests/${id}/`),
  restoreRequest: (id) => api.post(`/requests/${id}/restore/`),
  createRequest: (data) => api.post('/requests/', data),
  updateRequest: (id, data) => api.put(`/requests/${id}/`, data),
  deleteRequest: (id) => api.delete(`/requests/${id}/`),
  mayorApproveRequest: (id) => api.post(`/requests/${id}/mayor_approve/`),
  adminApproveRequest: (id) => api.post(`/requests/${id}/admin_approve/`),
  parkRequest: (id, data) => api.post(`/requests/${id}/park/`, data),
  unparkRequest: (id) => api.post(`/requests/${id}/unpark/`),
  rescheduleRequest: (id, data) => api.post(`/requests/${id}/reschedule/`, data),
  redirectRequestArea: (id, data) => api.post(`/requests/${id}/redirect-area/`, data),
  resendRequest: (id) => api.post(`/requests/${id}/resend/`, {}),
  mergeRequests: (id, data) => api.post(`/requests/${id}/merge/`, data),
  unmergeRequest: (id, data) => api.post(`/requests/${id}/unmerge/`, data || {}),
  submitTrashReport: (id, data) => api.post(`/requests/${id}/submit_trash_report/`, data),
  requestLetter: (id) => api.get(`/requests/${id}/letter/`),
  troidCount: (id) => api.get(`/requests/${id}/troid_count/`),
  postCleanupComparison: () => api.get('/requests/post-cleanup-comparison/'),

  notifications: (userId) => api.get(`/notifications/?user_id=${userId}`),
  liveVersions: (userId) => request(`/live/${userId ? `?user_id=${userId}` : ''}`, { skipUnauthorizedEvent: true }),
  markNotificationRead: (id) => api.post(`/notifications/${id}/mark_read/`),
  markAllNotificationsRead: (userId) => api.post('/notifications/mark-all-read/', { user_id: userId }),

  deploymentSchedules: () => api.get('/deployment-schedules/'),
  deploymentScheduleDetail: (id) => api.get(`/deployment-schedules/${id}/`),
  createDeploymentSchedule: (data) => api.post('/deployment-schedules/', data),
  updateDeploymentSchedule: (id, data) => api.put(`/deployment-schedules/${id}/`, data),
  deleteDeploymentSchedule: (id) => api.delete(`/deployment-schedules/${id}/`),

  // Each collection area with recent cleanups and whether it is a priority (more bags per
  // cleanup over the last 30 days than the 30 before). params: { as_of: 'YYYY-MM-DD', barangay }.
  priorityAreas: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    return api.get(`/priority-areas/${qs.toString() ? `?${qs}` : ''}`);
  },

  // The hotspots (priority areas) of each of the last `months` months, oldest first. params: { months, barangay }.
  hotspots: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    return api.get(`/hotspots/${qs.toString() ? `?${qs}` : ''}`);
  },

  landfillRecords: () => api.get('/landfill-records/'),

  recyclingRecords: () => api.get('/recycling-records/'),

  segregationRecords: () => api.get('/segregation-records/'),
  createSegregationRecord: (data) => api.post('/segregation-records/', data),

  auditLogs: () => api.get('/audit-logs/'),
  createAuditLog: (data) => api.post('/audit-logs/', data),

  collectionAreas: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.barangay) qs.set('barangay', params.barangay);
    if (params.status) qs.set('status', params.status);
    if (params.archived) qs.set('archived', 'true');
    if (params.troid_supported) qs.set('troid_supported', 'true');
    const q = qs.toString();
    return api.get(`/collection-areas/${q ? `?${q}` : ''}`);
  },
  collectionAreaDetail: (id) => api.get(`/collection-areas/${id}/`),
  createCollectionArea: (data) => api.post('/collection-areas/', data),
  updateCollectionArea: (id, data) => api.put(`/collection-areas/${id}/`, data),
  patchCollectionArea: (id, data) => api.patch(`/collection-areas/${id}/`, data),
  deleteCollectionArea: (id) => api.delete(`/collection-areas/${id}/`),
  approveCollectionArea: (id, data) => api.post(`/collection-areas/${id}/approve/`, data),
  declineCollectionArea: (id, data) => api.post(`/collection-areas/${id}/decline/`, data),

  heatmapData: () => api.get('/heatmap-data/'),
  createHeatmapData: (data) => api.post('/heatmap-data/', data),

  taskStatusUpdates: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.search) qs.set('search', params.search);
    if (params.since) qs.set('since', params.since);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return api.get(`/task-status-updates/${query ? `?${query}` : ''}`);
  },

  logDetection: (data) => api.post('/log-detection/', data),
  getHeatmap: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', params.category);
    if (params.time_filter) qs.set('time_filter', params.time_filter);
    if (params.barangay) qs.set('barangay', params.barangay);
    if (params.collection_area) qs.set('collection_area', params.collection_area);
    if (params.start) qs.set('start', params.start);
    if (params.end) qs.set('end', params.end);
    const q = qs.toString();
    return api.get(`/heatmap/${q ? `?${q}` : ''}`);
  },

  // Backup & Restore. The system is paused for everyone else while an admin backs up or
  // restores: startPause first, keep it alive with pauseHeartbeat, and endPause to cancel.
  // Making the backup or restoring ends the pause on the server.
  pauseStatus: () => request('/maintenance/', { skipUnauthorizedEvent: true }),
  startPause: (kind) => api.post('/maintenance/start/', { kind }),
  pauseHeartbeat: () => api.post('/maintenance/heartbeat/', {}),
  endPause: () => api.post('/maintenance/end/', {}),
  backupFeatures: () => api.get('/backup/features/'),
  createBackup: (features) => api.post('/backup/', { features }),
  // `backupText` is the backup file as read, so it isn't parsed and re-encoded on the way.
  previewRestore: (backupText, features) => request('/backup/restore/preview/', {
    method: 'POST', body: `{"features":${JSON.stringify(features)},"backup":${backupText}}`,
  }),
  restoreBackup: (backupText, features) => request('/backup/restore/', {
    method: 'POST', body: `{"features":${JSON.stringify(features)},"backup":${backupText}}`,
  }),

  login: (data) => api.post('/login/', data),
  logout: () => request('/logout/', { method: 'POST', skipUnauthorizedEvent: true }),
  forgotPassword: (email) => api.post('/forgot-password/', { email }),
};

export default api;
