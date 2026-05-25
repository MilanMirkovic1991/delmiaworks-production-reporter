import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SalesOrdersList } from '../../src/pages/SalesOrdersList.js';
import { useWizardStore } from '../../src/store/wizardStore.js';

vi.mock('../../src/api/client.js', () => ({
  api: {
    listSalesOrders: vi.fn(async () => ({
      salesOrders: [
        {
          salesOrderId: 1, orderNumber: 'SO1001', customerNumber: 'C001',
          company: 'Acme Corp', poNumber: 'PO-99', dateTaken: '2025-01-15T00:00:00',
          status: 'Open', lineCount: 3, totalOrdered: 600, totalShipped: 200, totalRemaining: 400,
        },
      ],
    })),
  },
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SalesOrdersList />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SalesOrdersList', () => {
  beforeEach(() => useWizardStore.getState().reset());

  it('lists sales orders and clicking one advances to step 2', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('SO1001')).toBeInTheDocument());
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    await userEvent.click(screen.getByText('SO1001'));
    expect(useWizardStore.getState().selectedSO?.salesOrderId).toBe(1);
    expect(useWizardStore.getState().selectedSO?.orderNumber).toBe('SO1001');
    expect(useWizardStore.getState().step).toBe(2);
  });
});
