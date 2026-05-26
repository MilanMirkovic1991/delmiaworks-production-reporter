import type { WorkOrderTreeNode } from '../api/types.js';

export type PurchasedSummary = {
  arInvtId: number;
  itemNumber: string;
  description: string;
  rev: string;
  uom: string;
  totalQty: number;
  occurrences: number; // how many places in the tree it appears
};

export function collectPurchased(root: WorkOrderTreeNode | null): PurchasedSummary[] {
  if (!root) return [];
  const map = new Map<number, PurchasedSummary>();
  function walk(n: WorkOrderTreeNode) {
    if (n.isPurchased && !n.cycleDetected) {
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
