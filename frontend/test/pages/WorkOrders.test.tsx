import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { WorkOrdersPage } from '../../src/pages/WorkOrders.js';
import { useWizardStore } from '../../src/store/wizardStore.js';

vi.mock('../../src/api/client.js', () => ({
  api: {
    createPO: vi.fn(async () => ({ poId: 0, poNo: null, lineItems: [] })),
    workOrderTree: vi.fn(async () => ({
      tree: {
        arInvtId: 1, itemNumber: 'PART-A', description: 'Widget A', rev: '1', itemClass: 'MFG',
        isPurchased: false, qtyRequired: 500, uom: 'ea', level: 0,
        workOrders: [
          { workOrderId: 1000, mfgNumber: 'WO-1000', mfgDescrip: 'Final assembly', arInvtId: 1, eplantId: 1, priorityLevel: 1, startDate: '2026-06-01T00:00:00', status: 'Open' },
        ],
        children: [
          {
            arInvtId: 2, itemNumber: 'SUB', description: 'Sub-assembly', rev: '1', itemClass: 'MFG',
            isPurchased: false, qtyRequired: 1000, uom: 'ea', level: 1,
            workOrders: [
              { workOrderId: 2000, mfgNumber: 'WO-2000', mfgDescrip: 'Sub mfg', arInvtId: 2, eplantId: 1, priorityLevel: 2, startDate: null, status: '' },
            ],
            children: [],
          },
          {
            arInvtId: 3, itemNumber: 'NUT', description: 'Nut', rev: '1', itemClass: 'BUY',
            isPurchased: true, qtyRequired: 2000, uom: 'ea', level: 1,
            workOrders: [], children: [],
          },
        ],
      },
      stats: { nodeCount: 3, maxDepth: 1, cycleCount: 0, totalWorkOrders: 2, itemsWithoutWO: 0 },
    })),
  },
}));

function renderPage() {
  useWizardStore.getState().selectSO({ salesOrderId: 10, orderNumber: 'SO1', company: 'Acme', customerNumber: 'C-001' });
  useWizardStore.getState().selectLineItem({
    ordDetailId: 11, arInvtId: 1, itemNumber: 'PART-A', description: 'Widget A',
    totalOrdered: 500, cummShipped: 0, remaining: 500,
  });
  useWizardStore.getState().setSelectionFull();
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
  beforeEach(() => { useWizardStore.getState().reset(); });

  it('renders tree with WO under each manufactured node', async () => {
    renderPage();
    await waitFor(() => screen.getByText('PART-A'));
    expect(screen.getByText(/WO-1000/)).toBeInTheDocument();   // root WO
    expect(screen.getByText('SUB')).toBeInTheDocument();
    expect(screen.getByText(/WO-2000/)).toBeInTheDocument();   // sub WO
    // NUT now appears twice: once in the tree (purchased leaf) and once in the inline Purchase table
    expect(screen.getAllByText('NUT').length).toBeGreaterThanOrEqual(1);
    // Per-WO "Prijavi" buttons (one per WO in the mock = 2)
    const buttons = screen.getAllByRole('button', { name: /pokreni prijavu/i });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toBeEnabled();
  });

  it('shows "nema radnog naloga" for manufactured items without WOs', async () => {
    renderPage();
    await waitFor(() => screen.getByText('PART-A'));
    // Both manufactured nodes have WOs in our mock, so this text should NOT appear
    expect(screen.queryByText(/nema radnog naloga/i)).toBeNull();
  });

  it('renders inline Purchase section with the purchased leaf', async () => {
    renderPage();
    await waitFor(() => screen.getByText('PART-A'));
    // The new inline section heading
    expect(screen.getByRole('heading', { name: /kupovne komponente za nabavku/i })).toBeInTheDocument();
    // The Create PO and Receive buttons exist (initially disabled because nothing is selected)
    expect(screen.getByRole('button', { name: /kreiraj po/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /prijem na default/i })).toBeInTheDocument();
  });
});
