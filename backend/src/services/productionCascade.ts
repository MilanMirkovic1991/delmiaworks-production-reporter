import type { WorkOrderTreeNode } from './workOrderTreeBuilder.js';
import type { WorkOrderRow } from '../dwClient/workOrders.js';

export type CascadeWorkOrder = {
  arInvtId: number;
  itemNumber: string;
  level: number;
  workOrder: WorkOrderRow;
};

/**
 * Flattens a work-order tree into the order production should be reported:
 * bottom-up (deepest first, root last). Post-order traversal guarantees every
 * node's work orders come AFTER all of its descendants' work orders — children
 * are produced before the parent that consumes them.
 *
 * Purchased and cycle-detected nodes are skipped (they carry no work orders to
 * report; purchased items are consumed, not produced).
 */
export function flattenBottomUp(tree: WorkOrderTreeNode): CascadeWorkOrder[] {
  const out: CascadeWorkOrder[] = [];
  (function visit(n: WorkOrderTreeNode) {
    for (const child of n.children) visit(child); // descendants first
    if (n.isPurchased || n.cycleDetected) return;
    for (const workOrder of n.workOrders) {
      out.push({ arInvtId: n.arInvtId, itemNumber: n.itemNumber, level: n.level, workOrder });
    }
  })(tree);
  return out;
}

/**
 * Varies a standard production time by ±15%, using an injected RNG so callers
 * (and tests) control randomness. rng() must return a value in [0, 1).
 * Quantity is never touched — only the reported time is jittered.
 */
export function jitterHours(standardHours: number, rng: () => number): number {
  return standardHours * (0.85 + rng() * 0.30);
}

/** Outcome of reporting production for a single work order. */
export type ReportOneResult = {
  workOrderId: number;
  mfgNumber: string;
  itemNumber: string;
  arInvtId: number;
  goodPartsQty: number;
  productionHours: number;
  success: boolean;
  error?: string;
};

/**
 * Runs the cascade sequentially (DW Oracle sequences race under parallel writes,
 * so one-at-a-time is deliberate). For each work order it calls `reportOne`:
 * - a plain DW error is recorded as a failed result and the cascade CONTINUES;
 * - an auth error (session expired) STOPS the cascade immediately, since every
 *   remaining call would fail the same way.
 */
export async function runCascade(
  workOrders: CascadeWorkOrder[],
  reportOne: (cwo: CascadeWorkOrder) => Promise<ReportOneResult>,
  isAuthError: (e: unknown) => boolean,
): Promise<{ results: ReportOneResult[]; stoppedOnAuth: boolean }> {
  const results: ReportOneResult[] = [];
  for (const cwo of workOrders) {
    try {
      results.push(await reportOne(cwo));
    } catch (e) {
      if (isAuthError(e)) return { results, stoppedOnAuth: true };
      results.push({
        workOrderId: cwo.workOrder.workOrderId,
        mfgNumber: cwo.workOrder.mfgNumber,
        itemNumber: cwo.itemNumber,
        arInvtId: cwo.arInvtId,
        goodPartsQty: 0,
        productionHours: 0,
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { results, stoppedOnAuth: false };
}
