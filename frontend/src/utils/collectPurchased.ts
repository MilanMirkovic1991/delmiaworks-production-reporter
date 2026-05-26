import type { WorkOrderTreeNode } from '../api/types.js';

export type PurchasedSummary = {
  arInvtId: number;
  itemNumber: string;
  description: string;
  rev: string;
  uom: string;
  totalQty: number;
  occurrences: number;
};

export function collectPurchased(root: WorkOrderTreeNode | null): PurchasedSummary[] {
  if (!root) return [];
  const map = new Map<number, PurchasedSummary>();
  function walk(n: WorkOrderTreeNode) {
    if (n.cycleDetected) return;
    // Criterion: a node that needs to be PURCHASED is a leaf in the BOM
    // (no children = nothing further to make from it) with no work order
    // (we're not producing it ourselves). Root excluded - that's what we're building.
    const isLeaf = n.children.length === 0;
    const hasNoWO = n.workOrders.length === 0;
    if (n.level > 0 && isLeaf && hasNoWO) {
      const existing = map.get(n.arInvtId);
      if (existing) {
        existing.totalQty += n.qtyRequired;
        existing.occurrences += 1;
      } else {
        map.set(n.arInvtId, {
          arInvtId: n.arInvtId,
          itemNumber: n.itemNumber,
          description: n.description,
          rev: n.rev,
          uom: n.uom,
          totalQty: n.qtyRequired,
          occurrences: 1,
        });
      }
    }
    for (const c of n.children) walk(c);
  }
  walk(root);
  return [...map.values()].sort((a, b) => a.itemNumber.localeCompare(b.itemNumber));
}
