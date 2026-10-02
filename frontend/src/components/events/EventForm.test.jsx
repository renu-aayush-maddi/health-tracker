import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import EventForm from './EventForm.jsx';
import { emptyEventValues } from './eventFormValues.js';

vi.mock('../../services/eventsService.js', () => ({
  medicinesService: { names: vi.fn().mockResolvedValue({ items: [] }) },
}));
vi.mock('../../services/attachmentsService.js', () => ({
  featuresService: { get: vi.fn().mockResolvedValue({ attachments: false }) },
  attachmentsService: {},
}));

function renderForm(onSubmit = vi.fn()) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <EventForm
          initialValues={emptyEventValues({ startDate: '2026-10-01' })}
          submitLabel="Save event"
          onSubmit={onSubmit}
          onCancel={() => {}}
        />
      ),
    },
  ]);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe('EventForm', () => {
  it('requires a health issue and title before saving', async () => {
    const { onSubmit, user } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Save event' }));
    expect(await screen.findByText('Health issue is required.')).toBeInTheDocument();
    expect(screen.getByText('Title is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects an end date before the start date', async () => {
    const { onSubmit, user } = renderForm();
    await user.click(screen.getByRole('radio', { name: 'Fever' }));
    await user.click(screen.getByRole('switch', { name: 'Still ongoing' }));
    const ended = screen.getByLabelText(/Ended/);
    await user.clear(ended);
    await user.type(ended, '2026-09-25');
    await user.click(screen.getByRole('button', { name: 'Save event' }));
    expect(
      await screen.findByText('End date cannot be earlier than start date.'),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits clean data, auto-filling the title and including medicines', async () => {
    const { onSubmit, user } = renderForm();
    await user.click(screen.getByRole('radio', { name: 'Headache' }));
    await user.type(screen.getByRole('textbox', { name: 'Symptoms' }), 'Nausea{Enter}');
    await user.click(screen.getByRole('button', { name: 'Add medicine' }));
    const medicine = screen.getByRole('group', { name: 'Medicine 1' });
    await user.type(within(medicine).getByLabelText(/Medicine name/), 'Ibuprofen');
    await user.type(within(medicine).getByLabelText('Dosage'), '400 mg');
    await user.click(screen.getByRole('button', { name: 'Save event' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      title: 'Headache',
      healthIssue: 'Headache',
      startDate: '2026-10-01',
      endDate: null,
      status: 'ongoing',
      severity: null,
      symptoms: ['Nausea'],
      medicines: [{ name: 'Ibuprofen', dosage: '400 mg', frequency: null }],
    });
    expect(onSubmit.mock.calls[0][0].medicines[0]).not.toHaveProperty('key');
  });
});
