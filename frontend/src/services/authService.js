import { api } from './apiClient.js';

// Auth endpoints handle their own 401s (e.g. "invalid credentials"), so they skip the
// global "session expired → back to login" redirect.
const noRedirect = { skipAuthRedirect: true };

export const authService = {
  getSession: () => api.get('/auth/session', noRedirect).then((res) => res.user),
  login: (credentials) => api.post('/auth/login', credentials, noRedirect).then((res) => res.user),
  register: (details) => api.post('/auth/register', details, noRedirect).then((res) => res.user),
  logout: () => api.post('/auth/logout', undefined, noRedirect),
  changePassword: (passwords) => api.post('/auth/change-password', passwords),
  forgotPassword: (body) => api.post('/auth/forgot-password', body, noRedirect),
  resetPassword: (body) => api.post('/auth/reset-password', body, noRedirect),
};
