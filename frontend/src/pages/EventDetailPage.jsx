import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, CircleCheck, Pencil, Pill, Plus, Trash2 } from 'lucide-react';
import AttachmentsCard from '../components/attachments/AttachmentsCard.jsx';
import DeleteEventDialog from '../components/events/DeleteEventDialog.jsx';
import MarkResolvedDialog from '../components/events/MarkResolvedDialog.jsx';
import MedicineDialog from '../components/events/MedicineDialog.jsx';
import { SeverityBadge, StatusBadge } from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Skeleton, { SkeletonStack } from '../components/ui/Skeleton.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useEventUploads } from '../context/UploadsContext.jsx';
import { useDateFormat } from '../hooks/useDateFormat.js';
import { useGoBack } from '../hooks/useGoBack.js';
import { useEvent, useFeatures, useMedicineMutations } from '../hooks/useHealthEvents.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { formatDate, formatDuration } from '../utils/dates.js';
import styles from './EventDetailPage.module.css';

function DetailSkeleton() {
  return (
    <SkeletonStack label="Loading health event…">
      <Skeleton width={120} height={14} />
      <Skeleton width="60%" height={32} className={styles.skeletonGap} />
      <Skeleton width={220} height={16} className={styles.skeletonGap} />
      <div className={styles.grid}>
        <Skeleton height={160} radius="var(--radius-lg)" />
        <Skeleton height={160} radius="var(--radius-lg)" />
      </div>
    </SkeletonStack>
  );
}

function MedicineItem({ medicine, onEdit, onRemove }) {
  const details = [medicine.dosage, medicine.frequency].filter(Boolean).join(' · ');
  const from = formatDate(medicine.startDate, 'dd MMM');
  const to = formatDate(medicine.endDate, 'dd MMM');
  let dates = null;
  if (from && to) dates = `${from} → ${to}`;
  else if (from) dates = `From ${from}`;
  else if (to) dates = `Until ${to}`;

  return (
    <li className={styles.medicine}>
      <span className={styles.medicineIcon} aria-hidden="true">
        <Pill size={18} />
      </span>
      <div className={styles.medicineBody}>
        <h3 className={styles.medicineName}>{medicine.name}</h3>
        {details && <p>{details}</p>}
        {dates && <p className={styles.muted}>{dates}</p>}
        {medicine.notes && <p className={styles.muted}>{medicine.notes}</p>}
      </div>
      <div className={styles.medicineActions}>
        <Button variant="ghost" size="sm" icon={Pencil} iconOnly onClick={onEdit}>
          {`Edit ${medicine.name}`}
        </Button>
        <Button variant="ghost" size="sm" icon={Trash2} iconOnly onClick={onRemove}>
          {`Remove ${medicine.name}`}
        </Button>
      </div>
    </li>
  );
}

