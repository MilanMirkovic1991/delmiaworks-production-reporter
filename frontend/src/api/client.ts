import type { Me, Item, SalesOrderRow, Release, BomTreeResponse, SalesOrderSummary, SalesOrderLineItem, WorkOrderRow, WorkOrderTreeResponse, EPlant } from './types.js';

export type ReceiptRow = {
  poDetailId: number;
  poReleaseId: number;
  arInvtId: number;
  itemNumber: string;
  qtyReceived: number;
  lotNo?: number;
  /** MASTER_LABEL.SERIALNO sent to DW (7-digit padded, globally sequential). */
  serialNo?: string;
  success: boolean;
  poReceiptId?: number;
  fgMultiId?: number;
  masterLabelId?: number;
  error?: string;
};

export type RetryRow = {
  poDetailId: number;
  poReleaseId: number;
  arInvtId: number;
  itemNumber: string;
  qtyReceived: number;
  poReceiptId?: number;
  priorError?: string;
};

export type WarningKind = 'NO_RECIPE' | 'RECIPE_UNRELIABLE' | 'ORPHAN_LABEL' | 'SERIAL_FRACTIONAL';

export type ReceiptWarning = {
  kind: WarningKind;
  message: string;
  items: Array<{ arInvtId: number; itemNumber: string }>;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message ?? `${res.status}`) as Error & { code?: string; status?: number };
    err.code = body.error;
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  login: (body: { baseUrl: string; username: string; password: string; database: string }) =>
    req<Me>('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  logout: () => req<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  me: () => req<Me>('/api/auth/me'),
  listEPlants: () => req<{ eplants: EPlant[] }>('/api/eplants'),
  selectEPlant: (eplantId: number) =>
    req<{ ok: true; eplantId: number }>('/api/auth/select-eplant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eplantId }),
    }),
  searchItems: (q: string) => req<{ items: Item[] }>(`/api/items?q=${encodeURIComponent(q)}`),
  salesOrdersForItem: (arInvtId: number) => req<{ salesOrders: SalesOrderRow[] }>(`/api/items/${arInvtId}/sales-orders`),
  releasesForSO: (ordDetailId: number) => req<{ releases: Release[] }>(`/api/sales-orders/${ordDetailId}/releases`),
  bomTree: (itemId: number, qty: number) => req<BomTreeResponse>(`/api/bom-tree?itemId=${itemId}&qty=${qty}`),
  listSalesOrders: () => req<{ salesOrders: SalesOrderSummary[] }>('/api/sales-orders'),
  salesOrderLineItems: (salesOrderId: number) =>
    req<{ lineItems: SalesOrderLineItem[] }>(`/api/sales-orders/${salesOrderId}/line-items`),
  workOrdersForPart: (arInvtId: number) =>
    req<{ workOrders: WorkOrderRow[] }>(`/api/work-orders?arInvtId=${arInvtId}`),
  workOrderTree: (arInvtId: number, qty: number) =>
    req<WorkOrderTreeResponse>(`/api/work-order-tree?arInvtId=${arInvtId}&qty=${qty}`),
  createPO: (items: Array<{ arInvtId: number; quantity: number }>) =>
    req<{
      poId: number;
      poNo: string | null;
      approved: boolean;
      approvalError?: string;
      lineItems: Array<{ arInvtId: number; quantity: number; success: boolean; poDetailId?: number; releaseId?: number; error?: string }>;
    }>('/api/po/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    }),
  receivePO: (poId: number) =>
    req<{ poId: number; receipts: ReceiptRow[] }>(`/api/po/${poId}/receive`, { method: 'POST' }),
  retryReceipts: (poId: number, rows: RetryRow[]) =>
    req<{ poId: number; receipts: ReceiptRow[] }>(`/api/po/${poId}/receive-retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    }),
  validateReceipt: (poId: number, items: Array<{ arInvtId: number; itemNumber: string; quantity: number }>) =>
    req<{ poId: number; warnings: ReceiptWarning[] }>(`/api/po/${poId}/receive-validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    }),
};
