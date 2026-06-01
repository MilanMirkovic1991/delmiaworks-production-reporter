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
    receivePO: vi.fn(async () => ({
      poId: 999,
      receipts: [{
        poDetailId: 5001, poReleaseId: 7001, arInvtId: 1, itemNumber: 'PART-A', qtyReceived: 5,
        success: false, poReceiptId: 9001,
        error: 'PostPOReceiptAndUpdateMasterLabel failed: boom',
      }],
    })),
    retryReceipts: vi.fn(async () => ({
      poId: 999,
      receipts: [{
        poDetailId: 5001, poReleaseId: 7001, arInvtId: 1, itemNumber: 'PART-A', qtyReceived: 5,
        success: true, poReceiptId: 9001, lotNo: 1, serialNo: '0000001', fgMultiId: 4001, masterLabelId: 8001,
      }],
    })),
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

describe('WorkOrdersPage retry flow', () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('shows a "Ponovi" button on a failed row, retries it, and turns it into a success', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText('PART-A'));

    // Select the purchased component so the "Kreiraj PO" button enables.
    await user.click(screen.getByRole('checkbox', { name: /selektuj sve/i }));

    // Create the PO, then receive it (both behind confirm() which we stubbed true).
    await user.click(screen.getByRole('button', { name: /kreiraj po/i }));
    await user.click(await screen.findByRole('button', { name: /prijem na default/i }));

    // The failed row must expose a per-row "Ponovi" button and the batch button.
    const retryBtn = await screen.findByRole('button', { name: /^ponovi$/i });
    expect(retryBtn).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ponovi sve neuspele/i })).toBeInTheDocument();

    // Click "Ponovi" → api.retryReceipts called with the carried poReceiptId + priorError.
    await user.click(retryBtn);
    await waitFor(() => expect(api.retryReceipts).toHaveBeenCalledWith(999, [
      expect.objectContaining({ poDetailId: 5001, poReleaseId: 7001, poReceiptId: 9001, priorError: 'PostPOReceiptAndUpdateMasterLabel failed: boom' }),
    ]));

    // Row becomes success: no more "Ponovi", no more batch button.
    await waitFor(() => expect(screen.queryByRole('button', { name: /^ponovi$/i })).toBeNull());
    expect(screen.queryByRole('button', { name: /ponovi sve neuspele/i })).toBeNull();
  });
});
