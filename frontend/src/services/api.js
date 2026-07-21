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
  declineRequest: (id, data) => api.post(`/requests/${id}/decline/`, data),

  deploymentSchedules: () => api.get('/deployment-schedules/'),
  deploymentScheduleDetail: (id) => api.get(`/deployment-schedules/${id}/`),
  createDeploymentSchedule: (data) => api.post('/deployment-schedules/', data),
  updateDeploymentSchedule: (id, data) => api.put(`/deployment-schedules/${id}/`, data),
  deleteDeploymentSchedule: (id) => api.delete(`/deployment-schedules/${id}/`),

  landfillRecords: () => api.get('/landfill-records/'),
  landfillRecordDetail: (id) => api.get(`/landfill-records/${id}/`),
  createLandfillRecord: (data) => api.post('/landfill-records/', data),
  updateLandfillRecord: (id, data) => api.put(`/landfill-records/${id}/`, data),
  deleteLandfillRecord: (id) => api.delete(`/landfill-records/${id}/`),

  recyclingRecords: () => api.get('/recycling-records/'),
  recyclingRecordDetail: (id) => api.get(`/recycling-records/${id}/`),
  createRecyclingRecord: (data) => api.post('/recycling-records/', data),
  updateRecyclingRecord: (id, data) => api.put(`/recycling-records/${id}/`, data),
  deleteRecyclingRecord: (id) => api.delete(`/recycling-records/${id}/`),

  segregationRecords: () => api.get('/segregation-records/'),
  createSegregationRecord: (data) => api.post('/segregation-records/', data),

  auditLogs: () => api.get('/audit-logs/'),
  createAuditLog: (data) => api.post('/audit-logs/', data),

  heatmapData: () => api.get('/heatmap-data/'),
  createHeatmapData: (data) => api.post('/heatmap-data/', data),

  logDetection: (data) => api.post('/log-detection/', data),
  getHeatmap: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', params.category);
    if (params.time_filter) qs.set('time_filter', params.time_filter);
    const q = qs.toString();
    return api.get(`/heatmap/${q ? `?${q}` : ''}`);
  },

  login: (data) => api.post('/login/', data),
  forgotPassword: (email) => api.post('/forgot-password/', { email }),
};

export default api;
