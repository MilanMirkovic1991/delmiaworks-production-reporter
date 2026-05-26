import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';

export function SelectEPlant() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isFetching, error } = useQuery({
    queryKey: ['eplants'],
    queryFn: () => api.listEPlants(),
    retry: false,
  });
  const [selected, setSelected] = useState<number | null>(null);

  const m = useMutation({
    mutationFn: (id: number) => api.selectEPlant(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/');
    },
  });

  return (
    <div className="app auth-screen">
      <div className="card auth-card">
        <h1>Izbor fabrike (EPlant)</h1>
        {isFetching && <p>Učitavam listu fabrika...</p>}
        {error && <p className="error">{(error as Error).message}</p>}
        {data && (
          <>
            <p style={{ color: 'var(--muted)' }}>Odaberi fabriku za koju želiš da radiš prijavu proizvodnje.</p>
            <div className="eplant-list">
              {data.eplants.map(p => (
                <label key={p.id} className={`eplant-option${selected === p.id ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="eplant"
                    value={p.id}
                    checked={selected === p.id}
                    onChange={() => setSelected(p.id)}
                  />
                  <span className="eplant-name"><strong>{p.plantName}</strong></span>
                  <span className="eplant-company">{p.companyName}</span>
                  <span className="eplant-id">#{p.id}</span>
                </label>
              ))}
              {data.eplants.length === 0 && <p>Nema dostupnih fabrika.</p>}
            </div>
            <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button
                className="primary"
                disabled={!selected || m.isPending}
                onClick={() => selected && m.mutate(selected)}
              >
                {m.isPending ? 'Postavljam...' : 'Nastavi →'}
              </button>
            </div>
            {m.isError && <p className="error">{(m.error as Error).message}</p>}
          </>
        )}
      </div>
    </div>
  );
}
