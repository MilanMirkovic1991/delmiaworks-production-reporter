/** One unit of demand for a part — a line item's full qty, or a single release's qty. */
export type DemandUnit = {
  arInvtId: number;
  itemNumber: string;
  description: string;
  qty: number;
};

/** A part to produce, with its total quantity summed across all selected demand. */
export type ProducePart = {
  arInvtId: number;
  itemNumber: string;
  description: string;
  qty: number;
};

/**
 * Collapses selected demand (across any number of sales orders / releases) into a
 * production plan: one entry per part (arInvtId) with the quantities summed.
 * Parts whose total is zero or negative are dropped. Item identity is taken from
 * the first occurrence. Order of first appearance is preserved.
 */
export function aggregateDemand(units: DemandUnit[]): ProducePart[] {
  const byPart = new Map<number, ProducePart>();
  for (const unit of units) {
    const existing = byPart.get(unit.arInvtId);
    if (existing) {
      existing.qty += unit.qty;
    } else {
      byPart.set(unit.arInvtId, { arInvtId: unit.arInvtId, itemNumber: unit.itemNumber, description: unit.description, qty: unit.qty });
    }
  }
  return [...byPart.values()].filter(p => p.qty > 0);
}
