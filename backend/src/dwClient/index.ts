import { createHttp } from './http.js';
import { makeAuthApi } from './auth.js';
import { DwClientConfig } from './types.js';

export function createDwClient(cfg: DwClientConfig) {
  const http = createHttp(cfg.baseUrl);
  const authToken: { value: string | null } = { value: null };
  http.interceptors.request.use(req => {
    if (authToken.value) req.headers.set('Authorization', `Bearer ${authToken.value}`);
    return req;
  });
  return {
    setAuthToken(token: string) { authToken.value = token; },
    auth: makeAuthApi(http),
  };
}

export type DwClient = ReturnType<typeof createDwClient>;
