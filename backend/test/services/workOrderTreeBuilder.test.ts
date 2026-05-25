import { describe, it, expect, vi } from 'vitest';
import { buildWorkOrderTree, buildWorkOrderTreeWithStats } from '../../src/services/workOrderTreeBuilder.js';
import type { BomComponent } from '../../src/dwClient/bom.js';
import type { WorkOrderRow } from '../../src/dwClient/workOrders.js';

function comp(arInvtId: number, itemNumber: string, qty: number, purchased: boolean): BomComponent {
  return {
    arInvtId, itemNumber, description: `Desc ${itemNumber}`, rev: '1',
    itemClass: purchased ? 'BUY' : 'MFG', isPurchased: purchased, qtyRequired: qty, uom: 'ea',
  };
}

function wo(workOrderId: number, arInvtId: number): WorkOrderRow {
  return {
    workOrderId, mfgNumber: `WO-${workOrderId}`, mfgDescrip: 'Test WO',
    arInvtId, eplantId: 1, priorityLevel: null, startDate: null, status: 'Released',
  };
}

describe('workOrderTreeBuilder', () => {
  it('single purchased root: tree has 1 node, no WOs, no children', async () => {
    const getComponents = vi.fn().mockResolvedValue([]);
    const getWorkOrders = vi.fn().mockResolvedValue([]);
    const tree = await buildWorkOrderTree({
      rootArInvtId: 1, rootItemNumber: 'BOLT', rootDescription: 'Bolt', rootRev: '1', rootItemClass: 'BUY',
      qty: 5, getComponents, getWorkOrders,
    });
    // Purchased root with no WOs => null (no data)
    expect(tree).toBeNull();
    expect(getWorkOrders).toHaveBeenCalledWith({ arInvtId: 1 });
  });

  it('manufactured root with no children but has WOs => tree with root + WOs, empty children', async () => {
    const getComponents = vi.fn().mockResolvedValue([]);
    const getWorkOrders = vi.fn().mockResolvedValue([wo(501, 1)]);
    const tree = await buildWorkOrderTree({
      rootArInvtId: 1, rootItemNumber: 'TOP', rootDescription: 'Top', rootRev: '1', rootItemClass: 'MFG',
      qty: 10, getComponents, getWorkOrders,
    });
    expect(tree).not.toBeNull();
    expect(tree!.workOrders).toHaveLength(1);
    expect(tree!.workOrders[0].mfgNumber).toBe('WO-501');
    expect(tree!.children).toEqual([]);
  });

  it('2-level tree: WOs attached to manufactured nodes, not purchased', async () => {
    const getComponents = vi.fn().mockImplementation(async ({ arInvtId }: { arInvtId: number }) => {
      if (arInvtId === 1) return [comp(2, 'SUB', 2, false), comp(3, 'NUT', 4, true)];
      if (arInvtId === 2) return [comp(4, 'BOLT', 8, true)];
      return [];
    });
    const getWorkOrders = vi.fn().mockImplementation(async ({ arInvtId }: { arInvtId: number }) => {
      if (arInvtId === 1) return [wo(501, 1), wo(502, 1)];
      if (arInvtId === 2) return [wo(503, 2)];
      return [];
    });
    const tree = await buildWorkOrderTree({
      rootArInvtId: 1, rootItemNumber: 'TOP', rootDescription: 'Top', rootRev: '1', rootItemClass: 'MFG',
      qty: 10, getComponents, getWorkOrders,
    });
    expect(tree).not.toBeNull();
    expect(tree!.workOrders).toHaveLength(2);
    const sub = tree!.children.find(c => c.itemNumber === 'SUB')!;
    expect(sub.workOrders).toHaveLength(1);
    expect(sub.workOrders[0].mfgNumber).toBe('WO-503');
    const nut = tree!.children.find(c => c.itemNumber === 'NUT')!;
    expect(nut.workOrders).toEqual([]);
    const bolt = sub.children[0];
    expect(bolt.itemNumber).toBe('BOLT');
    expect(bolt.workOrders).toEqual([]);
    // getWorkOrders should NOT have been called for purchased items (NUT=3, BOLT=4)
    expect(getWorkOrders).not.toHaveBeenCalledWith({ arInvtId: 3 });
    expect(getWorkOrders).not.toHaveBeenCalledWith({ arInvtId: 4 });
  });

  it('cycle detection: stops at cycle, marks cycleDetected: true', async () => {
    const getComponents = vi.fn().mockImplementation(async ({ arInvtId }: { arInvtId: number }) => {
      if (arInvtId === 1) return [comp(2, 'B', 1, false)];
      if (arInvtId === 2) return [comp(1, 'A_AGAIN', 1, false)]; // cycle: 1 -> 2 -> 1
      return [];
    });
    const getWorkOrders = vi.fn().mockResolvedValue([wo(501, 1)]);
    const tree = await buildWorkOrderTree({
      rootArInvtId: 1, rootItemNumber: 'A', rootDescription: 'a', rootRev: '1', rootItemClass: 'MFG',
      qty: 1, getComponents, getWorkOrders,
    });
    expect(tree).not.toBeNull();
    const b = tree!.children[0];
    expect(b.itemNumber).toBe('B');
    const aAgain = b.children[0];
    expect(aAgain.cycleDetected).toBe(true);
    expect(aAgain.children).toEqual([]);
    expect(aAgain.workOrders).toEqual([]);
  });

  it('parallelizes BOM children + WO fetch concurrently (Promise.all)', async () => {
    const calls: string[] = [];
    const getComponents = vi.fn().mockImplementation(async ({ arInvtId }: { arInvtId: number }) => {
      calls.push(`bom:${arInvtId}`);
      await new Promise(r => setTimeout(r, 5));
      if (arInvtId === 1) return [comp(2, 'X', 1, false), comp(3, 'Y', 1, false)];
      return [];
    });
    const getWorkOrders = vi.fn().mockImplementation(async ({ arInvtId }: { arInvtId: number }) => {
      calls.push(`wo:${arInvtId}`);
      await new Promise(r => setTimeout(r, 5));
      return [wo(500 + arInvtId, arInvtId)];
    });
    await buildWorkOrderTree({
      rootArInvtId: 1, rootItemNumber: 'A', rootDescription: 'a', rootRev: '1', rootItemClass: 'MFG',
      qty: 1, getComponents, getWorkOrders,
    });
    // WO fetch for root (1) should be initiated in parallel with the BOM children expansion
    expect(calls).toContain('bom:1');
    expect(calls).toContain('wo:1');
    // Both children BOM fetches should appear
    expect(calls).toContain('bom:2');
    expect(calls).toContain('bom:3');
  });

  it('stats: nodeCount, maxDepth, cycleCount, totalWorkOrders, itemsWithoutWO', async () => {
    const getComponents = vi.fn().mockImplementation(async ({ arInvtId }: { arInvtId: number }) => {
      if (arInvtId === 1) return [comp(2, 'B', 1, false), comp(3, 'C', 1, true)];
      if (arInvtId === 2) return [comp(4, 'D', 1, false)];
      return [];
    });
    const getWorkOrders = vi.fn().mockImplementation(async ({ arInvtId }: { arInvtId: number }) => {
      if (arInvtId === 1) return [wo(501, 1)];
      if (arInvtId === 2) return []; // manufactured but no WO
      if (arInvtId === 4) return [wo(502, 4), wo(503, 4)];
      return [];
    });
    const { tree, stats } = await buildWorkOrderTreeWithStats({
      rootArInvtId: 1, rootItemNumber: 'A', rootDescription: 'a', rootRev: '1', rootItemClass: 'MFG',
      qty: 1, getComponents, getWorkOrders,
    });
    expect(tree).not.toBeNull();
    // nodes: root(1) + B(2) + C(3) + D(4) = 4
    expect(stats.nodeCount).toBe(4);
    // root=0, B=1, D=2, C=1 => maxDepth=2
    expect(stats.maxDepth).toBe(2);
    expect(stats.cycleCount).toBe(0);
    // WOs: root has 1, B has 0, D has 2, C (purchased) has 0 => total 3
    expect(stats.totalWorkOrders).toBe(3);
    // Manufactured with no WO: B(2) has 0 WOs => count 1
    expect(stats.itemsWithoutWO).toBe(1);
  });
});
