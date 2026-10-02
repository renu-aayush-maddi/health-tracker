import { useRouteError } from 'react-router';
import FullPageStatus from '../ui/FullPageStatus.jsx';

/**
 * Last-resort screen for unexpected rendering errors. The usual cause is an open tab asking for
 * an old code chunk after a new version was deployed, which a reload fixes.
 */
export default function RouteError() {
  const error = useRouteError();
  const staleBundle =
    /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(
      String(error?.message ?? ''),
    );
  if (import.meta.env.DEV) console.error(error);

  return (
    <FullPageStatus
      error={
        staleBundle
          ? 'A new version of Health Tracker is available. Reload to continue.'
          : 'Something went wrong while showing this page.'
      }
      onRetry={() => window.location.reload()}
    />
  );
}
