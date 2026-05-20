import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';

export function Login() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const resetWizard = useWizardStore(s => s.reset);
  const [baseUrl, setBaseUrl] = useState('http://localhost:8080/WebAPI');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('IQORA');
  const [eplantId, setEplantId] = useState('1');

  const m = useMutation({
    mutationFn: () => api.login({ baseUrl, username, password, database, eplantId: Number(eplantId) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      resetWizard();
      navigate('/');
    },
  });

  function onSubmit(e: FormEvent) { e.preventDefault(); m.mutate(); }

  return (
    <div className="app">
      <h1>Prijava — DelmiaWorks</h1>
      <form className="card" onSubmit={onSubmit}>
        <div className="row"><label style={{ width: 140 }}>DW Base URL</label>
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} style={{ flex: 1 }} required /></div>
        <div className="row" style={{ marginTop: 8 }}><label style={{ width: 140 }}>Database</label>
          <input value={database} onChange={e => setDatabase(e.target.value)} required /></div>
        <div className="row" style={{ marginTop: 8 }}><label style={{ width: 140 }}>EPlant ID</label>
          <input value={eplantId} onChange={e => setEplantId(e.target.value)} type="number" min={1} required /></div>
        <div className="row" style={{ marginTop: 8 }}><label style={{ width: 140 }}>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username" /></div>
        <div className="row" style={{ marginTop: 8 }}><label style={{ width: 140 }}>Password</label>
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" required autoComplete="current-password" /></div>
        <div className="row" style={{ marginTop: 16 }}>
          <button type="submit" disabled={m.isPending}>{m.isPending ? 'Prijavljujem...' : 'Prijavi se'}</button>
          {m.isError && <span className="error">{(m.error as Error).message}</span>}
        </div>
      </form>
    </div>
  );
}
