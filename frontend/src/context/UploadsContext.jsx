import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from './ToastContext.jsx';
import { attachmentsService } from '../services/attachmentsService.js';
import { checkFile } from '../utils/files.js';

const UploadsContext = createContext(null);
let nextId = 0;

/**
 * App-wide upload manager. Uploads run one at a time and keep going while the user moves around
 * the app. items: [{ id, eventId, file, status: 'queued' | 'uploading' | 'error', progress, error }].
 * Finished uploads leave the list (they then appear in the event's attachments).
 */
export function UploadsProvider({ children }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const pending = useRef([]);
  const running = useRef(false);

  const update = useCallback(
    (id, patch) =>
      setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item))),
    [],
  );

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    let uploaded = 0;
    while (pending.current.length) {
      const item = pending.current.shift();
      update(item.id, { status: 'uploading' });
      try {
        await attachmentsService.upload(item.eventId, item.file, {
          onProgress: (progress) => update(item.id, { progress }),
          fields: item.tags.length ? { tags: JSON.stringify(item.tags) } : undefined,
        });
        uploaded += 1;
        setItems((list) => list.filter((i) => i.id !== item.id));
        queryClient.invalidateQueries({ queryKey: ['events'] });
      } catch (err) {
        update(item.id, { status: 'error', error: err.fields?.file ?? err.message });
      }
    }
    running.current = false;
    if (uploaded) toast.success(uploaded === 1 ? 'File uploaded.' : `${uploaded} files uploaded.`);
  }, [queryClient, toast, update]);

  const enqueue = useCallback(
    (eventId, files) => {
      // Accepts File objects or { file, tags } entries.
      const added = files.map((entry) => {
        const { file, tags = [] } = entry instanceof File ? { file: entry } : entry;
        nextId += 1;
        const problem = checkFile(file);
        return {
          id: nextId,
          eventId,
          file,
          tags,
          progress: 0,
          status: problem ? 'error' : 'queued',
          error: problem,
        };
      });
      setItems((list) => [...list, ...added]);
      pending.current.push(...added.filter((item) => item.status === 'queued'));
      run();
    },
    [run],
  );

  const dismiss = useCallback(
    (id) => setItems((list) => list.filter((item) => item.id !== id)),
    [],
  );
  const busy = items.some((i) => i.status === 'queued' || i.status === 'uploading');

  // Closing the tab mid-upload would lose the remaining files: let the browser ask first.
  useEffect(() => {
    if (!busy) return undefined;
    const warn = (event) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const value = useMemo(() => ({ items, enqueue, dismiss, busy }), [items, enqueue, dismiss, busy]);
  return <UploadsContext.Provider value={value}>{children}</UploadsContext.Provider>;
}

/** The upload queue for one event, in the shape the files card expects. */
// eslint-disable-next-line react-refresh/only-export-components
export function useEventUploads(eventId) {
  const context = useContext(UploadsContext);
  if (!context) throw new Error('useEventUploads must be used inside <UploadsProvider>');
  const items = context.items.filter((item) => item.eventId === eventId);
  return {
    items,
    busy: items.some((i) => i.status === 'queued' || i.status === 'uploading'),
    enqueue: (files) => context.enqueue(eventId, files),
    dismiss: context.dismiss,
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUploads() {
  const context = useContext(UploadsContext);
  if (!context) throw new Error('useUploads must be used inside <UploadsProvider>');
  return context;
}
