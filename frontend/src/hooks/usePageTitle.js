import { useEffect } from 'react';

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Health Tracker` : 'Health Tracker';
  }, [title]);
}
