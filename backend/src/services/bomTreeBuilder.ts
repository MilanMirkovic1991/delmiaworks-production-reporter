import { BomComponent } from '../dwClient/bom.js';

export type BomNode = {
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
  children: BomNode[];
};

export type BomBuildStats = { nodeCount: number; maxDepth: number; cycleCount: number };

export type BuildInput = {
  rootArInvtId: number;
  rootItemNumber: string;
  rootDescription: string;
  rootRev: string;
  rootItemClass: string;
  qty: number;
  getComponents: (input: { arInvtId: number; qty: number }) => Promise<BomComponent[]>;
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
  getComponents: BuildInput['getComponents'],
  stats: BomBuildStats,
): Promise<BomNode> {
  stats.nodeCount += 1;
  if (level > stats.maxDepth) stats.maxDepth = level;

  if (ancestors.has(arInvtId)) {
    stats.cycleCount += 1;
    return {
      arInvtId, itemNumber, description, rev, itemClass, isPurchased,
      qtyRequired: qty, uom, level, cycleDetected: true, children: [],
    };
  }
  if (isPurchased) {
    return { arInvtId, itemNumber, description, rev, itemClass, isPurchased, qtyRequired: qty, uom, level, children: [] };
  }

  const childComps = await getComponents({ arInvtId, qty });
  const newAncestors = new Set(ancestors);
  newAncestors.add(arInvtId);
  const children = await Promise.all(
    childComps.map(c => expand(
      c.arInvtId, c.itemNumber, c.description, c.rev, c.itemClass, c.isPurchased,
      c.qtyRequired, c.uom, level + 1, newAncestors, getComponents, stats,
    )),
  );
  return { arInvtId, itemNumber, description, rev, itemClass, isPurchased, qtyRequired: qty, uom, level, children };
}

export async function buildBomTreeWithStats(input: BuildInput): Promise<{ tree: BomNode | null; stats: BomBuildStats }> {
  const stats: BomBuildStats = { nodeCount: 0, maxDepth: 0, cycleCount: 0 };
  const rootChildren = await input.getComponents({ arInvtId: input.rootArInvtId, qty: input.qty });
  if (rootChildren.length === 0) {
    return { tree: null, stats };
  }
  stats.nodeCount = 1;
  const ancestors = new Set<number>([input.rootArInvtId]);
  const children = await Promise.all(
    rootChildren.map(c => expand(
      c.arInvtId, c.itemNumber, c.description, c.rev, c.itemClass, c.isPurchased,
      c.qtyRequired, c.uom, 1, ancestors, input.getComponents, stats,
    )),
  );
  const tree: BomNode = {
    arInvtId: input.rootArInvtId,
    itemNumber: input.rootItemNumber,
    description: input.rootDescription,
    rev: input.rootRev,
    itemClass: input.rootItemClass,
    isPurchased: false,
    qtyRequired: input.qty,
    uom: 'ea',
    level: 0,
    children,
  };
  if (stats.maxDepth < 1 && children.length > 0) stats.maxDepth = 1;
  return { tree, stats };
}

export async function buildBomTree(input: BuildInput): Promise<BomNode | null> {
  const { tree } = await buildBomTreeWithStats(input);
  return tree;
}
