import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Login } from '../../src/pages/Login.js';
import { api } from '../../src/api/client.js';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigateMock }));
vi.mock('../../src/api/client.js', () => ({ api: { login: vi.fn(), selectEPlant: vi.fn() } }));

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><Login /></MemoryRouter></QueryClientProvider>);
}

describe('Login auto-login', () => {
  beforeEach(() => vi.clearAllMocks());

  it('on mount: logs in with defaults, selects eplant 13, goes to sales orders', async () => {
    (api.login as ReturnType<typeof vi.fn>).mockResolvedValue({ username: 'IQMS', eplantId: 0 });
    (api.selectEPlant as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, eplantId: 13 });

    renderLogin();

    await waitFor(() => expect(api.login).toHaveBeenCalledWith(expect.objectContaining({ username: 'IQMS', database: 'IQORA' })));
    await waitFor(() => expect(api.selectEPlant).toHaveBeenCalledWith(13));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'));
  });

  it('if auto-login fails, shows the manual form prefilled', async () => {
    (api.login as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('bad credentials'));

    renderLogin();

    await waitFor(() => expect(screen.getByRole('button', { name: /Prijavi se/i })).toBeInTheDocument());
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
