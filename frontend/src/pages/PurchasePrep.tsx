import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';
import { WizardStepper } from '../components/WizardStepper.js';
import { collectPurchased } from '../utils/collectPurchased.js';

export function PurchasePrep() {
  const navigate = useNavigate();
  const lineItem = useWizardStore(s => s.selectedLineItem);
  const finalQty = useWizardStore(s => s.finalQty);

  useEffect(() => {
    if (!lineItem || finalQty <= 0) navigate('/');
  }, [lineItem, finalQty, navigate]);

  const { data, isFetching, error } = useQuery({
    queryKey: ['work-order-tree', lineItem?.arInvtId, finalQty],
    queryFn: () => api.workOrderTree(lineItem!.arInvtId, finalQty),
    enabled: !!lineItem && finalQty > 0,
    staleTime: Infinity,
  });

  const items = useMemo(() => collectPurchased(data?.tree ?? null), [data]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const allSelected = items.length > 0 && selected.size === items.length;

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.arInvtId)));
  }
  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const selectedItems = items.filter(i => selected.has(i.arInvtId));

  function notImplemented(action: string) {
    alert(`${action} — još uvek nije implementirano. Selektovano ${selectedItems.length} artikala. Sledeći korak: integracija sa DW POST endpoint-ima za CreatePO + CreatePOReceipt + PostPOReceipt.`);
  }

  if (!lineItem) return null;

  return (
    <div className="app">
      <WizardStepper />
      <div className="page-header">
        <div>
          <h2>Priprema nabavke — kupovne komponente</h2>
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            {lineItem.itemNumber} × {finalQty} — sve kupovne komponente iz BOM stabla
          </p>
        </div>
        <div className="actions">
          <button onClick={() => navigate('/work-orders')}>← Nazad na radne naloge</button>
        </div>
      </div>

      {isFetching && <p>Učitavam...</p>}
      {error && <p className="error">{(error as Error).message}</p>}

      {!isFetching && items.length === 0 && (
        <div className="card">Nema kupovnih komponenti u ovom BOM stablu.</div>
      )}

      {items.length > 0 && (
        <>
          <div className="card" style={{ background: 'var(--surface-2)' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 16 }}>
                <label className="row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  <span>Selektuj sve ({items.length})</span>
                </label>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                  Selektovano: <strong>{selected.size}</strong> od {items.length}
                </span>
              </div>
              <div className="row">
                <button
                  className="primary"
                  disabled={selected.size === 0}
                  onClick={() => notImplemented('Kreiraj nabavnu porudžbenicu (PO)')}
                >📋 Kreiraj PO za selektovane</button>
                <button
                  disabled={selected.size === 0}
                  onClick={() => notImplemented('Automatski prijem na Receive Designator')}
                >📥 Prijem na default lokaciju</button>
              </div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th align="left">Ident</th>
                <th align="left">Revizija</th>
                <th align="left">Naziv</th>
                <th align="right">Količina</th>
                <th align="left">UOM</th>
                <th align="right">Pojavljivanja u BOM</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr
                  key={it.arInvtId}
                  onClick={() => toggle(it.arInvtId)}
                  className={selected.has(it.arInvtId) ? 'selected-row' : ''}
                >
                  <td><input type="checkbox" checked={selected.has(it.arInvtId)} onChange={() => toggle(it.arInvtId)} onClick={e => e.stopPropagation()} /></td>
                  <td><strong>{it.itemNumber || '—'}</strong></td>
                  <td>{it.rev || '—'}</td>
                  <td>{it.description || '—'}</td>
                  <td align="right"><strong>{it.totalQty}</strong></td>
                  <td>{it.uom || '—'}</td>
                  <td align="right">{it.occurrences}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
