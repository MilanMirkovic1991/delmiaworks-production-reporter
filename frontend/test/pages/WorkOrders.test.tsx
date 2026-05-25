import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { WorkOrdersPage } from '../../src/pages/WorkOrders.js';
import { useWizardStore } from '../../src/store/wizardStore.js';

vi.mock('../../src/api/client.js', () => ({
  api: {
    workOrdersForPart: vi.fn(async () => ({
      workOrders: [
        {
          workOrderId: 101, mfgNumber: 'WO-2025-001', mfgDescrip: 'Widget A Production',
          arInvtId: 1, eplantId: 1, priorityLevel: 2, startDate: '2025-06-01T00:00:00', status: 'Released',
        },
      ],
    })),
  },
}));

function renderPage() {
  useWizardStore.getState().selectSO({
    salesOrderId: 42, orderNumber: 'SO1001', company: 'Acme Corp', customerNumber: 'C001',
  });
  useWizardStore.getState().selectLineItem({
    ordDetailId: 11, arInvtId: 1, itemNumber: 'PART-A', description: 'Widget A',
    totalOrdered: 500, cummShipped: 0, remaining: 500,
  });
  // finalQty is set to 500 by selectLineItem
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <WorkOrdersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WorkOrdersPage', () => {
  beforeEach(() => useWizardStore.getState().reset());

  it('lists work orders and renders the start-reporting button', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('WO-2025-001')).toBeInTheDocument());
    expect(screen.getByText('Widget A Production')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pokreni prijavu/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pokreni prijavu/i })).not.toBeDisabled();
  });
});
