import type { WorkOrderRow } from '../dwClient/workOrders.js';
import type { InventoryItem } from '../dwClient/inventory.js';

export type WorkOrderTreeNode = {
  arInvtId: number;
  itemNumber: string;
  description: string;
  rev: string;
  itemClass: string;
  isPurchased: boolean;
  qtyRequired: number;
  uom: string;
  level: number;
  cycleDetected?: boolean;
  workOrders: WorkOrderRow[];
  children: WorkOrderTreeNode[];
};

export type WorkOrderTreeStats = {
  nodeCount: number;
  maxDepth: number;
  cycleCount: number;
  totalWorkOrders: number;
  itemsWithoutWO: number;
};

export type BuildWoTreeInput = {
  rootArInvtId: number;
  rootItemNumber: string;
  rootDescription: string;
  rootRev: string;
  rootItemClass: string;
  qty: number;
  getComponents: (input: { arInvtId: number; qty: number }) => Promise<import('../dwClient/bom.js').BomComponent[]>;
  getWorkOrders: (input: { arInvtId: number }) => Promise<WorkOrderRow[]>;
  getInventoryItem: (arInvtId: number) => Promise<InventoryItem | null>;
};

async function expand(
  arInvtId: number,
  itemNumber: string,
  description: string,
  rev: string,
  itemClass: string,
  isPurchased: boolean,
  qty: number,
  uom: string,
  level: number,
  ancestors: ReadonlySet<number>,
  getComponents: BuildWoTreeInput['getComponents'],
  getWorkOrders: BuildWoTreeInput['getWorkOrders'],
  stats: WorkOrderTreeStats,
): Promise<WorkOrderTreeNode> {
  stats.nodeCount += 1;
  if (level > stats.maxDepth) stats.maxDepth = level;

  if (ancestors.has(arInvtId)) {
    stats.cycleCount += 1;
    return {
      arInvtId, itemNumber, description, rev, itemClass, isPurchased,
      qtyRequired: qty, uom, level, cycleDetected: true, workOrders: [], children: [],
    };
  }

  if (isPurchased) {
    return {
      arInvtId, itemNumber, description, rev, itemClass, isPurchased,
      qtyRequired: qty, uom, level, workOrders: [], children: [],
    };
  }

  // For manufactured nodes: fetch components AND work orders in parallel
  const newAncestors = new Set(ancestors);
  newAncestors.add(arInvtId);

  const [childComps, workOrders] = await Promise.all([
    getComponents({ arInvtId, qty }),
    getWorkOrders({ arInvtId }),
  ]);

  stats.totalWorkOrders += workOrders.length;
  if (workOrders.length === 0) {
    stats.itemsWithoutWO += 1;
  }

  const children = await Promise.all(
    childComps.map(c => {
      // Canonical BOM formula: ptsPer * parent_qty. Fall back to DW's pre-computed
      // Qty (qtyRequired) only when PtsPer is missing/zero. This avoids the
      // 'Qty=0 cascade' seen when DW returns 0 for Qty even with non-zero parent.
      const effectiveQty = c.ptsPer > 0 ? c.ptsPer * qty : c.qtyRequired;
      return expand(
        c.arInvtId, c.itemNumber, c.description, c.rev, c.itemClass, c.isPurchased,
        effectiveQty, c.uom, level + 1, newAncestors, getComponents, getWorkOrders, stats,
      );
    }),
  );

  return {
    arInvtId, itemNumber, description, rev, itemClass, isPurchased,
    qtyRequired: qty, uom, level, workOrders, children,
  };
}

