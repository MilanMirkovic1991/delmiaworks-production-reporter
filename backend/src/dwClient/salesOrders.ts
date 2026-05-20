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
  };
}
