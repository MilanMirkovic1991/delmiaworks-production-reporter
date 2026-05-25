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

  function onStartReporting() {
    alert('Pokretanje prijave proizvodnje — Faza 2 (uskoro). Nije još implementirano.');
  }

  if (!so || !lineItem) return null;

  const noData = data?.reason === 'NO_DATA';
  const hasTree = !!data?.tree;

  return (
    <div className="app">
      <WizardStepper />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Stablo radnih naloga: {lineItem.itemNumber} × {finalQty}</h2>
        <div className="row">
          <button onClick={() => refetch()}>🔄 Osveži</button>
          <button onClick={() => { reset(); navigate('/'); }}>↺ Reset</button>
        </div>
      </div>
      <p>{so.orderNumber} — {so.company}</p>
      {isFetching && <p>Učitavam stablo radnih naloga...</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      {noData && <p>Nema BOM strukture ni radnih naloga za ovaj artikal.</p>}
      {hasTree && data?.tree && (
        <>
          <p style={{ color: '#555' }}>
            Nodes: {data.stats.nodeCount} · max dubina: {data.stats.maxDepth} ·
            ukupno WO: {data.stats.totalWorkOrders} · bez WO: {data.stats.itemsWithoutWO} ·
            ciklusa: {data.stats.cycleCount}
          </p>
          <WorkOrderTreeNodeView node={data.tree} defaultExpanded />
        </>
      )}
      <div className="row" style={{ marginTop: 16, gap: 12 }}>
        <button onClick={() => navigate('/releases')}>← Nazad</button>
        <button
          onClick={onStartReporting}
          disabled={!hasTree || data?.stats.totalWorkOrders === 0}
          style={{ background: '#2563eb', color: 'white', fontWeight: 'bold' }}
        >▶ Pokreni prijavu proizvodnje</button>
      </div>
    </div>
  );
}
