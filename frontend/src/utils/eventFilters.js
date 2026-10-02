export const EMPTY_FILTERS = {
  q: '',
  healthIssue: '',
  status: '',
  severity: '',
  from: '',
  to: '',
  sort: 'start_desc',
};

const FILTER_KEYS = ['healthIssue', 'status', 'severity', 'from', 'to'];

/** Number of active filters (search text and sort order don't count). */
export const countActiveFilters = (filters) => FILTER_KEYS.filter((key) => filters[key]).length;
