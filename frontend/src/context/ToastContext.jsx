import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import styles from './Toast.module.css';

const ToastContext = createContext(null);
const DURATION_MS = { success: 4000, error: 7000 };
const MAX_VISIBLE = 3;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (tone, message) => {
      nextId.current += 1;
      const id = nextId.current;
      setToasts((list) => [...list.slice(-(MAX_VISIBLE - 1)), { id, tone, message }]);
      setTimeout(() => dismiss(id), DURATION_MS[tone]);
    },
    [dismiss],
  );

  const toast = useMemo(
    () => ({
      success: (message) => show('success', message),
      error: (message) => show('error', message),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* The live region stays mounted so screen readers announce toasts as they appear. */}
      <div className={styles.viewport} aria-live="polite" aria-atomic="false">
        {toasts.map(({ id, tone, message }) => {
          const Icon = tone === 'error' ? CircleAlert : CircleCheck;
          return (
            <div
              key={id}
              className={`${styles.toast} ${styles[tone]}`}
              role={tone === 'error' ? 'alert' : 'status'}
            >
              <Icon size={20} aria-hidden="true" className={styles.icon} />
              <p className={styles.message}>{message}</p>
              <button
                type="button"
                className={styles.close}
                onClick={() => dismiss(id)}
                aria-label="Dismiss notification"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
