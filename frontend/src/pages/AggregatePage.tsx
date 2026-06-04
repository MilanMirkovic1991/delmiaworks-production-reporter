import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';
import { WizardStepper } from '../components/WizardStepper.js';
import { AggregateLineItem } from '../components/AggregateLineItem.js';
import { aggregateDemand, type DemandUnit } from '../utils/aggregateDemand.js';

export function AggregatePage() {
  const navigate = useNavigate();
  const selectedSOs = useWizardStore(s => s.selectedSOs);
  const setProducePlan = useWizardStore(s => s.setProducePlan);

  useEffect(() => { if (selectedSOs.length === 0) navigate('/'); }, [selectedSOs, navigate]);

  const queries = useQueries({
    queries: selectedSOs.map(so => ({
      queryKey: ['so-line-items', so.salesOrderId],
      queryFn: () => api.salesOrderLineItems(so.salesOrderId),
      enabled: selectedSOs.length > 0,
      staleTime: 60_000,
    })),
  });
  const loading = queries.some(q => q.isLoading);

  // Each line item (keyed by ordDetailId) reports its current demand units here.
  const [contrib, setContrib] = useState<Record<number, DemandUnit[]>>({});
  const setRowDemand = (ordDetailId: number, units: DemandUnit[]) =>
    setContrib(prev => ({ ...prev, [ordDetailId]: units }));

  const plan = useMemo(() => aggregateDemand(Object.values(contrib).flat()), [contrib]);

  function proceed() {
    if (plan.length === 0) return;
    setProducePlan(plan);
    navigate('/produce');
  }

  if (selectedSOs.length === 0) return null;

  return (
    <div className="app">
      <WizardStepper />
      <h2>Količina za prijavu — {selectedSOs.length} {selectedSOs.length === 1 ? 'porudžbina' : 'porudžbina'}</h2>
      {loading && <p>Učitavam stavke...</p>}

      {selectedSOs.map((so, i) => {
        const q = queries[i];
        const lineItems = q?.data?.lineItems ?? [];
        return (
          <section key={so.salesOrderId} className="card">
            <h3 style={{ margin: '0 0 8px' }}>{so.orderNumber} — {so.company}</h3>
            {q?.isError && <p className="error">{(q.error as Error).message}</p>}
            {lineItems.map(li => (
              <AggregateLineItem key={li.ordDetailId} lineItem={li} onChange={units => setRowDemand(li.ordDetailId, units)} />
            ))}
            {q?.data && lineItems.length === 0 && <p style={{ color: 'var(--muted)' }}>Nema stavki na ovoj porudžbini.</p>}
          </section>
        );
      })}

      <div className="card" style={{ background: 'var(--surface-2)' }}>
        <h3 style={{ margin: '0 0 8px' }}>Plan proizvodnje (objedinjeno po artiklu)</h3>
        {plan.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Izaberi bar jednu stavku ili release.</p>
        ) : (
          <table style={{ width: '100%' }}>
            <thead><tr><th align="left">Artikal</th><th align="left">Opis</th><th align="right">Ukupna količina</th></tr></thead>
            <tbody>
              {plan.map(p => (
                <tr key={p.arInvtId} data-testid={`plan-${p.arInvtId}`}>
                  <td><strong>{p.itemNumber}</strong></td>
                  <td>{p.description}</td>
                  <td align="right"><strong>{p.qty}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="row" style={{ marginTop: 16, gap: 8 }}>
        <button onClick={() => navigate('/')}>← Nazad</button>
        <button className="primary" disabled={plan.length === 0} onClick={proceed}>
          Dalje → ({plan.length} {plan.length === 1 ? 'artikal' : 'artikala'})
        </button>
      </div>
    </div>
  );
}
