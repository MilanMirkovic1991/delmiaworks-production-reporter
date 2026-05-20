export type Me = { username: string; eplantId: number };
export type Item = { arInvtId: number; itemNumber: string; description: string; rev: string; itemClass: string; isPurchased: boolean };
export type SalesOrderRow = {
  ordDetailId: number; orderNumber: string; company: string; poNumber: string;
  totalOrdered: number; cummShipped: number; remaining: number; arInvtId: number;
};
export type Release = { releaseId: number; seq: number; qty: number; requestDate: string | null; promiseDate: string | null };
export type BomNode = {
  arInvtId: number; itemNumber: string; description: string; rev: string; itemClass: string;
  isPurchased: boolean; qtyRequired: number; uom: string; level: number;
  cycleDetected?: boolean; children: BomNode[];
};
export type BomTreeResponse = { tree: BomNode | null; reason?: 'NO_BOM'; stats: { nodeCount: number; maxDepth: number; cycleCount: number } };