export default function EventDetailPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const goBack = useGoBack('/history');
  const toast = useToast();
  const dates = useDateFormat();
  const { data: event, isPending, isError, error, refetch } = useEvent(eventId);
  const medicineMutations = useMedicineMutations(eventId);
  const features = useFeatures();
  const uploads = useEventUploads(eventId);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [medicineDialog, setMedicineDialog] = useState({ open: false, medicine: null });
  const [medicineToRemove, setMedicineToRemove] = useState(null);

  usePageTitle(event?.title ?? 'Health event');

  const backButton = (
    <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={goBack} className={styles.back}>
      Back
    </Button>
  );

  if (isPending) {
    return (
      <>
        {backButton}
        <DetailSkeleton />
      </>
    );
  }

  if (isError) {
    const missing = error.status === 404;
    return (
      <>
        {backButton}
        <ErrorState
          title={missing ? 'Health event not found' : 'Unable to load this health event.'}
          error={missing ? { message: 'It may have been deleted.' } : error}
          onRetry={missing ? undefined : refetch}
          action={missing && <Button to="/history">Back to history</Button>}
        />
      </>
    );
  }

  const removeMedicine = async () => {
    try {
      await medicineMutations.remove.mutateAsync(medicineToRemove.id);
      toast.success(`${medicineToRemove.name} removed.`);
      setMedicineToRemove(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <article>
      <div className={styles.toolbar}>
        {backButton}
        <div className={styles.toolbarActions}>
          <Button to={`/events/${event.id}/edit`} variant="secondary" size="sm" icon={Pencil}>
            Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Trash2}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      <header className={styles.header}>
        <p className={styles.issue}>{event.healthIssue}</p>
        <h1 className={styles.title}>{event.title}</h1>
        <p className={styles.dates}>
          {dates.range(event.startDate, event.endDate)}
          <span className={styles.muted}> · {formatDuration(event.startDate, event.endDate)}</span>
        </p>
        <div className={styles.badges}>
          <StatusBadge status={event.status} />
          <SeverityBadge severity={event.severity} />
        </div>
      </header>

      {event.status === 'ongoing' && (
        <div className={styles.ongoingCallout}>
          <p>Feeling better? Record when this ended.</p>
          <Button size="sm" icon={CircleCheck} onClick={() => setResolveOpen(true)}>
            Mark resolved
          </Button>
        </div>
      )}

      <div className={styles.grid}>
        <div className={styles.column}>
          {event.description && (
            <Card title="Description">
              <p className={styles.prose}>{event.description}</p>
            </Card>
          )}
          <Card title="Symptoms">
            {event.symptoms.length ? (
              <ul className={styles.symptoms}>
                {event.symptoms.map((symptom) => (
                  <li key={symptom}>{symptom}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>No symptoms recorded.</p>
            )}
          </Card>
          {event.notes && (
            <Card title="Notes">
              <p className={styles.prose}>{event.notes}</p>
            </Card>
          )}
        </div>

        <div className={styles.column}>
          <Card
            title={`Medicines${event.medicines.length ? ` (${event.medicines.length})` : ''}`}
            action={
              <Button
                variant="ghost"
                size="sm"
                icon={Plus}
                onClick={() => setMedicineDialog({ open: true, medicine: null })}
              >
                Add
              </Button>
            }
          >
            {event.medicines.length ? (
              <ul className={styles.medicines}>
                {event.medicines.map((medicine) => (
                  <MedicineItem
                    key={medicine.id}
                    medicine={medicine}
                    onEdit={() => setMedicineDialog({ open: true, medicine })}
                    onRemove={() => setMedicineToRemove(medicine)}
                  />
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>No medicines recorded.</p>
            )}
          </Card>

          <AttachmentsCard
            eventId={event.id}
            attachments={event.attachments}
            queue={uploads}
            enabled={Boolean(features.data?.attachments)}
          />
        </div>
      </div>

      <p className={styles.meta}>
        Added {dates.date(event.createdAt.slice(0, 10))}
        {event.updatedAt !== event.createdAt && (
          <> · Last updated {dates.date(event.updatedAt.slice(0, 10))}</>
        )}
      </p>

      <DeleteEventDialog
        event={confirmDelete ? event : null}
        onClose={() => setConfirmDelete(false)}
        onDeleted={() => navigate('/history', { replace: true })}
      />
      <MarkResolvedDialog event={event} open={resolveOpen} onClose={() => setResolveOpen(false)} />
      <MedicineDialog
        open={medicineDialog.open}
        eventId={event.id}
        medicine={medicineDialog.medicine}
        defaultStartDate={event.startDate}
        onClose={() => setMedicineDialog({ open: false, medicine: null })}
      />
      <ConfirmDialog
        open={Boolean(medicineToRemove)}
        title={`Remove ${medicineToRemove?.name ?? 'medicine'}?`}
        description="This medicine will be removed from this health event."
        confirmLabel="Remove"
        loading={medicineMutations.remove.isPending}
        onConfirm={removeMedicine}
        onCancel={() => setMedicineToRemove(null)}
      />
    </article>
  );
}
