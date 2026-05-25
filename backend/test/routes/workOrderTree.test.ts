import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import nock from 'nock';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../../src/server.js';

const BASE = 'http://dw.test:8080/WebAPI';
const fxRoot = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/bom_two_level_root.json'), 'utf8'));
const fxSub = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/bom_two_level_sub.json'), 'utf8'));
const listFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/inventoryList.json'), 'utf8'));
const woFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/workOrdersForPart.json'), 'utf8'));

// Sub-assembly WO fixture (inline — 1 WO for arInvtId=200, eplantId=1)
const woSubFx = {
  data: [
    { Id: 601, MfgNumber: 'WO-601', MfgDescrip: 'Sub run', StandardID: 200, EplantID: 1, PriorityLevel: 1, StartDate: '2024-04-01', Status: 'Open' },
  ],
};

async function login(app: ReturnType<typeof createApp>) {
  nock(BASE).post('/User/Login').reply(200, { AuthToken: 'tok', UserName: 'u' });
  const res = await request(app).post('/api/auth/login').send({
    baseUrl: BASE, username: 'u', password: 'p', database: 'db', eplantId: 1,
  });
  return res.headers['set-cookie'];
}

describe('GET /api/work-order-tree', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('requires authentication (401 without cookie)', async () => {
    const app = createApp();
    const res = await request(app).get('/api/work-order-tree?arInvtId=100&qty=10');
    expect(res.status).toBe(401);
  });

  it('builds 2-level WO tree end-to-end', async () => {
    const app = createApp();
    const cookies = await login(app);

    // Root item lookup
    nock(BASE).get('/Manufacturing/Inventory/InventoryList/0').query(true).reply(200, listFx);

    // BOM: root (arInvtId=100) has SUB(200, MFG) + NUT(201, BUY)
    nock(BASE).get('/Manufacturing/Inventory/MaterialsForItem/0')
      .query(q => q.arinvtId === '100' && q.qty === '10').reply(200, fxRoot);
    // BOM: sub-assembly (arInvtId=200) has STEEL(300, BUY)
    nock(BASE).get('/Manufacturing/Inventory/MaterialsForItem/0')
      .query(q => q.arinvtId === '200' && q.qty === '20').reply(200, fxSub);

    // Work orders for root (arInvtId=100) — fixture has 2 rows, EplantID=1 kept, EplantID=99 filtered
    nock(BASE).get('/Manufacturing/WorkOrders/WorkOrdersForPart/0')
      .query(q => q.arInvtId === '100').reply(200, woFx);
    // Work orders for sub-assembly (arInvtId=200)
    nock(BASE).get('/Manufacturing/WorkOrders/WorkOrdersForPart/0')
      .query(q => q.arInvtId === '200').reply(200, woSubFx);

    const res = await request(app).get('/api/work-order-tree?arInvtId=100&qty=10').set('Cookie', cookies!);
    expect(res.status).toBe(200);

    const { tree, stats } = res.body;
    expect(tree).not.toBeNull();
    expect(tree.itemNumber).toBe('PART-A');

    // Root should have 1 WO (EplantID=99 filtered out)
    expect(tree.workOrders).toHaveLength(1);
    expect(tree.workOrders[0].mfgNumber).toBe('WO-501');

    // 2 children: SUB (manufactured) + NUT (purchased)
    expect(tree.children).toHaveLength(2);
    const sub = tree.children.find((c: { itemNumber: string }) => c.itemNumber === 'SUB');
    expect(sub).toBeDefined();
    expect(sub.workOrders).toHaveLength(1);
    expect(sub.workOrders[0].mfgNumber).toBe('WO-601');

    const nut = tree.children.find((c: { itemNumber: string }) => c.itemNumber === 'NUT');
    expect(nut).toBeDefined();
    expect(nut.workOrders).toEqual([]);

    // stats: root + SUB + NUT + STEEL = 4 nodes
    expect(stats.nodeCount).toBe(4);
    expect(stats.totalWorkOrders).toBe(2); // 1 for root + 1 for sub
    expect(stats.itemsWithoutWO).toBe(0);  // both manufactured nodes have WOs
  });
});
