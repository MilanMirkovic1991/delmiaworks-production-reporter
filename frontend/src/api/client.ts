import type { Me, Item, SalesOrderRow, Release, BomTreeResponse, SalesOrderSummary, SalesOrderLineItem, WorkOrderRow, WorkOrderTreeResponse } from './types.js';

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
  login: (body: { baseUrl: string; username: string; password: string; database: string; eplantId: number }) =>
    req<Me>('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  logout: () => req<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  me: () => req<Me>('/api/auth/me'),
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
};
