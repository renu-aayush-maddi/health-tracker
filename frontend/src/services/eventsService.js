import { api } from './apiClient.js';

export const eventsService = {
  list: (filters, options) => api.get('/health-events', { ...options, query: filters }),
  get: (eventId, options) => api.get(`/health-events/${eventId}`, options),
  create: (event) => api.post('/health-events', event),
  update: (eventId, event) => api.put(`/health-events/${eventId}`, event),
  updateStatus: (eventId, body) => api.patch(`/health-events/${eventId}`, body),
  remove: (eventId) => api.delete(`/health-events/${eventId}`),
  calendar: ({ from, to }, options) =>
    api.get('/health-events/calendar', { ...options, query: { from, to } }),
  issues: (options) => api.get('/health-events/issues', options),
};

export const medicinesService = {
  add: (eventId, medicine) => api.post(`/health-events/${eventId}/medicines`, medicine),
  update: (eventId, medicineId, medicine) =>
    api.put(`/health-events/${eventId}/medicines/${medicineId}`, medicine),
  remove: (eventId, medicineId) => api.delete(`/health-events/${eventId}/medicines/${medicineId}`),
  names: (q, options) => api.get('/medicines/names', { ...options, query: { q } }),
};

export const dashboardService = {
  get: (options) => api.get('/dashboard', options),
};
