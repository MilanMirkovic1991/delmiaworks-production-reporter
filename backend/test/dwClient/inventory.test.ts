import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDwClient } from '../../src/dwClient/index.js';

const BASE = 'http://dw.test:8080/WebAPI';
const listFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/inventoryList.json'), 'utf8'));
const matFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/materialsForItem.json'), 'utf8'));

describe('dwClient.inventory', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('searchItems queries InventoryList with searchtext', async () => {
    nock(BASE)
      .get('/Manufacturing/Inventory/InventoryList/0')
      .query(q => q.searchtext === 'PART' && q.filterby === 'ItemNo')
      .reply(200, listFx);
    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const items = await client.inventory.searchItems({ query: 'PART' });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ arInvtId: 100, itemNumber: 'PART-A', isPurchased: false });
    expect(items[1]).toMatchObject({ arInvtId: 101, itemNumber: 'PART-B', isPurchased: true });
  });

  it('getMaterialsForItem returns calculated quantities', async () => {
    nock(BASE)
      .get('/Manufacturing/Inventory/MaterialsForItem/0')
      .query(q => q.arinvtId === '100' && q.qty === '500')
      .reply(200, matFx);
    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const mats = await client.inventory.getMaterialsForItem({ arInvtId: 100, qty: 500 });
    expect(mats).toHaveLength(2);
    expect(mats[0]).toMatchObject({ arInvtId: 200, qtyRequired: 50, isPurchased: true });
    expect(mats[1]).toMatchObject({ arInvtId: 201, qtyRequired: 10, isPurchased: false });
  });
});
