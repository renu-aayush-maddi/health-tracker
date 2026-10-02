import { ATTACHMENT_TAG_SUGGESTIONS } from '@health-tracker/shared';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { attachmentsService, featuresService } from '../services/attachmentsService.js';
import { dashboardService, eventsService, medicinesService } from '../services/eventsService.js';

export const queryKeys = {
  events: ['events'],
  eventList: (filters) => ['events', 'list', filters],
  event: (eventId) => ['events', 'detail', eventId],
  calendar: (range) => ['events', 'calendar', range],
  issues: ['events', 'issues'],
  dashboard: ['dashboard'],
  medicineNames: (q) => ['medicine-names', q],
};

const PAGE_SIZE = 20;

export function useEventList(filters) {
  return useInfiniteQuery({
    queryKey: queryKeys.eventList(filters),
    queryFn: ({ pageParam, signal }) =>
      eventsService.list({ ...filters, page: pageParam, pageSize: PAGE_SIZE }, { signal }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    placeholderData: keepPreviousData,
  });
}

export function useEvent(eventId) {
  return useQuery({
    queryKey: queryKeys.event(eventId),
    queryFn: ({ signal }) => eventsService.get(eventId, { signal }),
    enabled: Boolean(eventId),
  });
}

export function useCalendarEvents(range) {
  return useQuery({
    queryKey: queryKeys.calendar(range),
    queryFn: ({ signal }) => eventsService.calendar(range, { signal }).then((res) => res.items),
    placeholderData: keepPreviousData,
  });
}

export function useHealthIssues() {
  return useQuery({
    queryKey: queryKeys.issues,
    queryFn: ({ signal }) => eventsService.issues({ signal }).then((res) => res.items),
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: ({ signal }) => dashboardService.get({ signal }),
  });
}

export function useMedicineNames(q) {
  return useQuery({
    queryKey: queryKeys.medicineNames(q),
    queryFn: ({ signal }) => medicinesService.names(q, { signal }).then((res) => res.items),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Any change to an event can affect lists, the calendar, the dashboard and autocomplete. */
function useInvalidateEventData() {
  const queryClient = useQueryClient();
  return (eventId, event) => {
    if (event) queryClient.setQueryData(queryKeys.event(eventId), event);
    queryClient.invalidateQueries({ queryKey: queryKeys.events });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    queryClient.invalidateQueries({ queryKey: ['medicine-names'] });
  };
}

export function useEventMutations() {
  const queryClient = useQueryClient();
  const refresh = useInvalidateEventData();

  return {
    create: useMutation({
      mutationFn: (event) => eventsService.create(event),
      onSuccess: (event) => refresh(event.id, event),
    }),
    update: useMutation({
      mutationFn: ({ eventId, event }) => eventsService.update(eventId, event),
      onSuccess: (event) => refresh(event.id, event),
    }),
    updateStatus: useMutation({
      mutationFn: ({ eventId, status, endDate }) =>
        eventsService.updateStatus(eventId, { status, endDate }),
      onSuccess: (event) => refresh(event.id, event),
    }),
    remove: useMutation({
      mutationFn: (eventId) => eventsService.remove(eventId),
      onSuccess: (_, eventId) => {
        queryClient.removeQueries({ queryKey: queryKeys.event(eventId) });
        refresh();
      },
    }),
  };
}

export function useMedicineMutations(eventId) {
  const refresh = useInvalidateEventData();
  const onSuccess = () => refresh(eventId);
  return {
    add: useMutation({
      mutationFn: (medicine) => medicinesService.add(eventId, medicine),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: ({ medicineId, medicine }) =>
        medicinesService.update(eventId, medicineId, medicine),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: (medicineId) => medicinesService.remove(eventId, medicineId),
      onSuccess,
    }),
  };
}

export function useFeatures() {
  return useQuery({
    queryKey: ['features'],
    queryFn: ({ signal }) => featuresService.get({ signal }),
    staleTime: Infinity,
  });
}

export function useAttachmentMutations(eventId) {
  const refresh = useInvalidateEventData();
  const onSuccess = () => refresh(eventId);
  return {
    upload: useMutation({
      mutationFn: ({ file, onProgress }) =>
        attachmentsService.upload(eventId, file, { onProgress }),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: (attachmentId) => attachmentsService.remove(eventId, attachmentId),
      onSuccess,
    }),
    updateTags: useMutation({
      mutationFn: ({ attachmentId, tags }) =>
        attachmentsService.updateTags(eventId, attachmentId, tags),
      onSuccess,
    }),
  };
}

const RECORDS_PAGE_SIZE = 20;

/** "Records": all of the user's files across events. */
export function useRecords(filters) {
  return useInfiniteQuery({
    queryKey: ['events', 'records', filters],
    queryFn: ({ pageParam, signal }) =>
      attachmentsService.records(
        { ...filters, page: pageParam, pageSize: RECORDS_PAGE_SIZE },
        { signal },
      ),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    placeholderData: keepPreviousData,
  });
}

/** The user's own tags (most used first) followed by the built-in suggestions, without duplicates. */
export function useTagSuggestions() {
  const query = useQuery({
    queryKey: ['events', 'attachment-tags'],
    queryFn: ({ signal }) => attachmentsService.tags({ signal }),
  });
  const own = (query.data ?? []).map((tag) => tag.name);
  const merged = [...own, ...ATTACHMENT_TAG_SUGGESTIONS];
  return {
    ownTags: query.data ?? [],
    suggestions: merged.filter(
      (tag, i) => merged.findIndex((t) => t.toLowerCase() === tag.toLowerCase()) === i,
    ),
  };
}
