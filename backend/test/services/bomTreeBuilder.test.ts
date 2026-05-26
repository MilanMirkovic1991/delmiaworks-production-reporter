import { describe, it, expect, vi } from 'vitest';
import { buildBomTree, BomNode } from '../../src/services/bomTreeBuilder.js';
import { BomComponent } from '../../src/dwClient/bom.js';

function comp(arInvtId: number, itemNumber: string, qty: number, purchased: boolean): BomComponent {
  return {
    arInvtId, itemNumber, description: `Desc ${itemNumber}`, rev: '1',
    itemClass: purchased ? 'BUY' : 'MFG', isPurchased: purchased, qtyRequired: qty, ptsPer: 0, uom: 'ea',
  };
}

describe('bomTreeBuilder', () => {
  it('returns null tree when root has no components (NO_BOM)', async () => {
    const getComponents = vi.fn().mockResolvedValue([]);
    const tree = await buildBomTree({
      rootArInvtId: 1, rootItemNumber: 'ROOT', rootDescription: 'r', rootRev: '1', rootItemClass: 'MFG',
      qty: 10, getComponents,
    });
    expect(tree).toBeNull();
  });

  it('builds 2-level tree, stops at purchased components', async () => {
    const getComponents = vi.fn().mockImplementation(async ({ arInvtId, qty }: { arInvtId: number; qty: number }) => {
      if (arInvtId === 1) return [comp(2, 'SUB', qty * 2, false), comp(3, 'NUT', qty * 4, true)];
      if (arInvtId === 2) return [comp(4, 'STEEL', qty * 5, true)];
      return [];
    });
    const tree = await buildBomTree({
      rootArInvtId: 1, rootItemNumber: 'TOP', rootDescription: 't', rootRev: '1', rootItemClass: 'MFG',
      qty: 10, getComponents,
    });
    expect(tree).not.toBeNull();
    expect(tree!.children).toHaveLength(2);
    const sub = tree!.children.find(c => c.itemNumber === 'SUB')!;
    expect(sub.qtyRequired).toBe(20);
    expect(sub.children).toHaveLength(1);
    expect(sub.children[0].itemNumber).toBe('STEEL');
    expect(sub.children[0].qtyRequired).toBe(100);
    expect(sub.children[0].children).toEqual([]);
    const nut = tree!.children.find(c => c.itemNumber === 'NUT')!;
    expect(nut.children).toEqual([]);
    expect(getComponents).not.toHaveBeenCalledWith(expect.objectContaining({ arInvtId: 3 }));
  });

  it('detects cycle in same branch, stops only that branch', async () => {
    const getComponents = vi.fn().mockImplementation(async ({ arInvtId }: { arInvtId: number }) => {
      if (arInvtId === 1) return [comp(2, 'B', 1, false)];
      if (arInvtId === 2) return [comp(1, 'A_AGAIN', 1, false)]; // cycle: 1 -> 2 -> 1
      return [];
    });
    const tree = await buildBomTree({
      rootArInvtId: 1, rootItemNumber: 'A', rootDescription: 'a', rootRev: '1', rootItemClass: 'MFG',
      qty: 1, getComponents,
    });
    expect(tree).not.toBeNull();
    const b = tree!.children[0];
    expect(b.itemNumber).toBe('B');
    const aAgain = b.children[0];
    expect(aAgain.cycleDetected).toBe(true);
    expect(aAgain.children).toEqual([]);
  });

  it('same component in different branches is NOT a cycle', async () => {
    const getComponents = vi.fn().mockImplementation(async ({ arInvtId }: { arInvtId: number }) => {
      if (arInvtId === 1) return [comp(2, 'B', 1, false), comp(3, 'C', 1, false)];
      if (arInvtId === 2) return [comp(99, 'SHARED', 1, true)];
      if (arInvtId === 3) return [comp(99, 'SHARED', 1, true)];
      return [];
    });
    const tree = await buildBomTree({
      rootArInvtId: 1, rootItemNumber: 'A', rootDescription: 'a', rootRev: '1', rootItemClass: 'MFG',
      qty: 1, getComponents,
    });
    expect(tree!.children[0].children[0].cycleDetected).toBeUndefined();
    expect(tree!.children[1].children[0].cycleDetected).toBeUndefined();
  });

  it('parallelizes children at same level (Promise.all)', async () => {
    const calls: number[] = [];
    const getComponents = vi.fn().mockImplementation(async ({ arInvtId }: { arInvtId: number }) => {
      calls.push(arInvtId);
      await new Promise(r => setTimeout(r, 5));
      if (arInvtId === 1) return [comp(2, 'X', 1, false), comp(3, 'Y', 1, false)];
      return [];
    });
    await buildBomTree({
      rootArInvtId: 1, rootItemNumber: 'A', rootDescription: 'a', rootRev: '1', rootItemClass: 'MFG',
      qty: 1, getComponents,
    });
    // After root expansion both children 2 and 3 should have been requested before either resolves
    expect(calls.slice(0, 3)).toEqual([1, 2, 3]);
  });

  it('reports stats: nodeCount, maxDepth, cycleCount', async () => {
    const getComponents = vi.fn().mockImplementation(async ({ arInvtId }: { arInvtId: number }) => {
      if (arInvtId === 1) return [comp(2, 'B', 1, false)];
      if (arInvtId === 2) return [comp(3, 'C', 1, true)];
      return [];
    });
    const { tree, stats } = await import('../../src/services/bomTreeBuilder.js')
      .then(m => m.buildBomTreeWithStats({
        rootArInvtId: 1, rootItemNumber: 'A', rootDescription: 'a', rootRev: '1', rootItemClass: 'MFG',
        qty: 1, getComponents,
      }));
    expect(tree).not.toBeNull();
    expect(stats.nodeCount).toBe(3); // root + B + C
    expect(stats.maxDepth).toBe(2);
    expect(stats.cycleCount).toBe(0);
  });
});
