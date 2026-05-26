import { createHttp } from './http.js';
import { makeAuthApi } from './auth.js';
import { makeInventoryApi } from './inventory.js';
import { makeSalesOrdersApi } from './salesOrders.js';
import { makeBomApi } from './bom.js';
import { makeWorkOrdersApi } from './workOrders.js';
import { makeEPlantsApi } from './eplants.js';
import { makePOApi } from './po.js';
import { DwClientConfig } from './types.js';

export function createDwClient(cfg: DwClientConfig) {
  const http = createHttp(cfg.baseUrl);
  const authToken: { value: string | null } = { value: null };
  http.interceptors.request.use(req => {
    if (authToken.value) req.headers.set('AuthToken', authToken.value);
    return req;
  });
  return {
    setAuthToken(token: string) { authToken.value = token; },
    auth: makeAuthApi(http),
    inventory: makeInventoryApi(http),
    salesOrders: makeSalesOrdersApi(http),
    bom: makeBomApi(http),
    workOrders: makeWorkOrdersApi(http),
    eplants: makeEPlantsApi(http),
    po: makePOApi(http),
  };
}

export type DwClient = ReturnType<typeof createDwClient>;
