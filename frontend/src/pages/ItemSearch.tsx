import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';
import { WizardStepper } from '../components/WizardStepper.js';

function useDebounced(value: string, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ItemSearch() {
  const navigate = useNavigate();
  const selectItem = useWizardStore(s => s.selectItem);
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, isFetching, error } = useQuery({
    queryKey: ['items', dq],
    queryFn: () => api.searchItems(dq),
    enabled: dq.length >= 2,
    staleTime: 30_000,
  });

  return (
    <div className="app">
      <WizardStepper />
      <h2>Izaberi artikal</h2>
      <input
        placeholder="Pretraga (min 2 znaka)..."
        value={q}
        onChange={e => setQ(e.target.value)}
        style={{ width: '100%' }}
      />
      {isFetching && <p>Učitavam...</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      <div style={{ marginTop: 8 }}>
        {data?.items.map(item => (
          <div
            key={item.arInvtId}
            className="card"
            style={{ cursor: 'pointer' }}
            onClick={() => { selectItem({ arInvtId: item.arInvtId, itemNumber: item.itemNumber, description: item.description }); navigate('/sales-orders'); }}
          >
            <strong>{item.itemNumber}</strong> — {item.description} <em>({item.itemClass})</em>
          </div>
        ))}
        {data && data.items.length === 0 && dq.length >= 2 && <p>Nema rezultata.</p>}
      </div>
    </div>
  );
}
