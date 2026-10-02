import { useAuth } from '../context/AuthContext.jsx';
import { DEFAULT_DATE_FORMAT, formatDate, formatDateRange } from '../utils/dates.js';

/** Date formatters that follow the user's date-format preference. */
export function useDateFormat() {
  const { user } = useAuth();
  const pattern = user?.preferences?.dateFormat ?? DEFAULT_DATE_FORMAT;
  return {
    pattern,
    date: (iso) => formatDate(iso, pattern),
    range: (start, end) => formatDateRange(start, end, pattern),
  };
}
