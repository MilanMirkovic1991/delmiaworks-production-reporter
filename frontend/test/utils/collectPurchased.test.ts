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

  it('collects leaf nodes without WOs and dedupes by arInvtId', () => {
    // NUT appears twice as a leaf with no WOs → collected + deduplicated
    // BOLT appears once as a leaf with no WOs → collected
    // SUB is mid-tree with children → NOT collected even though it has no WO
    const tree = n({
      arInvtId: 1, itemNumber: 'TOP', level: 0,
      children: [
        n({ arInvtId: 2, itemNumber: 'NUT', level: 1, qtyRequired: 10, workOrders: [] }),
        n({ arInvtId: 3, itemNumber: 'SUB', level: 1, workOrders: [], children: [
          n({ arInvtId: 2, itemNumber: 'NUT', level: 2, qtyRequired: 5, workOrders: [] }),
          n({ arInvtId: 4, itemNumber: 'BOLT', level: 2, qtyRequired: 20, workOrders: [] }),
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
    // SUB must not appear
    expect(result.find(r => r.itemNumber === 'SUB')).toBeUndefined();
  });

  it('skips cycleDetected nodes', () => {
    const tree = n({ arInvtId: 1, level: 0, children: [
      n({ arInvtId: 2, itemNumber: 'X', level: 1, cycleDetected: true, qtyRequired: 100, workOrders: [] }),
    ]});
    expect(collectPurchased(tree)).toEqual([]);
  });

  it('does not collect a leaf that has a work order', () => {
    const tree = n({
      arInvtId: 1, itemNumber: 'TOP', level: 0,
      children: [
        n({
          arInvtId: 2, itemNumber: 'MADE-IN-HOUSE', level: 1, qtyRequired: 3, workOrders: [
            { workOrderId: 1, mfgNumber: 'WO-1', mfgDescrip: '', arInvtId: 2, eplantId: 1, priorityLevel: null, startDate: null, status: '' },
          ],
        }),
      ],
    });
    expect(collectPurchased(tree)).toEqual([]);
  });
});
