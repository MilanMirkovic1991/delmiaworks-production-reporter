import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';
import { WizardStepper } from '../components/WizardStepper.js';

export function SalesOrderItems() {
  const navigate = useNavigate();
  const so = useWizardStore(s => s.selectedSO);
  const selectLineItem = useWizardStore(s => s.selectLineItem);

  useEffect(() => { if (!so) navigate('/'); }, [so, navigate]);

  const { data, isFetching, error } = useQuery({
    queryKey: ['so-line-items', so?.salesOrderId],
    queryFn: () => api.salesOrderLineItems(so!.salesOrderId),
    enabled: !!so,
    staleTime: 60_000,
  });

  if (!so) return null;

  return (
    <div className="app">
      <WizardStepper />
      <h2>Stavke na {so.orderNumber} — {so.company}</h2>
      {isFetching && <p>Učitavam...</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">Artikal</th>
            <th align="left">Opis</th>
            <th align="left">Rev</th>
            <th align="left">UOM</th>
            <th align="right">Ukupno</th>
            <th align="right">Isporučeno</th>
            <th align="right">Preostalo</th>
          </tr>
        </thead>
        <tbody>
          {data?.lineItems.map(li => (
            <tr
              key={li.ordDetailId}
              style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}
              onClick={() => {
                selectLineItem({
                  ordDetailId: li.ordDetailId, arInvtId: li.arInvtId,
                  itemNumber: li.itemNumber, description: li.description,
                  totalOrdered: li.totalOrdered, cummShipped: li.cummShipped,
                  remaining: li.remaining,
                });
                navigate('/releases');
              }}
            >
              <td>{li.itemNumber}</td>
              <td>{li.description}</td>
              <td>{li.rev}</td>
              <td>{li.uom || '—'}</td>
              <td align="right">{li.totalOrdered}</td>
              <td align="right">{li.cummShipped}</td>
              <td align="right">{li.remaining}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && data.lineItems.length === 0 && <p>Nema stavki na ovom Sales Order-u.</p>}
      <button style={{ marginTop: 16 }} onClick={() => navigate('/')}>← Nazad</button>
    </div>
  );
}
