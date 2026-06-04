import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, type CascadeResult } from '../api/client.js';
import type { WorkOrderTreeNode } from '../api/types.js';
import { useWizardStore } from '../store/wizardStore.js';
import { WizardStepper } from '../components/WizardStepper.js';
import { WorkOrderTreeNodeView } from '../components/WorkOrderTreeNode.js';

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

  const cascade = useMutation({
    mutationFn: ({ arInvtId, qty }: { arInvtId: number; qty: number }) => api.reportProductionCascade(arInvtId, qty),
  });

  const resultsByWo = useMemo(() => {
    const m = new Map<number, CascadeResult>();
    for (const r of cascade.data?.results ?? []) m.set(r.workOrderId, r);
    return m;
  }, [cascade.data]);

  function onReport(node: WorkOrderTreeNode) {
    const ok = window.confirm(
      `Prijaviti proizvodnju za „${node.itemNumber}" i sve radne naloge ispod njega?\n\n` +
      `Ovo upisuje pravu proizvodnju u DelmiaWorks: puna količina po radnom nalogu, ` +
      `vreme se varira ±15% od standarda. Pokreće se od dna ka vrhu.`,
    );
    if (!ok) return;
    cascade.mutate({ arInvtId: node.arInvtId, qty: node.qtyRequired });
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

          {cascade.isPending && <p>Prijavljujem proizvodnju (od dna ka vrhu)...</p>}
          {cascade.isError && (
            <p className="error">Greška pri prijavi: {(cascade.error as Error).message}</p>
          )}
          {cascade.data && (
            <div
              className="card"
              style={{
                background: cascade.data.failed > 0 || cascade.data.stoppedOnAuth ? '#fef9c3' : '#dcfce7',
                border: `1px solid ${cascade.data.failed > 0 || cascade.data.stoppedOnAuth ? 'var(--warning)' : 'var(--buy)'}`,
              }}
            >
              <strong>Prijavljeno: {cascade.data.succeeded} / {cascade.data.total}</strong>
              {cascade.data.failed > 0 && <span> · nije prošlo: {cascade.data.failed}</span>}
              {cascade.data.stoppedOnAuth && (
                <span style={{ color: 'var(--warning)' }}> · ⚠ sesija je istekla, kaskada je zaustavljena — prijavi se ponovo</span>
              )}
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                Status po radnom nalogu je prikazan u stablu ispod (✓ / ✗).
              </p>
            </div>
          )}

          <section className="wo-tree-section">
            <h3>Stablo radnih naloga</h3>
            <div className="wo-tree-scroll">
              <WorkOrderTreeNodeView
                node={data.tree}
                defaultExpanded
                onReport={onReport}
                resultsByWo={resultsByWo}
                reporting={cascade.isPending}
              />
            </div>
          </section>
        </>
      )}

      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={() => navigate('/releases')}>← Nazad</button>
      </div>
    </div>
  );
}
