import { useNavigate, useParams, useSearchParams } from 'react-router';
import { isValidIsoDate } from '@health-tracker/shared';
import EventForm from '../components/events/EventForm.jsx';
import { emptyEventValues, eventToFormValues } from '../components/events/eventFormValues.js';
import ErrorState from '../components/ui/ErrorState.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Skeleton, { SkeletonStack } from '../components/ui/Skeleton.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useUploads } from '../context/UploadsContext.jsx';
import { useGoBack } from '../hooks/useGoBack.js';
import { useEvent, useEventMutations } from '../hooks/useHealthEvents.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { todayISO } from '../utils/dates.js';

function FormSkeleton() {
  return (
    <SkeletonStack label="Loading health event…">
      <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: 760 }}>
        <Skeleton height={220} radius="var(--radius-lg)" />
        <Skeleton height={140} radius="var(--radius-lg)" />
        <Skeleton height={160} radius="var(--radius-lg)" />
      </div>
    </SkeletonStack>
  );
}

export default function EventFormPage() {
  const { eventId } = useParams();
  const isEdit = Boolean(eventId);
  usePageTitle(isEdit ? 'Edit health event' : 'Add health event');

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const goBack = useGoBack(isEdit ? `/history/${eventId}` : '/');
  const toast = useToast();
  const { create, update } = useEventMutations();
  const uploads = useUploads();
  const eventQuery = useEvent(eventId);

  const header = (
    <PageHeader
      title={isEdit ? 'Edit health event' : 'Add health event'}
      description={isEdit ? undefined : 'Only the health issue, title and start date are required.'}
    />
  );

  if (isEdit && eventQuery.isPending) {
    return (
      <>
        {header}
        <FormSkeleton />
      </>
    );
  }

  if (isEdit && eventQuery.isError) {
    const missing = eventQuery.error.status === 404;
    return (
      <>
        {header}
        <ErrorState
          title={missing ? 'Health event not found' : 'Unable to load this health event.'}
          error={missing ? { message: 'It may have been deleted.' } : eventQuery.error}
          onRetry={missing ? undefined : eventQuery.refetch}
          action={missing && <Button to="/history">Back to history</Button>}
        />
      </>
    );
  }

  // Calendar "add on this day" links pass ?date=YYYY-MM-DD (a date only, never health details).
  const requestedDate = searchParams.get('date');
  const startDate =
    requestedDate && isValidIsoDate(requestedDate) && requestedDate <= todayISO()
      ? requestedDate
      : undefined;
  const initialValues = isEdit
    ? eventToFormValues(eventQuery.data)
    : emptyEventValues({ startDate });

  const onSubmit = async (data, files) => {
    const saved = isEdit
      ? await update.mutateAsync({ eventId, event: data })
      : await create.mutateAsync(data);
    toast.success(
      isEdit ? 'Health event updated successfully.' : 'Health event added successfully.',
    );
    // Chosen files upload in the background; the event page shows their progress.
    if (files.length) uploads.enqueue(saved.id, files);
    navigate(`/history/${saved.id}`, { replace: true });
  };

  return (
    <>
      {header}
      <EventForm
        key={isEdit ? `${eventId}-${eventQuery.data.updatedAt}` : 'new'}
        initialValues={initialValues}
        submitLabel={isEdit ? 'Save changes' : 'Save event'}
        onSubmit={onSubmit}
        onCancel={goBack}
        existingFileCount={isEdit ? eventQuery.data.attachments.length : 0}
      />
    </>
  );
}
