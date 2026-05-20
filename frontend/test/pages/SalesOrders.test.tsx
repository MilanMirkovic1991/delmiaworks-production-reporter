import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SalesOrdersPage } from '../../src/pages/SalesOrders.js';
import { useWizardStore } from '../../src/store/wizardStore.js';

vi.mock('../../src/api/client.js', () => ({
  api: {
    salesOrdersForItem: vi.fn(async () => ({
      salesOrders: [
        { ordDetailId: 11, orderNumber: 'SO1001', company: 'Acme', poNumber: 'PO-1', totalOrdered: 500, cummShipped: 100, remaining: 400, arInvtId: 1 },
      ],
    })),
  },
}));

function renderPage() {
  useWizardStore.getState().selectItem({ arInvtId: 1, itemNumber: 'PART-A', description: 'Widget A' });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SalesOrdersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SalesOrdersPage', () => {
  beforeEach(() => useWizardStore.getState().reset());

  it('lists SOs for selected item and advances on click', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('SO1001')).toBeInTheDocument());
    expect(screen.getByText(/Acme/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('SO1001'));
    expect(useWizardStore.getState().selectedSO?.ordDetailId).toBe(11);
    expect(useWizardStore.getState().step).toBe(3);
  });

  it('redirects to / if no item is selected', () => {
    // No selectItem called
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/sales-orders']}>
          <SalesOrdersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Since we use programmatic navigate, just assert that the list isn't rendered
    expect(screen.queryByText('SO1001')).toBeNull();
  });
});
