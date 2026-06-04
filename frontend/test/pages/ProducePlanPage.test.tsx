import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProducePlanPage } from '../../src/pages/ProducePlanPage.js';
import { useWizardStore } from '../../src/store/wizardStore.js';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigateMock }));

function renderPage() {
  return render(<MemoryRouter><ProducePlanPage /></MemoryRouter>);
}

describe('ProducePlanPage', () => {
  beforeEach(() => { useWizardStore.getState().reset(); vi.clearAllMocks(); });

  it('with a single part: skips the list and opens its work-order tree directly', async () => {
    useWizardStore.getState().setProducePlan([{ arInvtId: 5, itemNumber: 'PART-5', description: 'Five', qty: 120 }]);
    renderPage();
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/work-orders'));
    expect(useWizardStore.getState().selectedLineItem?.arInvtId).toBe(5);
    expect(useWizardStore.getState().finalQty).toBe(120);
  });

  it('with several parts: lists them; clicking Otvori activates that part and opens the tree', async () => {
    useWizardStore.getState().setProducePlan([
      { arInvtId: 1, itemNumber: 'PART-A', description: 'A', qty: 90 },
      { arInvtId: 2, itemNumber: 'SUB', description: 'B', qty: 30 },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('PART-A')).toBeInTheDocument());
    expect(screen.getByText('SUB')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled(); // multi -> no auto redirect

    await userEvent.click(screen.getAllByRole('button', { name: /Otvori stablo/ })[1]!);
    expect(useWizardStore.getState().selectedLineItem?.arInvtId).toBe(2);
    expect(useWizardStore.getState().finalQty).toBe(30);
    expect(navigateMock).toHaveBeenCalledWith('/work-orders');
  });
});
