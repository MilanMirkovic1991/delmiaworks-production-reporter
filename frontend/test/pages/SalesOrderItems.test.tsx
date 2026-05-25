import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SalesOrderItems } from '../../src/pages/SalesOrderItems.js';
import { useWizardStore } from '../../src/store/wizardStore.js';

vi.mock('../../src/api/client.js', () => ({
  api: {
    salesOrderLineItems: vi.fn(async () => ({
      lineItems: [
        {
          ordDetailId: 11, arInvtId: 1, itemNumber: 'PART-A', description: 'Widget A',
          rev: '1', itemClass: 'MFG', totalOrdered: 500, cummShipped: 100, remaining: 400, uom: 'ea',
        },
      ],
    })),
  },
}));

function renderPage() {
  useWizardStore.getState().selectSO({
    salesOrderId: 42, orderNumber: 'SO1001', company: 'Acme Corp', customerNumber: 'C001',
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SalesOrderItems />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SalesOrderItems', () => {
  beforeEach(() => useWizardStore.getState().reset());

  it('lists line items and clicking one advances to step 3', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('PART-A')).toBeInTheDocument());
    expect(screen.getByText('Widget A')).toBeInTheDocument();
    await userEvent.click(screen.getByText('PART-A'));
    expect(useWizardStore.getState().selectedLineItem?.ordDetailId).toBe(11);
    expect(useWizardStore.getState().selectedLineItem?.itemNumber).toBe('PART-A');
    expect(useWizardStore.getState().step).toBe(3);
  });
});
