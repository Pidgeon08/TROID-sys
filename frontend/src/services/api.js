const API_BASE = 'http://localhost:8000/api';

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
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

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

  users: () => api.get('/users/'),
  userDetail: (id) => api.get(`/users/${id}/`),
  createUser: (data) => api.post('/users/', data),
  updateUser: (id, data) => api.patch(`/users/${id}/`, data),
  deleteUser: (id) => api.delete(`/users/${id}/`),
  resetUserPassword: (id) => api.post(`/users/${id}/reset-password/`),
  changeUserPassword: (id, data) => api.post(`/users/${id}/change-password/`, data),
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
  markSessionCompleted: (id) => api.post(`/requests/${id}/mark_session_completed/`),
  submitTrashReport: (id, data) => api.post(`/requests/${id}/submit_trash_report/`, data),
  botDetections: (id) => api.get(`/requests/${id}/bot_detections/`),
  submitVerification: (id, data) => api.post(`/requests/${id}/submit_verification/`, data),
  postCleanupComparison: () => api.get('/requests/post-cleanup-comparison/'),

  notifications: (userId) => api.get(`/notifications/?user_id=${userId}`),
  unreadNotificationCount: (userId) => api.get(`/notifications/unread-count/?user_id=${userId}`),
  markNotificationRead: (id) => api.post(`/notifications/${id}/mark_read/`),
  markAllNotificationsRead: (userId) => api.post('/notifications/mark-all-read/', { user_id: userId }),

  deploymentSchedules: () => api.get('/deployment-schedules/'),
  deploymentScheduleDetail: (id) => api.get(`/deployment-schedules/${id}/`),
  createDeploymentSchedule: (data) => api.post('/deployment-schedules/', data),
  updateDeploymentSchedule: (id, data) => api.put(`/deployment-schedules/${id}/`, data),
  deleteDeploymentSchedule: (id) => api.delete(`/deployment-schedules/${id}/`),

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

  logDetection: (data) => api.post('/log-detection/', data),
  getHeatmap: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', params.category);
    if (params.time_filter) qs.set('time_filter', params.time_filter);
    if (params.barangay) qs.set('barangay', params.barangay);
    const q = qs.toString();
    return api.get(`/heatmap/${q ? `?${q}` : ''}`);
  },

  login: (data) => api.post('/login/', data),
  forgotPassword: (email) => api.post('/forgot-password/', { email }),
};

export default api;
