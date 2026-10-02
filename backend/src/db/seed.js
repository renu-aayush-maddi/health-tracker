// Development-only demo data: `npm run seed`. Recreates demo@example.com with sample events
// spread over the last few months (relative to today, so the calendar always has content).
import { fileURLToPath } from 'node:url';
import { config } from '../config/env.js';
import { hashPassword } from '../utils/passwords.js';
import { createEvent } from '../modules/healthEvents/healthEvent.service.js';
import { pool, query } from './pool.js';

export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'demo-password-123';

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
};

const resolved = (start, end) => ({
  startDate: daysAgo(start),
  endDate: daysAgo(end),
  status: 'resolved',
});
const ongoing = (start) => ({ startDate: daysAgo(start), endDate: null, status: 'ongoing' });

const EVENTS = [
  {
    title: 'Fever after travel',
    healthIssue: 'Fever',
    severity: 'moderate',
    ...resolved(4, 2),
    description: 'Temperature spiked in the evenings after the train journey.',
    symptoms: ['Body pain', 'Headache', 'High temperature'],
    medicines: [
      {
        name: 'Paracetamol',
        dosage: '500 mg',
        frequency: 'Twice a day',
        startDate: daysAgo(4),
        endDate: daysAgo(2),
        notes: 'Taken after food',
      },
    ],
    notes: 'Drank lots of fluids. Felt fine by the third day.',
  },
  {
    title: 'Head cold',
    healthIssue: 'Cold',
    severity: 'mild',
    ...ongoing(6),
    symptoms: ['Runny nose', 'Sneezing'],
    medicines: [{ name: 'Cetirizine', dosage: '10 mg', frequency: 'At bedtime' }],
  },
  {
    title: 'Tension headache',
    healthIssue: 'Headache',
    severity: 'mild',
    ...resolved(12, 12),
    symptoms: ['Neck stiffness'],
    medicines: [],
  },
  {
    title: 'Food poisoning',
    healthIssue: 'Food Poisoning',
    severity: 'severe',
    ...resolved(15, 13),
    description: 'After eating out. Nausea and stomach cramps.',
    symptoms: ['Nausea', 'Stomach cramps', 'Dehydration'],
    medicines: [
      { name: 'ORS', dosage: '1 sachet', frequency: 'After each episode' },
      { name: 'Ondansetron', dosage: '4 mg', frequency: 'As needed' },
    ],
  },
  {
    title: 'Lower back pain',
    healthIssue: 'Back Pain',
    severity: 'moderate',
    ...resolved(14, 9),
    symptoms: ['Stiffness in the morning'],
    medicines: [{ name: 'Ibuprofen', dosage: '400 mg', frequency: 'Twice a day' }],
  },
  {
    title: 'Migraine',
    healthIssue: 'Migraine',
    severity: 'severe',
    ...resolved(20, 19),
    symptoms: ['Light sensitivity', 'Aura'],
    medicines: [{ name: 'Sumatriptan', dosage: '50 mg', frequency: 'Once' }],
  },
  {
    title: 'Seasonal allergy',
    healthIssue: 'Allergy',
    severity: 'mild',
    ...resolved(40, 30),
    symptoms: ['Itchy eyes'],
    medicines: [{ name: 'Cetirizine', dosage: '10 mg', frequency: 'Once a day' }],
  },
  {
    title: 'Sore throat',
    healthIssue: 'Sore Throat',
    severity: null,
    ...resolved(33, 31),
    medicines: [],
  },
  {
    title: 'Flu',
    healthIssue: 'Flu',
    severity: 'moderate',
    ...resolved(62, 56),
    symptoms: ['Chills', 'Fatigue'],
    medicines: [{ name: 'Paracetamol', dosage: '650 mg', frequency: 'Every 6 hours' }],
  },
  {
    title: 'Ear infection',
    healthIssue: 'Ear infection',
    severity: 'moderate',
    ...resolved(75, 68),
    medicines: [
      {
        name: 'Amoxicillin',
        dosage: '500 mg',
        frequency: 'Three times a day',
        notes: 'Full 7-day course',
      },
    ],
  },
  {
    title: 'Headache',
    healthIssue: 'Headache',
    severity: 'mild',
    ...resolved(80, 80),
    medicines: [],
  },
];

export async function seed() {
  if (config.isProduction) throw new Error('Refusing to seed demo data in production.');
  await query('DELETE FROM users WHERE email = $1', [DEMO_EMAIL]);
  const { rows } = await query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    ['Demo User', DEMO_EMAIL, await hashPassword(DEMO_PASSWORD)],
  );
  for (const event of EVENTS) {
    await createEvent(rows[0].id, {
      description: null,
      notes: null,
      severity: null,
      symptoms: [],
      ...event,
      medicines: event.medicines.map((m) => ({
        dosage: null,
        frequency: null,
        startDate: null,
        endDate: null,
        notes: null,
        ...m,
      })),
    });
  }
  console.log(`Seeded ${EVENTS.length} events for ${DEMO_EMAIL} (password: ${DEMO_PASSWORD})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(err.message);
      await pool.end();
      process.exit(1);
    });
}
