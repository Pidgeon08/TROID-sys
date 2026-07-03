const API_BASE = 'http://localhost:8000/api';

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
      errorMessage = errorJson.error || errorMessage;
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
  delete: (path) => request(path, { method: 'DELETE' }),

  boats: () => api.get('/boats/'),
  botDetail: (id) => api.get(`/boats/${id}/`),
  createBoat: (data) => api.post('/boats/', data),
  updateBoat: (id, data) => api.put(`/boats/${id}/`, data),
  deleteBoat: (id) => api.delete(`/boats/${id}/`),

  users: () => api.get('/users/'),
  userDetail: (id) => api.get(`/users/${id}/`),
  createUser: (data) => api.post('/users/', data),
  updateUser: (id, data) => api.put(`/users/${id}/`, data),
  deleteUser: (id) => api.delete(`/users/${id}/`),
  pendingUserCount: () => api.get('/users/pending-count/'),
  pendingRequestCount: () => api.get('/requests/pending-count/'),

  operators: () => api.get('/operators/'),
  operatorDetail: (id) => api.get(`/operators/${id}/`),
  createOperator: (data) => api.post('/operators/', data),
  updateOperator: (id, data) => api.put(`/operators/${id}/`, data),
  deleteOperator: (id) => api.delete(`/operators/${id}/`),

  requests: () => api.get('/requests/'),
  requestDetail: (id) => api.get(`/requests/${id}/`),
  createRequest: (data) => api.post('/requests/', data),
  updateRequest: (id, data) => api.put(`/requests/${id}/`, data),
  deleteRequest: (id) => api.delete(`/requests/${id}/`),

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
  getHeatmap: () => api.get('/heatmap/'),
};

export default api;
