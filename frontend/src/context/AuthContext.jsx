import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authService } from '../services/authService.js';
import { setUnauthorizedHandler } from '../services/apiClient.js';
import { clearSessionState } from '../utils/sessionState.js';

const AuthContext = createContext(null);
const SESSION_KEY = ['session'];

async function fetchSession() {
  try {
    return await authService.getSession();
  } catch (error) {
    if (error.status === 401) return null; // signed out is a normal answer, not a failure
    throw error;
  }
}

/**
 * status: 'loading' | 'authenticated' | 'unauthenticated' | 'error' (server unreachable on load).
 * The session itself lives in an HttpOnly cookie; this only mirrors who is signed in.
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [expired, setExpired] = useState(false);
  const session = useQuery({ queryKey: SESSION_KEY, queryFn: fetchSession, staleTime: Infinity });

  /** Drops cached data and per-tab UI state, so one user's data never shows up in another's view. */
  const setSessionUser = useCallback(
    (user) => {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== SESSION_KEY[0] });
      clearSessionState();
      queryClient.setQueryData(SESSION_KEY, user);
    },
    [queryClient],
  );

  // Any API call that comes back 401 means the session ended (expired, revoked, logged out elsewhere).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSessionUser(null);
      setExpired(true);
    });
    return () => setUnauthorizedHandler(null);
  }, [setSessionUser]);

  const value = useMemo(() => {
    const signIn = (user) => {
      setSessionUser(user);
      setExpired(false);
      return user;
    };

    let status = 'loading';
    if (session.isError) status = session.isFetching ? 'loading' : 'error';
    else if (session.isSuccess) status = session.data ? 'authenticated' : 'unauthenticated';

    return {
      status,
      user: session.data ?? null,
      error: session.error,
      expired,
      login: async (credentials) => signIn(await authService.login(credentials)),
      register: async (details) => signIn(await authService.register(details)),
      logout: async () => {
        try {
          await authService.logout();
        } finally {
          setSessionUser(null);
          setExpired(false);
        }
      },
      updateUser: (user) => queryClient.setQueryData(SESSION_KEY, user),
      verifyEmail: async (code) => {
        const user = await authService.verifyEmail(code);
        queryClient.setQueryData(SESSION_KEY, user);
        return user;
      },
      retry: () => session.refetch(),
    };
  }, [session, expired, setSessionUser, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
