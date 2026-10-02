import { Download, ExternalLink } from 'lucide-react';
import { attachmentsService } from '../../services/attachmentsService.js';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';
import styles from './Attachments.module.css';

export default function ImagePreviewDialog({ eventId, attachment, onClose }) {
  const open = Boolean(attachment);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title={attachment?.filename ?? 'Preview'}
      footer={
        attachment && (
          <>
            <Button
              variant="secondary"
              icon={ExternalLink}
              href={attachmentsService.contentUrl(eventId, attachment.id)}
              target="_blank"
              rel="noopener"
            >
              Open in new tab
            </Button>
            <Button
              icon={Download}
              href={attachmentsService.contentUrl(eventId, attachment.id, { download: true })}
            >
              Download
            </Button>
          </>
        )
      }
    >
      {attachment && (
        <img
          className={styles.preview}
          src={attachmentsService.contentUrl(eventId, attachment.id)}
          alt={`Uploaded file ${attachment.filename}`}
        />
      )}
    </Dialog>
  );
}
