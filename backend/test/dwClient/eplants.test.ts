import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { createDwClient } from '../../src/dwClient/index.js';

const BASE = 'http://dw.test:8080/WebAPI';

describe('dwClient.eplants', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('list returns active eplants mapped to canonical shape', async () => {
    nock(BASE)
      .get('/AssemblyData/FinalAssembly/GetEplants/0')
      .reply(200, [
        { ID: 13, PlantName: 'Fabrika Beograd', CompanyName: 'IQORA d.o.o.', Inactive: false },
        { ID: 14, PlantName: 'Fabrika Novi Sad', CompanyName: 'IQORA d.o.o.', Inactive: false },
        { ID: 15, PlantName: 'Zatvorena', CompanyName: 'IQORA d.o.o.', Inactive: true },
      ]);
    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('tok');
    const plants = await client.eplants.list();
    expect(plants).toHaveLength(2);
    expect(plants[0]).toMatchObject({ id: 13, plantName: 'Fabrika Beograd', companyName: 'IQORA d.o.o.', inactive: false });
    expect(plants[1]).toMatchObject({ id: 14, plantName: 'Fabrika Novi Sad' });
    // inactive plant must be filtered out
    expect(plants.find(p => p.id === 15)).toBeUndefined();
  });

  it('list handles alternative Id casing', async () => {
    nock(BASE)
      .get('/AssemblyData/FinalAssembly/GetEplants/0')
      .reply(200, [
        { Id: 7, PlantName: 'Plant Seven', CompanyName: 'Acme', Inactive: false },
      ]);
    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('tok');
    const plants = await client.eplants.list();
    expect(plants).toHaveLength(1);
    expect(plants[0].id).toBe(7);
  });

  it('list returns empty array when response is empty', async () => {
    nock(BASE)
      .get('/AssemblyData/FinalAssembly/GetEplants/0')
      .reply(200, []);
    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('tok');
    const plants = await client.eplants.list();
    expect(plants).toEqual([]);
  });
});
