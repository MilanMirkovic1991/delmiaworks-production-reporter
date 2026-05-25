import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';
import { WizardStepper } from '../components/WizardStepper.js';

export function WorkOrdersPage() {
  const navigate = useNavigate();
  const so = useWizardStore(s => s.selectedSO);
  const lineItem = useWizardStore(s => s.selectedLineItem);
  const finalQty = useWizardStore(s => s.finalQty);
  const reset = useWizardStore(s => s.reset);

  useEffect(() => {
    if (!so || !lineItem || finalQty <= 0) navigate('/');
  }, [so, lineItem, finalQty, navigate]);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['work-orders', lineItem?.arInvtId],
    queryFn: () => api.workOrdersForPart(lineItem!.arInvtId),
    enabled: !!lineItem,
    staleTime: 60_000,
  });

  function onStartReporting() {
    alert('Pokretanje prijave proizvodnje — Faza 2 (uskoro). Nije još implementirano.');
  }

  if (!so || !lineItem) return null;

  return (
    <div className="app">
      <WizardStepper />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Radni nalozi za {lineItem.itemNumber} × {finalQty}</h2>
        <div className="row">
          <button onClick={() => refetch()}>🔄 Osveži</button>
          <button onClick={() => { reset(); navigate('/'); }}>↺ Reset</button>
        </div>
      </div>
      <p>{so.orderNumber} — {so.company}</p>
      {isFetching && <p>Učitavam radne naloge...</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">WO #</th>
            <th align="left">Opis</th>
            <th align="right">Prioritet</th>
            <th align="left">Start datum</th>
            <th align="left">Status</th>
          </tr>
        </thead>
        <tbody>
          {data?.workOrders.map(wo => (
            <tr key={wo.workOrderId} style={{ borderTop: '1px solid var(--border)' }}>
              <td>{wo.mfgNumber}</td>
              <td>{wo.mfgDescrip}</td>
              <td align="right">{wo.priorityLevel ?? '-'}</td>
              <td>{wo.startDate ? wo.startDate.slice(0, 10) : '-'}</td>
              <td>{wo.status || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && data.workOrders.length === 0 && <p>Nema radnih naloga za ovaj artikal.</p>}
      <div className="row" style={{ marginTop: 16, gap: 12 }}>
        <button onClick={() => navigate('/releases')}>← Nazad</button>
        <button
          onClick={onStartReporting}
          disabled={!data || data.workOrders.length === 0}
          style={{ background: '#2563eb', color: 'white', fontWeight: 'bold' }}
        >▶ Pokreni prijavu proizvodnje</button>
      </div>
    </div>
  );
}
