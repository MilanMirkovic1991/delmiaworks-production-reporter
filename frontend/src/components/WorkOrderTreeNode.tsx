import { useState } from 'react';
import type { WorkOrderTreeNode, WorkOrderRow } from '../api/types.js';

function classBadge(node: WorkOrderTreeNode): { label: string; cls: string } {
  if (node.cycleDetected) return { label: '⚠ ciklus', cls: 'cycle' };
  return node.isPurchased ? { label: 'KUPOVNI', cls: 'buy' } : { label: 'PROIZVODNI', cls: 'mfg' };
}

function onStartReporting(wo: WorkOrderRow) {
  alert(`Pokretanje prijave proizvodnje za WO ${wo.mfgNumber} (ID ${wo.workOrderId}) — Faza 2, uskoro.`);
}

export function WorkOrderTreeNodeView({ node, defaultExpanded = false }: { node: WorkOrderTreeNode; defaultExpanded?: boolean }) {
  const [open, setOpen] = useState(defaultExpanded);
  const hasChildren = node.children.length > 0;
  const badge = classBadge(node);

  return (
    <div className="tree-row" data-level={node.level}>
      <div className="tree-row-header">
        <button
          className="expander"
          onClick={() => setOpen(o => !o)}
          disabled={!hasChildren}
          aria-label={hasChildren ? (open ? 'Collapse' : 'Expand') : 'No children'}
        >{hasChildren ? (open ? '▾' : '▸') : '·'}</button>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
        <span className="item-info">
          <span className="kv"><span className="k">Ident:</span> <strong>{node.itemNumber || '—'}</strong></span>
          <span className="kv"><span className="k">Revizija:</span> {node.rev || '—'}</span>
          <span className="kv"><span className="k">Klasa:</span> {node.itemClass || '—'}</span>
        </span>
        <span className="qty"><strong>{node.qtyRequired}</strong> {node.uom}</span>
        <span className="level-pill">nivo {node.level}</span>
      </div>
      <div className="tree-row-desc">
        <span className="k">Naziv:</span> {node.description || '—'}
      </div>
      {!node.isPurchased && !node.cycleDetected && (
        <div className="tree-row-wos">
          {node.workOrders.length === 0 ? (
            <div className="no-wo">nema radnog naloga za ovaj artikal</div>
          ) : (
            node.workOrders.map(wo => (
              <div key={wo.workOrderId} className="wo-row">
                <span className="wo-num">WO {wo.mfgNumber || `#${wo.workOrderId}`}</span>
                {wo.mfgDescrip && <span className="wo-desc">{wo.mfgDescrip}</span>}
                {wo.priorityLevel != null && <span className="wo-meta">prioritet {wo.priorityLevel}</span>}
                {wo.startDate && <span className="wo-meta">start {wo.startDate.slice(0, 10)}</span>}
                {wo.status && <span className="wo-meta">{wo.status}</span>}
                <button
                  className="primary small"
                  aria-label={`Pokreni prijavu proizvodnje za ${wo.mfgNumber}`}
                  onClick={() => onStartReporting(wo)}
                >▶ Prijavi proizvodnju</button>
              </div>
            ))
          )}
        </div>
      )}
      {open && hasChildren && (
        <div className="tree-children">
          {node.children.map(c => (
            <WorkOrderTreeNodeView key={`${c.arInvtId}-${c.level}`} node={c} defaultExpanded={c.level < 3} />
          ))}
        </div>
      )}
    </div>
  );
}
