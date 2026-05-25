import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDwClient } from '../../src/dwClient/index.js';

const BASE = 'http://dw.test:8080/WebAPI';
const woFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/workOrdersForPart.json'), 'utf8'));

describe('dwClient.workOrders', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('findForPart returns mapped rows and filters out wrong EplantID', async () => {
    nock(BASE)
      .get('/Manufacturing/WorkOrders/WorkOrdersForPart/0')
      .query(q => q.arInvtId === '100')
      .reply(200, woFx);
    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const wos = await client.workOrders.findForPart({ arInvtId: 100, eplantId: 1 });
    // fixture has 2 rows: EplantID=1 (keep) and EplantID=99 (filter out)
    expect(wos).toHaveLength(1);
    expect(wos[0]).toMatchObject({
      workOrderId: 501,
      mfgNumber: 'WO-501',
      mfgDescrip: 'Assembly run alpha',
      arInvtId: 100,
      eplantId: 1,
      priorityLevel: 2,
      startDate: '2024-03-01',
      status: 'Released',
    });
  });
});
