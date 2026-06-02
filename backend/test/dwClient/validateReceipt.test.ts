import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createDwClient } from '../../src/dwClient/index.js';

const BASE = 'http://dw.test:8080/WebAPI';

function itemRow(id: number, extra: Record<string, unknown>) {
  return { data: { Id: id, ItemNumber: `P-${id}`, ...extra } };
}

describe('po.validateReceipt', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('group A: warns for an item with hasRecipe=false', async () => {
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/100').reply(200, itemRow(100, { RecipeExists: false }));
    nock(BASE).get('/Labels/PrintLabel/MasterLabels/0').reply(200, { data: [] });
    const dw = createDwClient({ baseUrl: BASE }); dw.setAuthToken('t');
    const out = await dw.po.validateReceipt({ items: [{ arInvtId: 100, itemNumber: 'P-100', quantity: 5 }] });
    const a = out.warnings.find(w => w.kind === 'NO_RECIPE');
    expect(a?.items.map(i => i.arInvtId)).toEqual([100]);
  });

  it('group A: marks RECIPE_UNRELIABLE when no recipe field exists', async () => {
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/110').reply(200, itemRow(110, { Serialized: 'N' }));
    nock(BASE).get('/Labels/PrintLabel/MasterLabels/0').reply(200, { data: [] });
    const dw = createDwClient({ baseUrl: BASE }); dw.setAuthToken('t');
    const out = await dw.po.validateReceipt({ items: [{ arInvtId: 110, itemNumber: 'P-110', quantity: 1 }] });
    expect(out.warnings.find(w => w.kind === 'RECIPE_UNRELIABLE')?.items.map(i => i.arInvtId)).toEqual([110]);
    expect(out.warnings.find(w => w.kind === 'NO_RECIPE')).toBeUndefined();
  });

  it('group C: warns for serialized item with fractional qty, NOT for whole qty', async () => {
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/200').reply(200, itemRow(200, { Serialized: 'Y', RecipeExists: true }));
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/201').reply(200, itemRow(201, { Serialized: 'Y', RecipeExists: true }));
    nock(BASE).get('/Labels/PrintLabel/MasterLabels/0').reply(200, { data: [] });
    const dw = createDwClient({ baseUrl: BASE }); dw.setAuthToken('t');
    const out = await dw.po.validateReceipt({ items: [
      { arInvtId: 200, itemNumber: 'P-200', quantity: 2.1472 },
      { arInvtId: 201, itemNumber: 'P-201', quantity: 3 },
    ]});
    const c = out.warnings.find(w => w.kind === 'SERIAL_FRACTIONAL');
    expect(c?.items.map(i => i.arInvtId)).toEqual([200]);
  });

  it('dedups reads per arInvtId (same item on two lines = one DW read)', async () => {
    // Only ONE InventoryItem nock; a second read would throw on disableNetConnect.
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/300').reply(200, itemRow(300, { RecipeExists: true, Serialized: 'N' }));
    nock(BASE).get('/Labels/PrintLabel/MasterLabels/0').reply(200, { data: [] });
    const dw = createDwClient({ baseUrl: BASE }); dw.setAuthToken('t');
    const out = await dw.po.validateReceipt({ items: [
      { arInvtId: 300, itemNumber: 'P-300', quantity: 1 },
      { arInvtId: 300, itemNumber: 'P-300', quantity: 1 },
    ]});
    expect(out.warnings.filter(w => w.items.length).length).toBe(0);
  });

  it('never throws when one item read fails — that item is skipped, others still checked', async () => {
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/400').reply(500, 'boom');
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/401').reply(200, itemRow(401, { RecipeExists: false }));
    nock(BASE).get('/Labels/PrintLabel/MasterLabels/0').reply(200, { data: [] });
    const dw = createDwClient({ baseUrl: BASE }); dw.setAuthToken('t');
    const out = await dw.po.validateReceipt({ items: [
      { arInvtId: 400, itemNumber: 'P-400', quantity: 1 },
      { arInvtId: 401, itemNumber: 'P-401', quantity: 1 },
    ]});
    expect(out.warnings.find(w => w.kind === 'NO_RECIPE')?.items.map(i => i.arInvtId)).toEqual([401]);
  });
});
