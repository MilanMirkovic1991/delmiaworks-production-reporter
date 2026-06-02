import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createDwClient } from '../../src/dwClient/index.js';

const BASE = 'http://dw.test:8080/WebAPI';

describe('inventory.getById meta (recipe / serialized)', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('maps hasRecipe=true and isSerialized=true when the fields are present/truthy', async () => {
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/100')
      .reply(200, { data: { Id: 100, ItemNumber: 'P', RecipeExists: true, Serialized: 'Y' } });
    const dw = createDwClient({ baseUrl: BASE }); dw.setAuthToken('t');
    const it = await dw.inventory.getById(100);
    expect(it?.hasRecipe).toBe(true);
    expect(it?.isSerialized).toBe(true);
  });

  it('maps hasRecipe=false when the recipe field is present but falsy', async () => {
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/101')
      .reply(200, { data: { Id: 101, ItemNumber: 'Q', RecipeExists: false, Serialized: 'N' } });
    const dw = createDwClient({ baseUrl: BASE }); dw.setAuthToken('t');
    const it = await dw.inventory.getById(101);
    expect(it?.hasRecipe).toBe(false);
    expect(it?.isSerialized).toBe(false);
  });

  it('leaves hasRecipe undefined when NO recipe field exists (unreliable signal)', async () => {
    nock(BASE).get('/Manufacturing/Inventory/InventoryItem/102')
      .reply(200, { data: { Id: 102, ItemNumber: 'R' } });
    const dw = createDwClient({ baseUrl: BASE }); dw.setAuthToken('t');
    const it = await dw.inventory.getById(102);
    expect(it?.hasRecipe).toBeUndefined();
  });
});
