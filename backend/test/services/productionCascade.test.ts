import { describe, it, expect } from 'vitest';
import { flattenBottomUp, jitterHours, runCascade } from '../../src/services/productionCascade.js';
import type { CascadeWorkOrder, ReportOneResult } from '../../src/services/productionCascade.js';
import type { WorkOrderTreeNode } from '../../src/services/workOrderTreeBuilder.js';
import type { WorkOrderRow } from '../../src/dwClient/workOrders.js';

function cwo(workOrderId: number): CascadeWorkOrder {
  return { arInvtId: workOrderId * 10, itemNumber: `ITEM-${workOrderId}`, level: 0, workOrder: wo(workOrderId) };
}
function okResult(c: CascadeWorkOrder): ReportOneResult {
  return { workOrderId: c.workOrder.workOrderId, mfgNumber: c.workOrder.mfgNumber, itemNumber: c.itemNumber, arInvtId: c.arInvtId, goodPartsQty: 5, productionHours: 1, success: true };
}

function wo(id: number, mfg = `WO-${id}`): WorkOrderRow {
  return { workOrderId: id, mfgNumber: mfg, mfgDescrip: '', arInvtId: 0, eplantId: 13, priorityLevel: null, startDate: null, status: '' };
}
function node(partial: Partial<WorkOrderTreeNode> & { arInvtId: number; level: number }): WorkOrderTreeNode {
  return {
    itemNumber: `ITEM-${partial.arInvtId}`, description: '', rev: '', itemClass: 'MFG',
    isPurchased: false, qtyRequired: 1, uom: 'ea', workOrders: [], children: [],
    ...partial,
  };
}

describe('flattenBottomUp', () => {
  it('emits work orders deepest-first, root last (post-order)', () => {
    // root(1) -> sub(2) -> leaf(3); each manufactured node has one WO
    const tree = node({
      arInvtId: 1, level: 0, workOrders: [wo(1000)],
      children: [
        node({
          arInvtId: 2, level: 1, workOrders: [wo(2000)],
          children: [node({ arInvtId: 3, level: 2, workOrders: [wo(3000)] })],
        }),
      ],
    });
    const order = flattenBottomUp(tree).map(c => c.workOrder.workOrderId);
    expect(order).toEqual([3000, 2000, 1000]);
  });

  it('reports every work order when a node has several', () => {
    const tree = node({ arInvtId: 1, level: 0, workOrders: [wo(1000), wo(1001)] });
    const ids = flattenBottomUp(tree).map(c => c.workOrder.workOrderId);
    expect(ids).toEqual([1000, 1001]);
  });

  it('skips purchased nodes and cycle nodes (and their WOs)', () => {
    const tree = node({
      arInvtId: 1, level: 0, workOrders: [wo(1000)],
      children: [
        node({ arInvtId: 2, level: 1, isPurchased: true, workOrders: [wo(9999)] }),
        node({ arInvtId: 3, level: 1, cycleDetected: true, workOrders: [wo(8888)] }),
        node({ arInvtId: 4, level: 1, workOrders: [wo(4000)] }),
      ],
    });
    const ids = flattenBottomUp(tree).map(c => c.workOrder.workOrderId);
    expect(ids).toEqual([4000, 1000]);
  });

  it('carries node identity (arInvtId, itemNumber, level) with each WO', () => {
    const tree = node({ arInvtId: 7, itemNumber: 'PART-7', level: 0, workOrders: [wo(700)] });
    const [first] = flattenBottomUp(tree);
    expect(first).toMatchObject({ arInvtId: 7, itemNumber: 'PART-7', level: 0 });
    expect(first!.workOrder.workOrderId).toBe(700);
  });

  it('returns empty when there are no manufactured WOs', () => {
    const tree = node({ arInvtId: 1, level: 0, isPurchased: true, workOrders: [] });
    expect(flattenBottomUp(tree)).toEqual([]);
  });
});

describe('jitterHours', () => {
  it('is -15% at rng=0, +15% at rng~1, exact at rng=0.5', () => {
    expect(jitterHours(10, () => 0)).toBeCloseTo(8.5, 6);
    expect(jitterHours(10, () => 0.5)).toBeCloseTo(10, 6);
    expect(jitterHours(10, () => 1)).toBeCloseTo(11.5, 6);
  });

  it('stays within ±15% for any rng in [0,1)', () => {
    for (const r of [0, 0.1, 0.37, 0.5, 0.83, 0.999]) {
      const h = jitterHours(4, () => r);
      expect(h).toBeGreaterThanOrEqual(4 * 0.85 - 1e-9);
      expect(h).toBeLessThanOrEqual(4 * 1.15 + 1e-9);
    }
  });

  it('returns 0 for a 0-hour standard', () => {
    expect(jitterHours(0, () => 0.42)).toBe(0);
  });
});

describe('runCascade', () => {
  it('reports work orders sequentially in the given order', async () => {
    const order: number[] = [];
    const list = [cwo(3000), cwo(2000), cwo(1000)];
    const { results, stoppedOnAuth } = await runCascade(list, async (c) => {
      order.push(c.workOrder.workOrderId);
      return okResult(c);
    }, () => false);
    expect(order).toEqual([3000, 2000, 1000]);
    expect(results.map(r => r.workOrderId)).toEqual([3000, 2000, 1000]);
    expect(results.every(r => r.success)).toBe(true);
    expect(stoppedOnAuth).toBe(false);
  });

  it('records a failure but CONTINUES when one work order errors (non-auth)', async () => {
    const list = [cwo(1), cwo(2), cwo(3)];
    const { results, stoppedOnAuth } = await runCascade(list, async (c) => {
      if (c.workOrder.workOrderId === 2) throw new Error('No recipe card');
      return okResult(c);
    }, () => false);
    expect(stoppedOnAuth).toBe(false);
    expect(results).toHaveLength(3);
    expect(results[1]).toMatchObject({ workOrderId: 2, success: false, error: 'No recipe card' });
    expect(results[0]!.success).toBe(true);
    expect(results[2]!.success).toBe(true);
  });

  it('STOPS immediately on an auth error and reports remaining as not attempted', async () => {
    const seen: number[] = [];
    const list = [cwo(1), cwo(2), cwo(3)];
    const { results, stoppedOnAuth } = await runCascade(list, async (c) => {
      seen.push(c.workOrder.workOrderId);
      if (c.workOrder.workOrderId === 2) throw new Error('401 session expired');
      return okResult(c);
    }, (e) => String((e as Error).message).includes('401'));
    expect(stoppedOnAuth).toBe(true);
    expect(seen).toEqual([1, 2]); // never reaches WO 3
    expect(results.map(r => r.workOrderId)).toEqual([1]); // only the successful one recorded before the stop
  });
});
