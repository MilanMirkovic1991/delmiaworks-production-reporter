import { describe, it, expect } from 'vitest';
import { collectPurchased } from '../../src/utils/collectPurchased.js';
import type { WorkOrderTreeNode } from '../../src/api/types.js';

function n(o: Partial<WorkOrderTreeNode>): WorkOrderTreeNode {
  return {
    arInvtId: 0, itemNumber: '', description: '', rev: '', itemClass: '',
    isPurchased: false, qtyRequired: 0, uom: 'ea', level: 0,
    workOrders: [], children: [],
    ...o,
  };
}

describe('collectPurchased', () => {
  it('returns empty array for null tree', () => {
    expect(collectPurchased(null)).toEqual([]);
  });

  it('collects purchased leaves and dedupes by arInvtId', () => {
    const tree = n({
      arInvtId: 1, itemNumber: 'TOP', isPurchased: false,
      children: [
        n({ arInvtId: 2, itemNumber: 'NUT', isPurchased: true, qtyRequired: 10 }),
        n({ arInvtId: 3, itemNumber: 'SUB', isPurchased: false, children: [
          n({ arInvtId: 2, itemNumber: 'NUT', isPurchased: true, qtyRequired: 5 }),
          n({ arInvtId: 4, itemNumber: 'BOLT', isPurchased: true, qtyRequired: 20 }),
        ]}),
      ],
    });
    const result = collectPurchased(tree);
    expect(result).toHaveLength(2);
    const nut = result.find(r => r.itemNumber === 'NUT')!;
    expect(nut.totalQty).toBe(15);
    expect(nut.occurrences).toBe(2);
    const bolt = result.find(r => r.itemNumber === 'BOLT')!;
    expect(bolt.totalQty).toBe(20);
  });

  it('skips cycleDetected nodes', () => {
    const tree = n({ arInvtId: 1, isPurchased: false, children: [
      n({ arInvtId: 2, itemNumber: 'X', isPurchased: true, cycleDetected: true, qtyRequired: 100 }),
    ]});
    expect(collectPurchased(tree)).toEqual([]);
  });
});