async function enrichTree(
  tree: WorkOrderTreeNode,
  getInventoryItem: (arInvtId: number) => Promise<InventoryItem | null>,
): Promise<void> {
  // Collect unique IDs
  const uniqueIds = new Set<number>();
  (function collect(n: WorkOrderTreeNode) {
    uniqueIds.add(n.arInvtId);
    for (const c of n.children) collect(c);
  })(tree);

  // Fetch all in parallel (one fetch per unique ID)
  const itemMap = new Map<number, InventoryItem>();
  await Promise.all([...uniqueIds].map(async (id) => {
    try {
      const item = await getInventoryItem(id);
      if (item) itemMap.set(id, item);
    } catch {
      // best-effort: if a single ARINVT lookup fails, keep the original data
    }
  }));

  // Overwrite fields — only if ARINVT returned a non-empty value
  (function enrich(n: WorkOrderTreeNode) {
    const item = itemMap.get(n.arInvtId);
    if (item) {
      if (item.itemNumber) n.itemNumber = item.itemNumber;
      if (item.description) n.description = item.description;
      if (item.rev) n.rev = item.rev;
      if (item.itemClass) n.itemClass = item.itemClass;
      n.isPurchased = item.isPurchased;
    }
    for (const c of n.children) enrich(c);
  })(tree);
}

export async function buildWorkOrderTreeWithStats(
  input: BuildWoTreeInput,
): Promise<{ tree: WorkOrderTreeNode | null; stats: WorkOrderTreeStats }> {
  const stats: WorkOrderTreeStats = {
    nodeCount: 0, maxDepth: 0, cycleCount: 0, totalWorkOrders: 0, itemsWithoutWO: 0,
  };

  const rootIsPurchased = input.rootItemClass === 'BUY' ||
    input.rootItemClass.toUpperCase() === 'BUY';

  if (rootIsPurchased) {
    // Purchased root: no WOs, no children — fetch WOs just to be thorough but expect none
    const rootWOs = await input.getWorkOrders({ arInvtId: input.rootArInvtId });
    if (rootWOs.length === 0) {
      return { tree: null, stats };
    }
    // Purchased root with WOs is unusual but handle gracefully
    stats.nodeCount = 1;
    stats.totalWorkOrders = rootWOs.length;
    const tree: WorkOrderTreeNode = {
      arInvtId: input.rootArInvtId,
      itemNumber: input.rootItemNumber,
      description: input.rootDescription,
      rev: input.rootRev,
      itemClass: input.rootItemClass,
      isPurchased: true,
      qtyRequired: input.qty,
      uom: 'ea',
      level: 0,
      workOrders: rootWOs,
      children: [],
    };
    await enrichTree(tree, input.getInventoryItem);
    return { tree, stats };
  }

  // Manufactured root: fetch components + WOs in parallel
  const ancestors = new Set<number>([input.rootArInvtId]);
  const [rootChildren, rootWOs] = await Promise.all([
    input.getComponents({ arInvtId: input.rootArInvtId, qty: input.qty }),
    input.getWorkOrders({ arInvtId: input.rootArInvtId }),
  ]);

  if (rootChildren.length === 0 && rootWOs.length === 0) {
    return { tree: null, stats };
  }

  stats.nodeCount = 1;
  stats.totalWorkOrders += rootWOs.length;
  if (rootWOs.length === 0) {
    stats.itemsWithoutWO += 1;
  }

  const children = await Promise.all(
    rootChildren.map(c => {
      // Canonical BOM formula: ptsPer * parent_qty. See expand() for rationale.
      const effectiveQty = c.ptsPer > 0 ? c.ptsPer * input.qty : c.qtyRequired;
      return expand(
        c.arInvtId, c.itemNumber, c.description, c.rev, c.itemClass, c.isPurchased,
        effectiveQty, c.uom, 1, ancestors, input.getComponents, input.getWorkOrders, stats,
      );
    }),
  );

  const tree: WorkOrderTreeNode = {
    arInvtId: input.rootArInvtId,
    itemNumber: input.rootItemNumber,
    description: input.rootDescription,
    rev: input.rootRev,
    itemClass: input.rootItemClass,
    isPurchased: false,
    qtyRequired: input.qty,
    uom: 'ea',
    level: 0,
    workOrders: rootWOs,
    children,
  };

  if (stats.maxDepth < 1 && children.length > 0) stats.maxDepth = 1;

  await enrichTree(tree, input.getInventoryItem);

  return { tree, stats };
}

export async function buildWorkOrderTree(input: BuildWoTreeInput): Promise<WorkOrderTreeNode | null> {
  const { tree } = await buildWorkOrderTreeWithStats(input);
  return tree;
}
