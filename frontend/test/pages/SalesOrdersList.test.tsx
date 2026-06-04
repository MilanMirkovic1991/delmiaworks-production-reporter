import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SalesOrdersList } from '../../src/pages/SalesOrdersList.js';
import { useWizardStore } from '../../src/store/wizardStore.js';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigateMock }));
vi.mock('../../src/api/client.js', () => ({
  api: {
    listSalesOrders: vi.fn(async () => ({
      salesOrders: [
        { salesOrderId: 1, orderNumber: 'SO1001', customerNumber: 'C001', company: 'Acme Corp', poNumber: 'PO-99', dateTaken: '2025-01-15T00:00:00', status: 'Open', lineCount: 3, totalOrdered: 600, totalShipped: 200, totalRemaining: 400 },
        { salesOrderId: 2, orderNumber: 'SO1002', customerNumber: 'C002', company: 'Beta Ltd', poNumber: 'PO-12', dateTaken: '2025-02-01T00:00:00', status: 'Open', lineCount: 1, totalOrdered: 100, totalShipped: 0, totalRemaining: 100 },
      ],
    })),
  },
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><SalesOrdersList /></MemoryRouter></QueryClientProvider>);
}

describe('SalesOrdersList (multiselect)', () => {
  beforeEach(() => { useWizardStore.getState().reset(); vi.clearAllMocks(); });

  it('multiselect: check orders then Dalje stores them and goes to /aggregate', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('SO1001')).toBeInTheDocument());

    // Dalje is disabled until something is selected
    const dalje = screen.getByRole('button', { name: /Dalje/ });
    expect(dalje).toBeDisabled();

    await userEvent.click(screen.getByLabelText('Izaberi SO1001'));
    await userEvent.click(screen.getByLabelText('Izaberi SO1002'));
    expect(dalje).toBeEnabled();

    await userEvent.click(dalje);
    expect(useWizardStore.getState().selectedSOs.map(s => s.salesOrderId)).toEqual([1, 2]);
    expect(navigateMock).toHaveBeenCalledWith('/aggregate');
  });
});
