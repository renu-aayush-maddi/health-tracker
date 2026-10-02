import { useState } from 'react';
import { CircleAlert, Download, FileText, Image as ImageIcon, Tag, Trash2, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext.jsx';
import { useDateFormat } from '../../hooks/useDateFormat.js';
import { useAttachmentMutations } from '../../hooks/useHealthEvents.js';
import { attachmentsService } from '../../services/attachmentsService.js';
import { formatBytes, isImage, MAX_FILE_MB } from '../../utils/files.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import { TagList } from '../ui/TagInput.jsx';
import EditTagsDialog from './EditTagsDialog.jsx';
import FilePicker from './FilePicker.jsx';
import ImagePreviewDialog from './ImagePreviewDialog.jsx';
import styles from './Attachments.module.css';

function FileIcon({ contentType }) {
  const Icon = isImage(contentType) ? ImageIcon : FileText;
  return (
    <span className={styles.icon} aria-hidden="true">
      <Icon size={18} />
    </span>
  );
}

/**
 * "Records & files" on the event page: optional photos/PDFs of prescriptions, lab reports, scans.
 * Supports picking or dropping files, shows upload progress, and previews images in place.
 */
export default function AttachmentsCard({ eventId, attachments, queue, enabled }) {
  const dates = useDateFormat();
  const toast = useToast();
  const { remove } = useAttachmentMutations(eventId);
  const [preview, setPreview] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [toTag, setToTag] = useState(null);
  const [dragging, setDragging] = useState(false);

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(toDelete.id);
      toast.success('File deleted.');
      setToDelete(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const dropProps = enabled
    ? {
        onDragOver: (event) => {
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (event) => {
          event.preventDefault();
          setDragging(false);
          queue.enqueue([...event.dataTransfer.files]);
        },
      }
    : {};

  const empty = attachments.length === 0 && queue.items.length === 0;

  return (
    <Card
      title={`Records & files${attachments.length ? ` (${attachments.length})` : ''}`}
      action={enabled && <FilePicker onFiles={queue.enqueue} label="Add" variant="ghost" />}
      className={dragging ? styles.dragging : ''}
      {...dropProps}
    >
      {!enabled && <p className={styles.muted}>File uploads aren’t available on this server.</p>}
      {enabled && empty && (
        <p className={styles.muted}>
          Optional: attach photos of prescriptions, lab reports or scans. JPG, PNG, WebP, HEIC or
          PDF, up to {MAX_FILE_MB} MB each.
        </p>
      )}

      {(attachments.length > 0 || queue.items.length > 0) && (
        <ul className={styles.list}>
          {attachments.map((file) => (
            <li key={file.id} className={styles.item}>
              <FileIcon contentType={file.contentType} />
              <div className={styles.body}>
                {file.previewable ? (
                  <button
                    type="button"
                    className={styles.name}
                    title={file.filename}
                    onClick={() => setPreview(file)}
                  >
                    {file.filename}
                  </button>
                ) : (
                  <a
                    className={styles.name}
                    title={file.filename}
                    href={attachmentsService.contentUrl(eventId, file.id)}
                    target="_blank"
                    rel="noopener"
                  >
                    {file.filename}
                    <span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                )}
                <p className={styles.meta}>
                  {formatBytes(file.size)} · Added {dates.date(file.createdAt.slice(0, 10))}
                </p>
                <TagList tags={file.tags} className={styles.tags} />
              </div>
              <div className={styles.actions}>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Tag}
                  iconOnly
                  onClick={() => setToTag(file)}
                >
                  {`Edit tags for ${file.filename}`}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Download}
                  iconOnly
                  href={attachmentsService.contentUrl(eventId, file.id, { download: true })}
                >
                  {`Download ${file.filename}`}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  iconOnly
                  onClick={() => setToDelete(file)}
                >
                  {`Delete ${file.filename}`}
                </Button>
              </div>
            </li>
          ))}

          {queue.items.map((item) => (
            <li
              key={item.id}
              className={`${styles.item} ${item.status === 'error' ? styles.failed : ''}`}
            >
              {item.status === 'error' ? (
                <span className={`${styles.icon} ${styles.errorIcon}`} aria-hidden="true">
                  <CircleAlert size={18} />
                </span>
              ) : (
                <FileIcon contentType={item.file.type} />
              )}
              <div className={styles.body}>
                <p className={styles.nameText}>{item.file.name}</p>
                {item.status === 'error' ? (
                  <p className={styles.error} role="alert">
                    {item.error}
                  </p>
                ) : (
                  <progress
                    className={styles.progress}
                    value={item.status === 'queued' ? 0 : item.progress}
                    max={1}
                    aria-label={`Uploading ${item.file.name}`}
                  />
                )}
              </div>
              {item.status === 'error' && (
                <div className={styles.actions}>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={X}
                    iconOnly
                    onClick={() => queue.dismiss(item.id)}
                  >
                    {`Dismiss error for ${item.file.name}`}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ImagePreviewDialog eventId={eventId} attachment={preview} onClose={() => setPreview(null)} />
      <EditTagsDialog eventId={eventId} attachment={toTag} onClose={() => setToTag(null)} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete this file?"
        description={toDelete ? `"${toDelete.filename}" will be permanently deleted.` : undefined}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </Card>
  );
}
