import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';
import { WizardStepper } from '../components/WizardStepper.js';

export function SalesOrdersPage() {
  const navigate = useNavigate();
  const item = useWizardStore(s => s.selectedItem);
  const selectSO = useWizardStore(s => s.selectSO);

  useEffect(() => {
    if (!item) navigate('/');
  }, [item, navigate]);

  const { data, isFetching, error } = useQuery({
    queryKey: ['sales-orders', item?.arInvtId],
    queryFn: () => api.salesOrdersForItem(item!.arInvtId),
    enabled: !!item,
    staleTime: 60_000,
  });

  if (!item) return null;

  return (
    <div className="app">
      <WizardStepper />
      <h2>Sales Order-i za {item.itemNumber}</h2>
      <p>{item.description}</p>
      {isFetching && <p>Učitavam...</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">Order #</th>
            <th align="left">Kupac</th>
            <th align="left">PO #</th>
            <th align="right">Ukupno</th>
            <th align="right">Isporučeno</th>
            <th align="right">Preostalo</th>
          </tr>
        </thead>
        <tbody>
          {data?.salesOrders.map(so => (
            <tr
              key={so.ordDetailId}
              style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}
              onClick={() => { selectSO({ ordDetailId: so.ordDetailId, orderNumber: so.orderNumber, totalOrdered: so.totalOrdered, cummShipped: so.cummShipped }); navigate('/releases'); }}
            >
              <td>{so.orderNumber}</td>
              <td>{so.company}</td>
              <td>{so.poNumber}</td>
              <td align="right">{so.totalOrdered}</td>
              <td align="right">{so.cummShipped}</td>
              <td align="right">{so.remaining}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && data.salesOrders.length === 0 && <p>Nema aktivnih Sales Order-a za ovaj artikal.</p>}
      <button style={{ marginTop: 16 }} onClick={() => navigate('/')}>← Nazad</button>
    </div>
  );
}
