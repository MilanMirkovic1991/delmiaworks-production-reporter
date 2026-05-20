import { useState } from 'react';
import type { BomNode } from '../api/types.js';
import { QuantityBadge } from './QuantityBadge.js';

export function BomTreeNode({ node, defaultExpanded = false }: { node: BomNode; defaultExpanded?: boolean }) {
  const [open, setOpen] = useState(defaultExpanded);
  const hasChildren = node.children.length > 0;
  return (
    <div className="tree-node">
      <div className="row">
        {hasChildren ? (
          <button onClick={() => setOpen(o => !o)} style={{ padding: '0 6px' }}>{open ? '▾' : '▸'}</button>
        ) : <span style={{ width: 18 }} />}
        <strong>{node.itemNumber}</strong>
        <span>{node.description}</span>
        <QuantityBadge isPurchased={node.isPurchased} cycleDetected={node.cycleDetected} />
        <span>{node.qtyRequired} {node.uom}</span>
        <small>nivo {node.level}</small>
      </div>
      {open && node.children.map(c => (
        <BomTreeNode key={`${c.arInvtId}-${c.level}`} node={c} defaultExpanded={c.level < 3} />
      ))}
    </div>
  );
}
