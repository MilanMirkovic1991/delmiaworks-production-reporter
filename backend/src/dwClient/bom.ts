import { AxiosInstance } from 'axios';
import { BomMaterial, makeInventoryApi } from './inventory.js';

export type BomComponent = BomMaterial;

export function makeBomApi(http: AxiosInstance) {
  const inv = makeInventoryApi(http);
  return {
    async getComponentsForQty(input: { arInvtId: number; qty: number }): Promise<BomComponent[]> {
      return inv.getMaterialsForItem(input);
    },
  };
}
