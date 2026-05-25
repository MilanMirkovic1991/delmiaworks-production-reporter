import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';
import { WizardStepper } from '../components/WizardStepper.js';

function fmtDate(d: string | null): string {
  if (!d) return '-';
  return d.slice(0, 10);
}

export function SalesOrdersList() {
  const navigate = useNavigate();
  const selectSO = useWizardStore(s => s.selectSO);
  const { data, isFetching, error } = useQuery({
    queryKey: ['sales-orders-all'],
    queryFn: () => api.listSalesOrders(),
    staleTime: 60_000,
  });

  return (
    <div className="app">
      <WizardStepper />
      <h2>Aktivni Sales Order-i</h2>
      {isFetching && <p>Učitavam...</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">Order #</th>
            <th align="left">Kupac</th>
            <th align="left">Šifra</th>
            <th align="left">PO #</th>
            <th align="left">Datum</th>
            <th align="right">Stavke</th>
            <th align="right">Ukupno</th>
            <th align="right">Preostalo</th>
          </tr>
        </thead>
        <tbody>
          {data?.salesOrders.map(so => (
            <tr
              key={so.salesOrderId}
              style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}
              onClick={() => {
                selectSO({
                  salesOrderId: so.salesOrderId, orderNumber: so.orderNumber,
                  company: so.company, customerNumber: so.customerNumber,
                });
                navigate('/sales-order/items');
              }}
            >
              <td>{so.orderNumber}</td>
              <td>{so.company}</td>
              <td>{so.customerNumber}</td>
              <td>{so.poNumber}</td>
              <td>{fmtDate(so.dateTaken)}</td>
              <td align="right">{so.lineCount}</td>
              <td align="right">{so.totalOrdered}</td>
              <td align="right">{so.totalRemaining}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && data.salesOrders.length === 0 && <p>Nema aktivnih Sales Order-a.</p>}
    </div>
  );
}
