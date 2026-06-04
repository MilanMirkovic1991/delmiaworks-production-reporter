import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { WorkOrdersPage } from '../../src/pages/WorkOrders.js';
import { useWizardStore } from '../../src/store/wizardStore.js';
import { api } from '../../src/api/client.js';

vi.mock('../../src/api/client.js', () => ({
  api: {
    workOrderTree: vi.fn(async () => ({
      tree: {
        arInvtId: 1, itemNumber: 'PART-A', description: 'Widget A', rev: '1', itemClass: 'MFG',
        isPurchased: false, qtyRequired: 500, uom: 'ea', level: 0,
        workOrders: [{ workOrderId: 1000, mfgNumber: 'WO-1000', mfgDescrip: '', arInvtId: 1, eplantId: 1, priorityLevel: null, startDate: null, status: '' }],
        children: [
          {
            arInvtId: 2, itemNumber: 'SUB', description: 'Sub', rev: '1', itemClass: 'MFG',
            isPurchased: false, qtyRequired: 1000, uom: 'ea', level: 1,
            workOrders: [{ workOrderId: 2000, mfgNumber: 'WO-2000', mfgDescrip: '', arInvtId: 2, eplantId: 1, priorityLevel: null, startDate: null, status: '' }],
            children: [],
          },
        ],
      },
      stats: { nodeCount: 2, maxDepth: 1, cycleCount: 0, totalWorkOrders: 2, itemsWithoutWO: 0 },
    })),
    reportProductionCascade: vi.fn(),
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
      <MemoryRouter><WorkOrdersPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WorkOrdersPage — cascade production reporting', () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('clicking Prijavi proizvodnju cascades the clicked node subtree and shows a summary', async () => {
    (api.reportProductionCascade as ReturnType<typeof vi.fn>).mockResolvedValue({
      total: 2, succeeded: 2, failed: 0, stoppedOnAuth: false,
      results: [
        { workOrderId: 2000, mfgNumber: 'WO-2000', itemNumber: 'SUB', arInvtId: 2, goodPartsQty: 10, productionHours: 1.1, success: true },
        { workOrderId: 1000, mfgNumber: 'WO-1000', itemNumber: 'PART-A', arInvtId: 1, goodPartsQty: 5, productionHours: 2.2, success: true },
      ],
    });
    renderPage();
    await waitFor(() => screen.getByText('PART-A'));

    const buttons = screen.getAllByRole('button', { name: /pokreni prijavu/i });
    fireEvent.click(buttons[0]!); // root PART-A work order

    await waitFor(() => expect(api.reportProductionCascade).toHaveBeenCalledWith(1, 500));
    await waitFor(() => expect(screen.getByText(/Prijavljeno:\s*2\s*\/\s*2/i)).toBeInTheDocument());
  });

  it('shows a check for reported work orders and the DW message for failed ones', async () => {
    (api.reportProductionCascade as ReturnType<typeof vi.fn>).mockResolvedValue({
      total: 2, succeeded: 1, failed: 1, stoppedOnAuth: false,
      results: [
        { workOrderId: 2000, mfgNumber: 'WO-2000', itemNumber: 'SUB', arInvtId: 2, goodPartsQty: 10, productionHours: 1.1, success: true },
        { workOrderId: 1000, mfgNumber: 'WO-1000', itemNumber: 'PART-A', arInvtId: 1, goodPartsQty: 0, productionHours: 0, success: false, error: 'No recipe card' },
      ],
    });
    renderPage();
    await waitFor(() => screen.getByText('PART-A'));

    fireEvent.click(screen.getAllByRole('button', { name: /pokreni prijavu/i })[0]!);

    await waitFor(() => expect(screen.getByTestId('wo-status-2000')).toHaveTextContent('✓'));
    await waitFor(() => expect(screen.getByTestId('wo-status-1000')).toHaveTextContent(/No recipe card/));
  });
});
