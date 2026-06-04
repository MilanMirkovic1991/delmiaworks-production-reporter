import { useState } from 'react';
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
  const setSelectedSOs = useWizardStore(s => s.setSelectedSOs);
  const { data, isFetching, error } = useQuery({
    queryKey: ['sales-orders-all'],
    queryFn: () => api.listSalesOrders(),
    staleTime: 60_000,
  });

  const orders = data?.salesOrders ?? [];
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const allChecked = orders.length > 0 && checked.size === orders.length;

  function toggle(id: number) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allChecked) setChecked(new Set());
    else setChecked(new Set(orders.map(o => o.salesOrderId)));
  }

  function proceed() {
    const sel = orders.filter(o => checked.has(o.salesOrderId))
      .map(o => ({ salesOrderId: o.salesOrderId, orderNumber: o.orderNumber, company: o.company }));
    if (sel.length === 0) return;
    setSelectedSOs(sel);
    navigate('/aggregate');
  }

  return (
    <div className="app">
      <WizardStepper />
      <div className="page-header">
        <h2>Aktivni Sales Order-i</h2>
        <div className="actions">
          <span style={{ color: 'var(--muted)' }}>Izabrano: <strong>{checked.size}</strong></span>
          <button className="primary" disabled={checked.size === 0} onClick={proceed}>Dalje →</button>
        </div>
      </div>
      <p style={{ color: 'var(--muted)', marginTop: -4, fontSize: 13 }}>
        Čekiraj jednu ili više porudžbina pa „Dalje" — količine se objedinjuju po artiklu.
      </p>
      {isFetching && <p>Učitavam...</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ width: 36 }}>
              <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Izaberi sve" />
            </th>
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
          {orders.map(so => (
            <tr
              key={so.salesOrderId}
              className={checked.has(so.salesOrderId) ? 'selected-row' : ''}
              style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}
              onClick={() => toggle(so.salesOrderId)}
            >
              <td>
                <input
                  type="checkbox"
                  checked={checked.has(so.salesOrderId)}
                  onChange={() => toggle(so.salesOrderId)}
                  onClick={e => e.stopPropagation()}
                  aria-label={`Izaberi ${so.orderNumber}`}
                />
              </td>
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
      {data && orders.length === 0 && <p>Nema aktivnih Sales Order-a.</p>}
    </div>
  );
}
