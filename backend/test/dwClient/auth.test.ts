import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDwClient } from '../../src/dwClient/index.js';

const BASE = 'http://dw.test:8080/WebAPI';
const loginOk = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/login_success.json'), 'utf8'));

describe('dwClient.auth', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('login posts credentials and returns AuthToken', async () => {
    nock(BASE)
      .post('/User/Login', body => body.UserName === 'u' && body.Password === 'p' && body.Database === 'db')
      .reply(200, loginOk);

    const client = createDwClient({ baseUrl: BASE });
    const result = await client.auth.login({ username: 'u', password: 'p', database: 'db' });
    expect(result.authToken).toBe('abc-token-123');
  });

  it('login throws AUTH_FAILED on 500', async () => {
    nock(BASE).post('/User/Login').reply(500, 'bad credentials');
    const client = createDwClient({ baseUrl: BASE });
    await expect(client.auth.login({ username: 'u', password: 'p', database: 'db' }))
      .rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });
});
