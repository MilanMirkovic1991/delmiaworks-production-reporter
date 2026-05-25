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

export type SalesOrderSummary = {
  salesOrderId: number; orderNumber: string; customerNumber: string;
  company: string; poNumber: string; dateTaken: string | null;
  status: string; lineCount: number; totalOrdered: number;
  totalShipped: number; totalRemaining: number;
};

export type SalesOrderLineItem = {
  ordDetailId: number; arInvtId: number; itemNumber: string;
  description: string; rev: string; itemClass: string;
  totalOrdered: number; cummShipped: number; remaining: number; uom: string;
};

export type WorkOrderRow = {
  workOrderId: number; mfgNumber: string; mfgDescrip: string;
  arInvtId: number; eplantId: number;
  priorityLevel: number | null; startDate: string | null; status: string;
};

export type WorkOrderTreeNode = {
  arInvtId: number; itemNumber: string; description: string; rev: string;
  itemClass: string; isPurchased: boolean; qtyRequired: number; uom: string;
  level: number; cycleDetected?: boolean;
  workOrders: WorkOrderRow[];
  children: WorkOrderTreeNode[];
};
export type WorkOrderTreeStats = {
  nodeCount: number; maxDepth: number; cycleCount: number;
  totalWorkOrders: number; itemsWithoutWO: number;
};
export type WorkOrderTreeResponse = {
  tree: WorkOrderTreeNode | null;
  reason?: 'NO_DATA';
  stats: WorkOrderTreeStats;
};
