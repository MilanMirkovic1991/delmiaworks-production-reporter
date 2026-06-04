import { useEffect, useRef, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';

const DEFAULTS = { baseUrl: 'http://192.168.20.28:8080/WebAPI', username: 'IQMS', password: 'iqms', database: 'IQORA' };
const AUTO_EPLANT = 13;

type Creds = { baseUrl: string; username: string; password: string; database: string };

export function Login() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const resetWizard = useWizardStore(s => s.reset);
  const [baseUrl, setBaseUrl] = useState(DEFAULTS.baseUrl);
  const [username, setUsername] = useState(DEFAULTS.username);
  const [password, setPassword] = useState(DEFAULTS.password);
  const [database, setDatabase] = useState(DEFAULTS.database);
  // 'auto' = trying automatic login (spinner); 'manual' = show the form (auto failed, or user editing).
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const autoFired = useRef(false);

  const m = useMutation({
    mutationFn: async (creds: Creds): Promise<'home' | 'select-eplant'> => {
      await api.login(creds);
      try {
        await api.selectEPlant(AUTO_EPLANT);
        return 'home';
      } catch {
        return 'select-eplant';
      }
    },
    onSuccess: async (dest) => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      resetWizard();
      navigate(dest === 'home' ? '/' : '/select-eplant');
    },
    onError: () => setMode('manual'),
  });

  // Auto-login once on mount: log in with defaults, select eplant 13, show sales orders.
  useEffect(() => {
    if (autoFired.current) return;
    autoFired.current = true;
    m.mutate(DEFAULTS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSubmit(e: FormEvent) { e.preventDefault(); m.mutate({ baseUrl, username, password, database }); }

  if (mode === 'auto') {
    return (
      <div className="app auth-screen">
        <h1>Prijava…</h1>
        <p style={{ color: 'var(--muted)' }}>Automatska prijava i izbor fabrike 13…</p>
      </div>
    );
  }

  return (
    <div className="app auth-screen">
      <h1>Prijava</h1>
      <p style={{ color: 'var(--muted)', marginTop: -8 }}>
        Automatska prijava nije uspela — proveri podatke i prijavi se ručno.
      </p>
      <form className="card auth-card" onSubmit={onSubmit}>
        <div className="row"><label style={{ width: 140 }}>DW Base URL</label>
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} style={{ flex: 1 }} required /></div>
        <div className="row" style={{ marginTop: 8 }}><label style={{ width: 140 }}>Database</label>
          <input value={database} onChange={e => setDatabase(e.target.value)} required /></div>
        <div className="row" style={{ marginTop: 8 }}><label style={{ width: 140 }}>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username" /></div>
        <div className="row" style={{ marginTop: 8 }}><label style={{ width: 140 }}>Password</label>
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" required autoComplete="current-password" /></div>
        <div className="row" style={{ marginTop: 16 }}>
          <button type="submit" className="primary" disabled={m.isPending}>{m.isPending ? 'Prijavljujem...' : 'Prijavi se'}</button>
          {m.isError && <span className="error">{(m.error as Error).message}</span>}
        </div>
      </form>
    </div>
  );
}
