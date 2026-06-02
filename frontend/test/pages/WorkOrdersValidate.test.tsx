import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
        isPurchased: false, qtyRequired: 5, uom: 'ea', level: 0, workOrders: [],
        children: [
          {
            arInvtId: 2, itemNumber: 'BUY-X', description: 'Buy component', rev: '1', itemClass: 'BUY',
            isPurchased: true, qtyRequired: 5, uom: 'ea', level: 1, workOrders: [], children: [],
          },
        ],
      },
      stats: { nodeCount: 2, maxDepth: 1, cycleCount: 0, totalWorkOrders: 0, itemsWithoutWO: 0 },
    })),
    createPO: vi.fn(async () => ({
      poId: 999, poNo: 'PO-1', approved: true,
      lineItems: [{ arInvtId: 2, quantity: 5, success: true, poDetailId: 5001, releaseId: 7001 }],
    })),
    validateReceipt: vi.fn(async () => ({
      poId: 999,
      warnings: [
        { kind: 'NO_RECIPE', message: '1 stavki nema recept (Roll Inventory Cost).', items: [{ arInvtId: 2, itemNumber: 'BUY-X' }] },
      ],
    })),
    receivePO: vi.fn(async () => ({ poId: 999, receipts: [] })),
    retryReceipts: vi.fn(async () => ({ poId: 999, receipts: [] })),
  },
}));

function renderPage() {
  useWizardStore.getState().selectSO({ salesOrderId: 10, orderNumber: 'SO1', company: 'Acme', customerNumber: 'C-001' });
  useWizardStore.getState().selectLineItem({
    ordDetailId: 11, arInvtId: 1, itemNumber: 'PART-A', description: 'Widget A',
    totalOrdered: 5, cummShipped: 0, remaining: 5,
  });
  useWizardStore.getState().setSelectionFull();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><WorkOrdersPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WorkOrdersPage pre-receive validator panel', () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('auto-validates on PO create, shows the grouped warning, and keeps the receive button enabled', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText('PART-A'));

    await user.click(screen.getByRole('checkbox', { name: /selektuj sve/i }));
    await user.click(screen.getByRole('button', { name: /kreiraj po/i }));

    // Validation fires automatically with the created line items (itemNumber resolved from the BOM).
    await waitFor(() => expect(api.validateReceipt).toHaveBeenCalledWith(999, [
      { arInvtId: 2, itemNumber: 'BUY-X', quantity: 5 },
    ]));

    // The grouped warning message is shown.
    await waitFor(() => screen.getByText(/nema recept/i));

    // Receive button is present and NOT disabled by the panel.
    const receiveBtn = screen.getByRole('button', { name: /prijem na default/i });
    expect(receiveBtn).not.toBeDisabled();

    // Expanding the group reveals the affected item number.
    const details = screen.getByText(/nema recept/i).closest('details');
    expect(details).toBeTruthy();
    expect(details!.textContent).toContain('BUY-X');
  });
});
