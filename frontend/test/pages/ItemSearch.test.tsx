import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ItemSearch } from '../../src/pages/ItemSearch.js';
import { useWizardStore } from '../../src/store/wizardStore.js';

vi.mock('../../src/api/client.js', () => ({
  api: {
    searchItems: vi.fn(async (q: string) => ({
      items: q.length >= 2 ? [
        { arInvtId: 1, itemNumber: 'PART-A', description: 'Widget A', rev: '1', itemClass: 'MFG', isPurchased: false },
      ] : [],
    })),
  },
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ItemSearch />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ItemSearch', () => {
  beforeEach(() => useWizardStore.getState().reset());

  it('searches and lists items after 2 chars', async () => {
    renderPage();
    const input = screen.getByPlaceholderText(/pretraga/i);
    await userEvent.type(input, 'PA');
    await waitFor(() => expect(screen.getByText('PART-A')).toBeInTheDocument());
  });

  it('clicking item updates store and advances to step 2', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText(/pretraga/i), 'PA');
    await waitFor(() => screen.getByText('PART-A'));
    await userEvent.click(screen.getByText('PART-A'));
    expect(useWizardStore.getState().selectedItem?.arInvtId).toBe(1);
    expect(useWizardStore.getState().step).toBe(2);
  });
});
