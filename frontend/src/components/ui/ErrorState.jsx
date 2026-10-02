import { CircleAlert } from 'lucide-react';
import Button from './Button.jsx';
import EmptyState from './EmptyState.jsx';

/** Friendly failure message for a section or page, with an optional retry. */
export default function ErrorState({
  title = 'Something went wrong.',
  error,
  onRetry,
  action,
  compact,
}) {
  return (
    <div role="alert">
      <EmptyState
        compact={compact}
        icon={CircleAlert}
        title={title}
        description={error?.message ?? 'Please try again.'}
        action={
          action ??
          (onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          ))
        }
      />
    </div>
  );
}
