import { AxiosInstance } from 'axios';

export type InventoryItem = {
  arInvtId: number;
  itemNumber: string;
  description: string;
  rev: string;
  itemClass: string;
  isPurchased: boolean;
};

export type BomMaterial = {
  arInvtId: number;
  itemNumber: string;
  description: string;
  rev: string;
  itemClass: string;
  isPurchased: boolean;
  qtyRequired: number;
  uom: string;
};

const PURCHASED_CLASSES = new Set(['BUY', 'PUR', 'P']);
function detectPurchased(itemClass: string | undefined): boolean {
  if (!itemClass) return false;
  return PURCHASED_CLASSES.has(itemClass.toUpperCase());
}

function pickArray<T = unknown>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object' && 'data' in body && Array.isArray((body as { data: unknown[] }).data)) {
    return (body as { data: T[] }).data;
  }
  return [];
}

export function makeInventoryApi(http: AxiosInstance) {
  return {
    async searchItems(input: { query: string; page?: number; pageSize?: number }): Promise<InventoryItem[]> {
      const res = await http.get('/Manufacturing/Inventory/InventoryList/0', {
        params: {
          searchtext: input.query,
          filterby: 'ItemNo',
          page: input.page ?? 0,
          pageSize: input.pageSize ?? 50,
        },
      });
      return pickArray<Record<string, unknown>>(res.data).map(r => ({
        arInvtId: Number(r.ID ?? r.ArInvtId ?? r.Id),
        itemNumber: String(r.ItemNo ?? r.ItemNumber ?? ''),
        description: String(r.Description ?? ''),
        rev: String(r.Rev ?? ''),
        itemClass: String(r.ItemClass ?? ''),
        isPurchased: detectPurchased(r.ItemClass as string | undefined),
      }));
    },

    async getMaterialsForItem(input: { arInvtId: number; qty: number }): Promise<BomMaterial[]> {
      const res = await http.get('/Manufacturing/Inventory/MaterialsForItem/0', {
        params: { arinvtId: input.arInvtId, qty: input.qty },
      });
      return pickArray<Record<string, unknown>>(res.data).map(r => ({
        arInvtId: Number(r.ArInvtId ?? r.ID),
        itemNumber: String(r.ItemNo ?? r.ItemNumber ?? ''),
        description: String(r.Description ?? ''),
        rev: String(r.Rev ?? ''),
        itemClass: String(r.ItemClass ?? ''),
        isPurchased: detectPurchased(r.ItemClass as string | undefined),
        qtyRequired: Number(r.QtyRequired ?? r.Qty ?? 0),
        uom: String(r.Uom ?? r.UOM ?? ''),
      }));
    },
  };
}
