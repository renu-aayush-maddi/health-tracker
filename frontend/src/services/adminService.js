import { api } from './apiClient.js';

const q = (query, options) => ({ ...options, query });

export const adminService = {
  me: (options) => api.get('/admin/me', options),
  reauth: (password) => api.post('/admin/reauth', { password }),

  dashboard: (filters, options) => api.get('/admin/dashboard', q(filters, options)),
  reports: (filters, options) => api.get('/admin/reports', q(filters, options)),
  system: (options) => api.get('/admin/system/health', options),

  users: (filters, options) => api.get('/admin/users', q(filters, options)),
  user: (userId, options) => api.get(`/admin/users/${userId}`, options),
  updateUser: (userId, body) => api.patch(`/admin/users/${userId}`, body),
  changeStatus: (userId, body) => api.post(`/admin/users/${userId}/status`, body),
  changeRole: (userId, body) => api.post(`/admin/users/${userId}/role`, body),
  forceLogout: (userId) => api.post(`/admin/users/${userId}/force-logout`),
  triggerPasswordReset: (userId) => api.post(`/admin/users/${userId}/password-reset`),
  deleteUser: (userId, body) => api.delete(`/admin/users/${userId}`, { body }),

  sessions: (filters, options) => api.get('/admin/sessions', q(filters, options)),
  revokeSession: (id) => api.post(`/admin/sessions/${id}/revoke`),

  security: (filters, options) => api.get('/admin/security', q(filters, options)),
  suspicious: (options) => api.get('/admin/security-events/suspicious', options),
  auditLogs: (filters, options) => api.get('/admin/audit-logs', q(filters, options)),

  ipAddresses: (filters, options) => api.get('/admin/ip-addresses', q(filters, options)),
  blockIp: (body) => api.post('/admin/ip-addresses/block', body),
  unblockIp: (ip) => api.post('/admin/ip-addresses/unblock', { ip }),

  admins: (options) => api.get('/admin/admins', options),
  grantPermission: (userId, body) => api.post(`/admin/admins/${userId}/permissions`, body),
  revokePermission: (userId, permission) =>
    api.delete(`/admin/admins/${userId}/permissions/${encodeURIComponent(permission)}`),

  healthRecords: (filters, options) => api.get('/admin/health-records', q(filters, options)),
  healthRecord: (id, options) => api.get(`/admin/health-records/${id}`, options),
  medicines: (filters, options) => api.get('/admin/medicines', q(filters, options)),
};
