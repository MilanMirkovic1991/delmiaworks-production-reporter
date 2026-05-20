import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ReleasesPage } from '../../src/pages/Releases.js';
import { useWizardStore } from '../../src/store/wizardStore.js';

vi.mock('../../src/api/client.js', () => ({
  api: {
    releasesForSO: vi.fn(async () => ({
      releases: [
        { releaseId: 901, seq: 1, qty: 200, requestDate: null, promiseDate: null },
        { releaseId: 902, seq: 2, qty: 300, requestDate: null, promiseDate: null },
      ],
    })),
  },
}));

function renderPage() {
  useWizardStore.getState().selectItem({ arInvtId: 1, itemNumber: 'PART-A', description: 'd' });
  useWizardStore.getState().selectSO({ ordDetailId: 11, orderNumber: 'SO1', totalOrdered: 500, cummShipped: 100 });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ReleasesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReleasesPage', () => {
  beforeEach(() => useWizardStore.getState().reset());

  it('defaults to Puna kolicina = TotalOrdered (500)', async () => {
    renderPage();
    await waitFor(() => screen.getByLabelText(/puna koli/i));
    expect(screen.getByLabelText(/puna koli/i)).toBeChecked();
    expect(screen.getByTestId('final-qty').textContent).toBe('500');
  });

  it('switching to release mode sums checked release qtys', async () => {
    renderPage();
    await waitFor(() => screen.getByLabelText(/release-ove/i));
    await userEvent.click(screen.getByLabelText(/release-ove/i));
    await waitFor(() => screen.getByLabelText(/Release #901/));
    await userEvent.click(screen.getByLabelText(/Release #901/));
    expect(screen.getByTestId('final-qty').textContent).toBe('200');
    await userEvent.click(screen.getByLabelText(/Release #902/));
    expect(screen.getByTestId('final-qty').textContent).toBe('500');
  });

  it('Dalje is disabled when no releases checked in release mode', async () => {
    renderPage();
    await waitFor(() => screen.getByLabelText(/release-ove/i));
    await userEvent.click(screen.getByLabelText(/release-ove/i));
    expect(screen.getByRole('button', { name: /dalje/i })).toBeDisabled();
  });
});
