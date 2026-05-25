import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';
import { WizardStepper } from '../components/WizardStepper.js';

export function ReleasesPage() {
  const navigate = useNavigate();
  const so = useWizardStore(s => s.selectedSO);
  const lineItem = useWizardStore(s => s.selectedLineItem);
  const selection = useWizardStore(s => s.selection);
  const finalQty = useWizardStore(s => s.finalQty);
  const setFull = useWizardStore(s => s.setSelectionFull);
  const setReleases = useWizardStore(s => s.setSelectionReleases);

  useEffect(() => {
    if (!so || !lineItem) navigate('/');
  }, [so, lineItem, navigate]);

  const { data, isFetching } = useQuery({
    queryKey: ['releases', lineItem?.ordDetailId],
    queryFn: () => api.releasesForSO(lineItem!.ordDetailId),
    enabled: !!lineItem,
    staleTime: 60_000,
  });

  const [checked, setChecked] = useState<Set<number>>(new Set(selection.releaseIds));

  function toggle(id: number) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
    setReleases({ releaseIds: [...next], releases: data?.releases ?? [] });
  }

  if (!so || !lineItem) return null;

  return (
    <div className="app">
      <WizardStepper />
      <h2>Količina za {lineItem.itemNumber} — {so.orderNumber}</h2>
      <div className="card">
        <label>
          <input type="radio" name="mode" checked={selection.mode === 'full'} onChange={() => { setFull(); setChecked(new Set()); }} />
          {' '}Puna količina ({lineItem.totalOrdered})
        </label>
        <div style={{ marginTop: 8 }}>
          <label>
            <input type="radio" name="mode" checked={selection.mode === 'releases'}
              onChange={() => setReleases({ releaseIds: [...checked], releases: data?.releases ?? [] })} />
            {' '}Selektuj release-ove
          </label>
        </div>
      </div>

      {selection.mode === 'releases' && (
        <div className="card">
          {isFetching && <p>Učitavam release-ove...</p>}
          {data?.releases.length === 0 && <p>Nema release-ova. Koristi punu količinu.</p>}
          {data?.releases.map(r => (
            <div key={r.releaseId} style={{ padding: 4 }}>
              <label>
                <input type="checkbox"
                  aria-label={`Release #${r.releaseId}`}
                  checked={checked.has(r.releaseId)}
                  onChange={() => toggle(r.releaseId)} />
                {' '}Release #{r.releaseId} (seq {r.seq}) — {r.qty} kom, request {r.requestDate ?? '-'}
              </label>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <strong>Finalna količina: <span data-testid="final-qty">{finalQty}</span></strong>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={() => navigate('/sales-order/items')}>← Nazad</button>
        <button
          disabled={selection.mode === 'releases' && checked.size === 0}
          onClick={() => { useWizardStore.getState().goTo(4); navigate('/work-orders'); }}
        >Dalje →</button>
      </div>
    </div>
  );
}
