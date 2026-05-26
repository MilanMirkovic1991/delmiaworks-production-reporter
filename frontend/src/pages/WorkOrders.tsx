import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';
import { WizardStepper } from '../components/WizardStepper.js';
import { WorkOrderTreeNodeView } from '../components/WorkOrderTreeNode.js';
import { collectPurchased } from '../utils/collectPurchased.js';

function formatQty(n: number): string {
  return n.toLocaleString('sr-RS', { maximumFractionDigits: 4 });
}

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
    queryKey: ['work-order-tree', lineItem?.arInvtId, finalQty],
    queryFn: () => api.workOrderTree(lineItem!.arInvtId, finalQty),
    enabled: !!lineItem && finalQty > 0,
    staleTime: Infinity,
  });

  const purchaseItems = useMemo(() => collectPurchased(data?.tree ?? null), [data]);
  const [selectedToBuy, setSelectedToBuy] = useState<Set<number>>(new Set());
  const allBuySelected = purchaseItems.length > 0 && selectedToBuy.size === purchaseItems.length;

  function toggleAllBuy() {
    if (allBuySelected) setSelectedToBuy(new Set());
    else setSelectedToBuy(new Set(purchaseItems.map(i => i.arInvtId)));
  }
  function toggleBuy(id: number) {
    const next = new Set(selectedToBuy);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedToBuy(next);
  }

  function notImplemented(action: string) {
    const sel = purchaseItems.filter(i => selectedToBuy.has(i.arInvtId));
    alert(`${action} — još uvek nije implementirano. Selektovano ${sel.length} artikala. Sledeći korak: integracija sa DW POST endpoint-ima za CreatePO + CreatePOReceipt + PostPOReceipt.`);
  }

  if (!so || !lineItem) return null;

  const noData = data?.reason === 'NO_DATA';
  const hasTree = !!data?.tree;

  return (
    <div className="app">
      <WizardStepper />
      <div className="page-header">
        <div>
          <h2>Stablo radnih naloga: {lineItem.itemNumber} × {finalQty}</h2>
          <p style={{ margin: 0, color: 'var(--muted)' }}>{so.orderNumber} — {so.company}</p>
        </div>
        <div className="actions">
          <button onClick={() => refetch()}>🔄 Osveži</button>
          <button onClick={() => { reset(); navigate('/'); }}>↺ Reset</button>
        </div>
      </div>

      {isFetching && <p>Učitavam stablo radnih naloga...</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      {noData && <p>Nema BOM strukture ni radnih naloga za ovaj artikal.</p>}

      {hasTree && data?.tree && (
        <>
          <p className="stats-line">
            Čvorova: {data.stats.nodeCount} · max dubina: {data.stats.maxDepth} ·
            ukupno WO: {data.stats.totalWorkOrders} · bez WO: {data.stats.itemsWithoutWO} ·
            ciklusa: {data.stats.cycleCount}
          </p>

          <h3 style={{ marginTop: 20, marginBottom: 8 }}>Stablo radnih naloga</h3>
          <WorkOrderTreeNodeView node={data.tree} defaultExpanded />

          <h3 style={{ marginTop: 28, marginBottom: 8 }}>
            Kupovne komponente za nabavku ({purchaseItems.length})
          </h3>
          {purchaseItems.length === 0 ? (
            <div className="card">Nema kupovnih komponenti u ovom BOM stablu.</div>
          ) : (
            <>
              <div className="card" style={{ background: 'var(--surface-2)' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="row" style={{ gap: 16 }}>
                    <label className="row" style={{ gap: 6 }}>
                      <input type="checkbox" checked={allBuySelected} onChange={toggleAllBuy} />
                      <span>Selektuj sve ({purchaseItems.length})</span>
                    </label>
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                      Selektovano: <strong>{selectedToBuy.size}</strong> od {purchaseItems.length}
                    </span>
                  </div>
                  <div className="row">
                    <button
                      className="primary"
                      disabled={selectedToBuy.size === 0}
                      onClick={() => notImplemented('Kreiraj nabavnu porudžbenicu (PO)')}
                    >📋 Kreiraj PO za selektovane</button>
                    <button
                      disabled={selectedToBuy.size === 0}
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
                    <th align="right">Pojavljivanja</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseItems.map(it => (
                    <tr
                      key={it.arInvtId}
                      onClick={() => toggleBuy(it.arInvtId)}
                      className={selectedToBuy.has(it.arInvtId) ? 'selected-row' : ''}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedToBuy.has(it.arInvtId)}
                          onChange={() => toggleBuy(it.arInvtId)}
                          onClick={e => e.stopPropagation()}
                        />
                      </td>
                      <td><strong>{it.itemNumber || '—'}</strong></td>
                      <td>{it.rev || '—'}</td>
                      <td>{it.description || '—'}</td>
                      <td align="right"><strong>{formatQty(it.totalQty)}</strong></td>
                      <td>{it.uom || '—'}</td>
                      <td align="right">{it.occurrences}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}

      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={() => navigate('/releases')}>← Nazad</button>
      </div>
    </div>
  );
}
