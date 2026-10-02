import { api, downloadFile } from './apiClient.js';

export const usersService = {
  updateProfile: (changes) => api.patch('/users/me', changes).then((res) => res.user),
  deleteAccount: (password) => api.delete('/users/me', { body: { password } }),
  /** Saves an Excel copy of the user's own data. */
  exportData: () => downloadFile('/users/me/export', 'health-tracker.xlsx'),
};
