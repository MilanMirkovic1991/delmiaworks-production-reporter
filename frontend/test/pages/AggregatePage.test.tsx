import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AggregatePage } from '../../src/pages/AggregatePage.js';
import { useWizardStore } from '../../src/store/wizardStore.js';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigateMock }));
vi.mock('../../src/api/client.js', () => ({
  api: {
    // SO 1 orders 50 of PART-A; SO 2 orders 40 of PART-A -> plan sums to 90
    salesOrderLineItems: vi.fn(async (soId: number) => ({
      lineItems: [{
        ordDetailId: soId * 10 + 1, arInvtId: 1, itemNumber: 'PART-A', description: 'Widget A',
        rev: '1', itemClass: 'MFG', totalOrdered: soId === 1 ? 50 : 40, cummShipped: 0,
        remaining: soId === 1 ? 50 : 40, uom: 'ea',
      }],
    })),
    releasesForSO: vi.fn(async () => ({ releases: [] })),
  },
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><AggregatePage /></MemoryRouter></QueryClientProvider>);
}

describe('AggregatePage', () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
    vi.clearAllMocks();
    useWizardStore.getState().setSelectedSOs([
      { salesOrderId: 1, orderNumber: 'SO1', company: 'Acme' },
      { salesOrderId: 2, orderNumber: 'SO2', company: 'Beta' },
    ]);
  });

  it('sums the same part across selected sales orders (full mode) and proceeds', async () => {
    renderPage();
    // both SOs load their PART-A line item
    await waitFor(() => expect(screen.getAllByText('PART-A').length).toBeGreaterThanOrEqual(2));
    // plan aggregates PART-A to 50 + 40 = 90
    await waitFor(() => expect(screen.getByTestId('plan-1')).toHaveTextContent('90'));

    await userEvent.click(screen.getByRole('button', { name: /Dalje/ }));
    const plan = useWizardStore.getState().producePlan;
    expect(plan).toEqual([{ arInvtId: 1, itemNumber: 'PART-A', description: 'Widget A', qty: 90 }]);
    expect(navigateMock).toHaveBeenCalledWith('/produce');
  });
});
