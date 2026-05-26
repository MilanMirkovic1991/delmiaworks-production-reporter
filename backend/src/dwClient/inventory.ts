import { AxiosInstance } from 'axios';
import { pickArray } from './shared.js';

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

    async getById(arInvtId: number): Promise<InventoryItem | null> {
      try {
        const res = await http.get(`/Manufacturing/Inventory/InventoryItem/${arInvtId}`);
        const raw = res.data?.data ?? res.data;
        if (!raw || typeof raw !== 'object') return null;
        const r = raw as Record<string, unknown>;
        // Some DW endpoints wrap a single item in an array; handle both shapes
        const obj = Array.isArray(raw) ? (raw[0] as Record<string, unknown> | undefined) : r;
        if (!obj) return null;
        const id = Number(obj.Id ?? obj.ID ?? obj.ArInvtId ?? arInvtId);
        if (!Number.isFinite(id)) return null;
        const cls = (obj.InventoryClass ?? obj.ItemClass) as string | undefined;
        return {
          arInvtId: id,
          itemNumber: String(obj.ItemNumber ?? obj.ItemNo ?? ''),
          description: String(obj.Description ?? ''),
          rev: String(obj.Rev ?? ''),
          itemClass: String(cls ?? ''),
          isPurchased: detectPurchased(cls),
        };
      } catch (e: unknown) {
        if (e && typeof e === 'object' && 'response' in e) {
          const resp = (e as { response?: { status?: number } }).response;
          if (resp?.status === 404) return null;
        }
        throw e;
      }
    },

    async getMaterialsForItem(input: { arInvtId: number; qty: number }): Promise<BomMaterial[]> {
      const res = await http.get('/Manufacturing/Inventory/MaterialsForItem/0', {
        params: { arinvtId: input.arInvtId, qty: input.qty },
      });
      return pickArray<Record<string, unknown>>(res.data)
        .map(r => {
          // DW MaterialsForItem response uses Id (not ArInvtId), InventoryClass (not ItemClass),
          // Qty (not QtyRequired), Unit (not Uom), ItemNumber (not ItemNo).
          const id = Number(r.Id ?? r.ArInvtId ?? r.ID);
          const cls = (r.InventoryClass ?? r.ItemClass) as string | undefined;
          return {
            arInvtId: id,
            itemNumber: String(r.ItemNumber ?? r.ItemNo ?? ''),
            description: String(r.Description ?? ''),
            rev: String(r.Rev ?? ''),
            itemClass: String(cls ?? ''),
            isPurchased: detectPurchased(cls),
            qtyRequired: Number(r.Qty ?? r.QtyRequired ?? 0),
            uom: String(r.Unit ?? r.Uom ?? r.UOM ?? ''),
          };
        })
        // Defensive: skip rows where the ID didn't parse (prevents NaN cascade in recursion)
        .filter(c => Number.isFinite(c.arInvtId));
    },
  };
}
