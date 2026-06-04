import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
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

          <section className="wo-tree-section">
            <h3>Stablo radnih naloga</h3>
            <div className="wo-tree-scroll">
              <WorkOrderTreeNodeView node={data.tree} defaultExpanded />
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
