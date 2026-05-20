import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDwClient } from '../../src/dwClient/index.js';

const BASE = 'http://dw.test:8080/WebAPI';
const matFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/materialsForItem.json'), 'utf8'));

describe('dwClient.bom', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('getComponentsForQty returns first-level components with calculated qty', async () => {
    nock(BASE)
      .get('/Manufacturing/Inventory/MaterialsForItem/0')
      .query(q => q.arinvtId === '100' && q.qty === '500')
      .reply(200, matFx);

    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const components = await client.bom.getComponentsForQty({ arInvtId: 100, qty: 500 });
    expect(components).toHaveLength(2);
    expect(components.find(c => c.isPurchased)?.qtyRequired).toBe(50);
    expect(components.find(c => !c.isPurchased)?.qtyRequired).toBe(10);
  });
});
