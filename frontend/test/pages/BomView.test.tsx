import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BomView } from '../../src/pages/BomView.js';
import { useWizardStore } from '../../src/store/wizardStore.js';

const calls = { count: 0 };
vi.mock('../../src/api/client.js', () => ({
  api: {
    bomTree: vi.fn(async (itemId: number, qty: number) => {
      calls.count++;
      return {
        tree: {
          arInvtId: itemId, itemNumber: 'PART-A', description: 'Widget A', rev: '1', itemClass: 'MFG',
          isPurchased: false, qtyRequired: qty, uom: 'ea', level: 0,
          children: [
            { arInvtId: 2, itemNumber: 'SUB', description: 'Sub', rev: '1', itemClass: 'MFG', isPurchased: false, qtyRequired: qty * 2, uom: 'ea', level: 1, children: [] },
            { arInvtId: 3, itemNumber: 'NUT', description: 'Nut', rev: '1', itemClass: 'BUY', isPurchased: true, qtyRequired: qty * 4, uom: 'ea', level: 1, children: [] },
          ],
        },
        stats: { nodeCount: 3, maxDepth: 1, cycleCount: 0 },
      };
    }),
  },
}));

function renderPage() {
  useWizardStore.getState().selectItem({ arInvtId: 1, itemNumber: 'PART-A', description: 'Widget A' });
  useWizardStore.getState().selectSO({ ordDetailId: 11, orderNumber: 'SO1', totalOrdered: 500, cummShipped: 0 });
  useWizardStore.getState().setSelectionFull();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BomView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BomView', () => {
  beforeEach(() => { useWizardStore.getState().reset(); calls.count = 0; });

  it('renders tree with calculated quantities', async () => {
    renderPage();
    await waitFor(() => screen.getByText('PART-A'));
    expect(screen.getByText('SUB')).toBeInTheDocument();
    expect(screen.getByText('NUT')).toBeInTheDocument();
    expect(screen.getByText(/2000 ea/)).toBeInTheDocument();
  });

  it('Refresh button triggers refetch', async () => {
    renderPage();
    await waitFor(() => screen.getByText('PART-A'));
    const before = calls.count;
    await userEvent.click(screen.getByRole('button', { name: /osveži bom/i }));
    await waitFor(() => expect(calls.count).toBeGreaterThan(before));
  });
});
