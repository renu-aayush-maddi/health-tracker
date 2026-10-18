import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../services/adminService.js';

/**
 * Who the signed-in administrator is and what they may do. `can()` drives which navigation and
 * buttons are rendered — a convenience only; the API enforces the same rules independently.
 */
export function useAdminMe() {
  const query = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: ({ signal }) => adminService.me({ signal }),
    staleTime: 60_000,
  });
  const permissions = query.data?.permissions ?? [];
  return {
    ...query,
    permissions,
    can: (permission) => permissions.includes(permission),
    canAny: (...list) => list.some((permission) => permissions.includes(permission)),
  };
}

/** A paginated admin list. `filters` is part of the cache key, so changing one refetches. */
export function useAdminList(key, fetcher, filters, options = {}) {
  return useQuery({
    queryKey: ['admin', key, filters],
    queryFn: ({ signal }) => fetcher(filters, { signal }),
    placeholderData: keepPreviousData,
    ...options,
  });
}

export const useAdminDashboard = (filters) =>
  useAdminList('dashboard', adminService.dashboard, filters);
export const useAdminReports = (filters) => useAdminList('reports', adminService.reports, filters);
export const useAdminUsers = (filters) => useAdminList('users', adminService.users, filters);
export const useAdminSessions = (filters) =>
  useAdminList('sessions', adminService.sessions, filters);
export const useAdminSecurity = (filters) =>
  useAdminList('security', adminService.security, filters);
export const useAdminAuditLogs = (filters) =>
  useAdminList('audit', adminService.auditLogs, filters);
export const useAdminIps = (filters) => useAdminList('ips', adminService.ipAddresses, filters);
export const useAdminHealthRecords = (filters) =>
  useAdminList('health-records', adminService.healthRecords, filters);
export const useAdminMedicines = (filters) =>
  useAdminList('medicines', adminService.medicines, filters);

export function useAdminUser(userId) {
  return useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: ({ signal }) => adminService.user(userId, { signal }),
    enabled: Boolean(userId),
  });
}

export function useAdminSystem() {
  return useQuery({
    queryKey: ['admin', 'system'],
    queryFn: ({ signal }) => adminService.system({ signal }),
    refetchInterval: 30_000,
  });
}

export function useSuspiciousActivity() {
  return useQuery({
    queryKey: ['admin', 'suspicious'],
    queryFn: ({ signal }) => adminService.suspicious({ signal }),
  });
}

export function useAdminAdmins() {
  return useQuery({
    queryKey: ['admin', 'admins'],
    queryFn: ({ signal }) => adminService.admins({ signal }),
  });
}

/** Any administrative write can change lists, audit logs and the account itself. */
function useAdminRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['admin'] });
}

export function useAdminMutations() {
  const refresh = useAdminRefresh();
  const onSuccess = refresh;

  return {
    reauth: useMutation({ mutationFn: (password) => adminService.reauth(password), onSuccess }),
    updateUser: useMutation({
      mutationFn: ({ userId, body }) => adminService.updateUser(userId, body),
      onSuccess,
    }),
    changeStatus: useMutation({
      mutationFn: ({ userId, body }) => adminService.changeStatus(userId, body),
      onSuccess,
    }),
    changeRole: useMutation({
      mutationFn: ({ userId, body }) => adminService.changeRole(userId, body),
      onSuccess,
    }),
    forceLogout: useMutation({
      mutationFn: (userId) => adminService.forceLogout(userId),
      onSuccess,
    }),
    triggerPasswordReset: useMutation({
      mutationFn: (userId) => adminService.triggerPasswordReset(userId),
      onSuccess,
    }),
    deleteUser: useMutation({
      mutationFn: ({ userId, body }) => adminService.deleteUser(userId, body),
      onSuccess,
    }),
    revokeSession: useMutation({ mutationFn: (id) => adminService.revokeSession(id), onSuccess }),
    blockIp: useMutation({ mutationFn: (body) => adminService.blockIp(body), onSuccess }),
    unblockIp: useMutation({ mutationFn: (ip) => adminService.unblockIp(ip), onSuccess }),
    grantPermission: useMutation({
      mutationFn: ({ userId, body }) => adminService.grantPermission(userId, body),
      onSuccess,
    }),
    revokePermission: useMutation({
      mutationFn: ({ userId, permission }) => adminService.revokePermission(userId, permission),
      onSuccess,
    }),
  };
}
