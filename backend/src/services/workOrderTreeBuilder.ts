import type { WorkOrderRow } from '../dwClient/workOrders.js';

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
    childComps.map(c => expand(
      c.arInvtId, c.itemNumber, c.description, c.rev, c.itemClass, c.isPurchased,
      c.qtyRequired, c.uom, level + 1, newAncestors, getComponents, getWorkOrders, stats,
    )),
  );

  return {
    arInvtId, itemNumber, description, rev, itemClass, isPurchased,
    qtyRequired: qty, uom, level, workOrders, children,
  };
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
    rootChildren.map(c => expand(
      c.arInvtId, c.itemNumber, c.description, c.rev, c.itemClass, c.isPurchased,
      c.qtyRequired, c.uom, 1, ancestors, input.getComponents, input.getWorkOrders, stats,
    )),
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

  return { tree, stats };
}

export async function buildWorkOrderTree(input: BuildWoTreeInput): Promise<WorkOrderTreeNode | null> {
  const { tree } = await buildWorkOrderTreeWithStats(input);
  return tree;
}
