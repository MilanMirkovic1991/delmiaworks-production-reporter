import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';

export function AppHeader() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api.me(), retry: false });

  async function logout() {
    try { await api.logout(); } catch { /* ignore */ }
    await qc.invalidateQueries({ queryKey: ['me'] });
    qc.clear();
    navigate('/login');
  }

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="brand">
          <span className="brand-mark">⚙</span>
          <span className="brand-name">Prijava proizvodnje</span>
          <span className="brand-sub">DelmiaWorks</span>
        </div>
        {me && (
          <div className="user-box">
            <div className="user-info">
              <span className="user-name">{me.username}</span>
              {me.eplantId > 0 && <span className="user-eplant">EPlant #{me.eplantId}</span>}
            </div>
            <button className="ghost" onClick={logout}>Odjavi se</button>
          </div>
        )}
      </div>
    </header>
  );
}
