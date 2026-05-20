import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import nock from 'nock';
import { createApp } from '../../src/server.js';

const BASE = 'http://dw.test:8080/WebAPI';

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('logs in successfully, returns user info and sets sessionId cookie', async () => {
    nock(BASE).post('/User/Login').reply(200, { AuthToken: 'tok-1', UserName: 'milan' });
    const app = createApp();
    const res = await request(app).post('/api/auth/login').send({
      baseUrl: BASE, username: 'milan', password: 'pw', database: 'IQORA', eplantId: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: 'milan', eplantId: 1 });
    expect(res.headers['set-cookie']?.[0]).toMatch(/sessionId=/);
  });

  it('returns 401 on bad credentials', async () => {
    nock(BASE).post('/User/Login').reply(500, 'bad');
    const app = createApp();
    const res = await request(app).post('/api/auth/login').send({
      baseUrl: BASE, username: 'x', password: 'x', database: 'IQORA', eplantId: 1,
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTH_FAILED');
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without cookie', async () => {
    const app = createApp();
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
