import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import styles from './Dialog.module.css';

/**
 * Modal built on the native <dialog> element: the browser handles focus trapping, the Escape key,
 * the top layer and making the rest of the page inert. `open` stays the single source of truth.
 * Mark the control that should receive focus on open with `data-autofocus`.
 */
export default function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  busy = false,
  size = 'sm',
}) {
  const ref = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Prefer an explicitly marked control (e.g. "Cancel" on destructive confirmations).
      dialog.querySelector('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const requestClose = () => {
    if (!busy) onClose();
  };

  return (
    <dialog
      ref={ref}
      className={`${styles.dialog} ${styles[size]}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault(); // Escape: let React state decide
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) requestClose(); // backdrop click
      }}
    >
      {open && (
        <div className={styles.panel}>
          <header className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <button
              type="button"
              className={styles.close}
              onClick={requestClose}
              aria-label="Close"
              disabled={busy}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          {description && (
            <p id={descriptionId} className={styles.description}>
              {description}
            </p>
          )}
          {children && <div className={styles.body}>{children}</div>}
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
