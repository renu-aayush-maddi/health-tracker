import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';

const STORAGE_KEY = 'ht.theme';

/**
 * Applies the theme preference to <html data-theme>. The last choice is also remembered in
 * localStorage (a per-device display setting, not health data) so the login screen matches.
 */
export default function ThemeSync() {
  const { user } = useAuth();
  const preferred = user?.preferences?.theme;

  useEffect(() => {
    let theme = preferred;
    try {
      if (theme) localStorage.setItem(STORAGE_KEY, theme);
      else theme = localStorage.getItem(STORAGE_KEY) ?? 'system';
    } catch {
      theme ??= 'system';
    }
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }, [preferred]);

  return null;
}
