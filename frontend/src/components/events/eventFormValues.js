import { HEALTH_ISSUES } from '@health-tracker/shared';
import { todayISO } from '../../utils/dates.js';

let keyCounter = 0;
/** Stable React key for medicine rows that don't have a server id yet. Stripped by validation. */
const newKey = () => `new-${(keyCounter += 1)}`;

export function emptyMedicine(startDate = '') {
  return { key: newKey(), name: '', dosage: '', frequency: '', startDate, endDate: '', notes: '' };
}

export function emptyEventValues({ startDate = todayISO() } = {}) {
  return {
    title: '',
    healthIssue: '',
    description: '',
    startDate,
    endDate: '',
    status: 'ongoing',
    severity: '',
    symptoms: [],
    notes: '',
    medicines: [],
    files: [], // File objects to upload after saving (not part of the event payload)
  };
}

/** API event → form values (inputs need strings, not nulls). */
export function eventToFormValues(event) {
  return {
    title: event.title,
    healthIssue: event.healthIssue,
    description: event.description ?? '',
    startDate: event.startDate,
    endDate: event.endDate ?? '',
    status: event.status,
    severity: event.severity ?? '',
    symptoms: event.symptoms,
    notes: event.notes ?? '',
    medicines: event.medicines.map((m) => ({
      key: m.id,
      id: m.id,
      name: m.name,
      dosage: m.dosage ?? '',
      frequency: m.frequency ?? '',
      startDate: m.startDate ?? '',
      endDate: m.endDate ?? '',
      notes: m.notes ?? '',
    })),
    files: [],
  };
}

export const isPresetIssue = (issue) => HEALTH_ISSUES.includes(issue);
