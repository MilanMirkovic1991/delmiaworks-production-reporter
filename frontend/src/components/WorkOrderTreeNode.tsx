import { useState } from 'react';
import type { WorkOrderTreeNode } from '../api/types.js';

function classBadge(node: WorkOrderTreeNode): { label: string; cls: string } {
  if (node.cycleDetected) return { label: '⚠ ciklus', cls: 'cycle' };
  return node.isPurchased ? { label: 'KUPOVNI', cls: 'buy' } : { label: 'PROIZVODNI', cls: 'mfg' };
}

export function WorkOrderTreeNodeView({ node, defaultExpanded = false }: { node: WorkOrderTreeNode; defaultExpanded?: boolean }) {
  const [open, setOpen] = useState(defaultExpanded);
  const hasChildren = node.children.length > 0;
  const badge = classBadge(node);
  return (
    <div className="tree-node">
      <div className="row">
        {hasChildren ? (
          <button onClick={() => setOpen(o => !o)} style={{ padding: '0 6px' }}>{open ? '▾' : '▸'}</button>
        ) : <span style={{ width: 18 }} />}
        <strong>{node.itemNumber}</strong>
        <span>{node.description}</span>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
        <span>{node.qtyRequired} {node.uom}</span>
        <small>nivo {node.level}</small>
      </div>
      {!node.isPurchased && !node.cycleDetected && (
        <div style={{ marginLeft: 28, marginTop: 4 }}>
          {node.workOrders.length === 0 ? (
            <em style={{ color: '#888' }}>nema radnog naloga</em>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {node.workOrders.map(wo => (
                <li key={wo.workOrderId}>
                  <strong>{wo.mfgNumber}</strong>
                  {wo.mfgDescrip ? ` — ${wo.mfgDescrip}` : ''}
                  {wo.priorityLevel !== null && wo.priorityLevel !== undefined ? ` · prioritet ${wo.priorityLevel}` : ''}
                  {wo.startDate ? ` · start ${wo.startDate.slice(0, 10)}` : ''}
                  {wo.status ? ` · ${wo.status}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {open && node.children.map(c => (
        <WorkOrderTreeNodeView key={`${c.arInvtId}-${c.level}`} node={c} defaultExpanded={c.level < 3} />
      ))}
    </div>
  );
}
