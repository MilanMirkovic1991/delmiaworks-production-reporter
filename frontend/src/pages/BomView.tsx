import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';
import { WizardStepper } from '../components/WizardStepper.js';
import { BomTreeNode } from '../components/BomTreeNode.js';

export function BomView() {
  const navigate = useNavigate();
  const item = useWizardStore(s => s.selectedItem);
  const finalQty = useWizardStore(s => s.finalQty);
  const reset = useWizardStore(s => s.reset);

  useEffect(() => {
    if (!item || finalQty <= 0) navigate('/');
  }, [item, finalQty, navigate]);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['bom-tree', item?.arInvtId, finalQty],
    queryFn: () => api.bomTree(item!.arInvtId, finalQty),
    enabled: !!item && finalQty > 0,
    staleTime: Infinity,
  });

  if (!item) return null;

  return (
    <div className="app">
      <WizardStepper />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>BOM za {item.itemNumber} × {finalQty}</h2>
        <div className="row">
          <button onClick={() => refetch()}>🔄 Osveži BOM</button>
          <button onClick={() => { reset(); navigate('/'); }}>↺ Reset</button>
        </div>
      </div>
      {isFetching && <p>Učitavam BOM...</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      {data?.reason === 'NO_BOM' && <p>Ovaj artikal nema definisan BOM.</p>}
      {data?.tree && (
        <>
          <p>Nodes: {data.stats.nodeCount}, max dubina: {data.stats.maxDepth}, ciklusa: {data.stats.cycleCount}</p>
          <BomTreeNode node={data.tree} defaultExpanded />
        </>
      )}
      <button style={{ marginTop: 16 }} onClick={() => navigate('/releases')}>← Nazad</button>
    </div>
  );
}
