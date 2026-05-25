import { AxiosInstance } from 'axios';
import { buildFilter } from './filter.js';
import { pickArray } from './shared.js';

export type SalesOrderRow = {
  ordDetailId: number;
  orderNumber: string;
  company: string;
  poNumber: string;
  totalOrdered: number;
  cummShipped: number;
  remaining: number;
  arInvtId: number;
};

export type SalesOrderRelease = {
  releaseId: number;
  seq: number;
  qty: number;
  requestDate: string | null;
  promiseDate: string | null;
};

export type SalesOrderSummary = {
  salesOrderId: number;       // ORDERS.ID
  orderNumber: string;
  customerNumber: string;
  company: string;
  poNumber: string;
  dateTaken: string | null;
  status: string;
  lineCount: number;          // number of distinct OrdDetailId rows
  totalOrdered: number;       // sum across lines
  totalShipped: number;
  totalRemaining: number;
};

export type SalesOrderLineItem = {
  ordDetailId: number;        // the per-line ID (used to fetch releases)
  arInvtId: number;
  itemNumber: string;
  description: string;
  rev: string;
  itemClass: string;
  totalOrdered: number;
  cummShipped: number;
  remaining: number;
  uom: string;
};

export function makeSalesOrdersApi(http: AxiosInstance) {
  return {
    async listForItem(input: { arInvtId: number; eplantId: number }): Promise<SalesOrderRow[]> {
      const filter = buildFilter({
        ArInvtId: input.arInvtId,
        Status: 'Active',
        EPlantId: input.eplantId,
      });
      const res = await http.get('/SalesDistribution/SalesOrder/SalesOrder/0', {
        params: { filter },
      });
      const rows = pickArray<Record<string, unknown>>(res.data);
      const byDetail = new Map<number, SalesOrderRow>();
      for (const r of rows) {
        const ordDetailId = Number(r.OrdDetailId);
        if (byDetail.has(ordDetailId)) continue;
        const totalOrdered = Number(r.TotalQTYOrdered ?? 0);
        const cummShipped = Number(r.CummShipped ?? 0);
        byDetail.set(ordDetailId, {
          ordDetailId,
          orderNumber: String(r.OrderNumber ?? ''),
          company: String(r.Company ?? ''),
          poNumber: String(r.PONumber ?? ''),
          totalOrdered,
          cummShipped,
          remaining: Math.max(0, totalOrdered - cummShipped),
          arInvtId: Number(r.ArInvtId ?? 0),
        });
      }
      return [...byDetail.values()];
    },

    async getReleases(input: { ordDetailId: number }): Promise<SalesOrderRelease[]> {
      const res = await http.get('/SalesDistribution/SalesOrder/SalesOrderReleases/0', {
        params: { salesOrderDetailId: input.ordDetailId },
      });
      return pickArray<Record<string, unknown>>(res.data).map(r => ({
        releaseId: Number(r.Id ?? r.ID),
        seq: Number(r.Seq ?? 0),
        qty: Number(r.Qty ?? 0),
        requestDate: r.RequestDate ? String(r.RequestDate) : null,
        promiseDate: r.PromiseDate ? String(r.PromiseDate) : null,
      }));
    },

    async listActive(input: { eplantId: number }): Promise<SalesOrderSummary[]> {
      const filter = buildFilter({
        Status: 'Active',
        EPlantId: input.eplantId,
      });
      const res = await http.get('/SalesDistribution/SalesOrder/SalesOrder/0', {
        params: { filter },
      });
      const rows = pickArray<Record<string, unknown>>(res.data);

      // Aggregate by SO header Id
      const byId = new Map<number, { header: Record<string, unknown>; detailIds: Set<number>; totalOrdered: number; totalShipped: number }>();
      for (const r of rows) {
        const salesOrderId = Number(r.Id);
        const ordDetailId = Number(r.OrdDetailId);
        if (!byId.has(salesOrderId)) {
          byId.set(salesOrderId, { header: r, detailIds: new Set(), totalOrdered: 0, totalShipped: 0 });
        }
        const agg = byId.get(salesOrderId)!;
        if (!agg.detailIds.has(ordDetailId)) {
          agg.detailIds.add(ordDetailId);
          agg.totalOrdered += Number(r.TotalQTYOrdered ?? 0);
          agg.totalShipped += Number(r.CummShipped ?? 0);
        }
      }

      return [...byId.entries()].map(([salesOrderId, agg]) => {
        const h = agg.header;
        const totalOrdered = agg.totalOrdered;
        const totalShipped = agg.totalShipped;
        return {
          salesOrderId,
          orderNumber: String(h.OrderNumber ?? ''),
          customerNumber: String(h.CustomerNumber ?? ''),
          company: String(h.Company ?? ''),
          poNumber: String(h.PONumber ?? ''),
          dateTaken: h.DateTaken ? String(h.DateTaken) : null,
          status: String(h.Status ?? ''),
          lineCount: agg.detailIds.size,
          totalOrdered,
          totalShipped,
          totalRemaining: Math.max(0, totalOrdered - totalShipped),
        };
      });
    },

    async getLineItems(input: { salesOrderId: number }): Promise<SalesOrderLineItem[]> {
      const filter = buildFilter({ Id: input.salesOrderId });
      const res = await http.get('/SalesDistribution/SalesOrder/SalesOrder/0', {
        params: { filter },
      });
      const rows = pickArray<Record<string, unknown>>(res.data);
      const byDetail = new Map<number, SalesOrderLineItem>();
      for (const r of rows) {
        // Defensive client-side filter in case the endpoint ignores the Id filter
        if (Number(r.Id) !== input.salesOrderId) continue;
        const ordDetailId = Number(r.OrdDetailId);
        if (byDetail.has(ordDetailId)) continue;
        const totalOrdered = Number(r.TotalQTYOrdered ?? 0);
        const cummShipped = Number(r.CummShipped ?? 0);
        byDetail.set(ordDetailId, {
          ordDetailId,
          arInvtId: Number(r.ArInvtId ?? 0),
          itemNumber: String(r.ItemNumber ?? ''),
          description: String(r.Description ?? ''),
          rev: String(r.Rev ?? ''),
          itemClass: String(r.ItemClass ?? ''),
          totalOrdered,
          cummShipped,
          remaining: Math.max(0, totalOrdered - cummShipped),
          uom: String(r.UOM ?? ''),
        });
      }
      return [...byDetail.values()];
    },
  };
}
