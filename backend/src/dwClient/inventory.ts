import { AxiosInstance } from 'axios';
import { pickArray } from './shared.js';
import { logger } from '../logger.js';

export type InventoryItem = {
  arInvtId: number;
  itemNumber: string;
  description: string;
  rev: string;
  itemClass: string;
  isPurchased: boolean;
  /**
   * Cost-recipe signal for the pre-receive validator (group A).
   * true/false when DW exposes a recipe field; undefined when no such field is
   * present (signal unreliable - validator warns "nepouzdano" rather than guessing).
   */
  hasRecipe?: boolean;
  /** true if the item is serial-tracked (group C: serialized + fractional qty). */
  isSerialized?: boolean;
};

export type BomMaterial = {
  arInvtId: number;
  itemNumber: string;
  description: string;
  rev: string;
  itemClass: string;
  isPurchased: boolean;
  qtyRequired: number;
  ptsPer: number;
  uom: string;
};

let sampledMaterialsForItem = false;

const PURCHASED_CLASSES = new Set(['BUY', 'PUR', 'P']);
function detectPurchased(itemClass: string | undefined): boolean {
  if (!itemClass) return false;
  return PURCHASED_CLASSES.has(itemClass.toUpperCase());
}

// Candidate DW field names for the recipe/serial signals. The FIRST key that
// exists on the InventoryItem row wins. Confirm/narrow these against the DW test
// VM (peek-inventory-item.ts) and move the real key to the front of each list.
const RECIPE_KEYS = ['RecipeExists', 'HasRecipe', 'CostRecipeId', 'RecipeCardId'];
const SERIAL_KEYS = ['Serialized', 'IsSerialized', 'SerialTracking', 'LotSerial'];

/** Reads the first present key as a boolean; undefined when no candidate key is present. */
function readBoolMeta(obj: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const k of keys) {
    if (k in obj) {
      const v = obj[k];
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v > 0;
      if (typeof v === 'string') return ['y', 'yes', 'true', '1'].includes(v.trim().toLowerCase());
      return Boolean(v);
    }
  }
  return undefined;
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
        const cls = (obj.InventoryClass ?? obj.Class ?? obj.ItemClass) as string | undefined;
        return {
          arInvtId: id,
          itemNumber: String(obj.ItemNumber ?? obj.ItemNo ?? obj.Itemno ?? ''),
          description: String(obj.Description ?? obj.Descrip ?? ''),
          rev: String(obj.Rev ?? ''),
          itemClass: String(cls ?? ''),
          isPurchased: detectPurchased(cls),
          hasRecipe: readBoolMeta(obj, RECIPE_KEYS),
          isSerialized: readBoolMeta(obj, SERIAL_KEYS) ?? false,
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
      const rows = pickArray<Record<string, unknown>>(res.data);
      if (rows.length > 0 && !sampledMaterialsForItem) {
        sampledMaterialsForItem = true;
        const first = rows[0]!;
        logger.info({
          endpoint: 'MaterialsForItem',
          keys: Object.keys(first),
          sample: {
            Id: first.Id, ID: first.ID, ArInvtId: first.ArInvtId,
            ItemNumber: first.ItemNumber, ItemNo: first.ItemNo, Itemno: first.Itemno,
            Description: first.Description, Descrip: first.Descrip,
            Rev: first.Rev,
            InventoryClass: first.InventoryClass, Class: first.Class, ItemClass: first.ItemClass,
            Qty: first.Qty, QtyRequired: first.QtyRequired,
            Unit: first.Unit, Uom: first.Uom,
          },
        }, 'DW response sample (MaterialsForItem)');
      }
      return rows
        .map(r => {
          // DW MaterialsForItem response uses Id (not ArInvtId), InventoryClass (not ItemClass),
          // Qty (not QtyRequired), Unit (not Uom), ItemNumber (not ItemNo).
          const id = Number(r.Id ?? r.ArInvtId ?? r.ID);
          const cls = (r.InventoryClass ?? r.Class ?? r.ItemClass) as string | undefined;
          return {
            arInvtId: id,
            itemNumber: String(r.ItemNumber ?? r.ItemNo ?? r.Itemno ?? ''),
            description: String(r.Description ?? r.Descrip ?? ''),
            rev: String(r.Rev ?? ''),
            itemClass: String(cls ?? ''),
            isPurchased: detectPurchased(cls),
            qtyRequired: Number(r.Qty ?? r.QtyRequired ?? 0),
            ptsPer: Number(r.PtsPer ?? 0),
            uom: String(r.Unit ?? r.Uom ?? (r as Record<string, unknown>).UOM ?? ''),
          };
        })
        // Defensive: skip rows where the ID didn't parse (prevents NaN cascade in recursion)
        .filter(c => Number.isFinite(c.arInvtId));
    },
  };
}
