import { describe, it, expect } from 'vitest';
import { aggregateDemand, type DemandUnit } from '../../src/utils/aggregateDemand.js';

const u = (arInvtId: number, itemNumber: string, qty: number, description = ''): DemandUnit =>
  ({ arInvtId, itemNumber, description, qty });

describe('aggregateDemand', () => {
  it('sums the same part (arInvtId) across many demand units / sales orders', () => {
    const plan = aggregateDemand([
      u(1, 'PART-A', 50),   // SO-1 full
      u(2, 'SUB', 20),      // SO-1 other part
      u(1, 'PART-A', 40),   // SO-2 full -> PART-A now 90
      u(1, 'PART-A', 10),   // SO-2 a release -> PART-A now 100
    ]);
    const byId = Object.fromEntries(plan.map(p => [p.arInvtId, p.qty]));
    expect(byId).toEqual({ 1: 100, 2: 20 });
  });

  it('keeps item identity (itemNumber, description) from the first occurrence', () => {
    const plan = aggregateDemand([u(7, 'PART-7', 5, 'Widget 7'), u(7, 'PART-7', 3, 'Widget 7')]);
    expect(plan).toEqual([{ arInvtId: 7, itemNumber: 'PART-7', description: 'Widget 7', qty: 8 }]);
  });

  it('drops parts whose total quantity is zero or negative', () => {
    const plan = aggregateDemand([u(1, 'A', 0), u(2, 'B', -5), u(3, 'C', 4)]);
    expect(plan.map(p => p.arInvtId)).toEqual([3]);
  });

  it('returns an empty plan for no demand', () => {
    expect(aggregateDemand([])).toEqual([]);
  });
});
