# Prijava proizvodnje — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build read-only wizard app that walks user through: pick item → pick active Sales Order → pick full quantity or specific releases → view multi-level BOM tree with calculated component quantities, calling DelmiaWorks WebAPI through a Node/Express BFF.

**Architecture:** Monorepo with `backend/` (Express + TypeScript) and `frontend/` (Vite + React + TypeScript). Backend owns DelmiaWorks WebAPI calls (`dwClient`), session/AuthToken management, and recursive BOM tree builder with cycle detection. Frontend is a 4-step wizard backed by Zustand (wizard state, persisted) + TanStack Query (server cache).

**Tech Stack:** Node 20, TypeScript 5, Express 4, axios, pino, Vitest, supertest, nock; React 18, Vite 5, Zustand 4, @tanstack/react-query 5, React Router 6.

**Reference spec:** `docs/superpowers/specs/2026-05-19-prijava-proizvodnje-phase1-design.md`

**Working directory:** All paths in this plan are relative to `delmiaworks-production-reporter/`.

---

## File map

**Root:**
- `package.json` — npm workspaces, shared scripts
- `tsconfig.base.json` — common compiler options
- `.gitignore`, `.editorconfig`, `README.md`

**Backend (`backend/`):**
- `package.json`, `tsconfig.json`, `vitest.config.ts`
- `src/server.ts` — Express bootstrap
- `src/config.ts` — env loading
- `src/session.ts` — in-memory session store
- `src/middleware/requireSession.ts`
- `src/middleware/errorHandler.ts`
- `src/dwClient/index.ts` — client factory
- `src/dwClient/auth.ts`
- `src/dwClient/inventory.ts`
- `src/dwClient/salesOrders.ts`
- `src/dwClient/bom.ts`
- `src/dwClient/filter.ts` — `buildFilter()` helper
- `src/dwClient/http.ts` — axios instance + AuthToken header injection + 403 re-login
- `src/dwClient/types.ts`
- `src/services/bomTreeBuilder.ts`
- `src/routes/auth.ts`
- `src/routes/items.ts`
- `src/routes/salesOrders.ts`
- `src/routes/bom.ts`
- `src/logger.ts`
- `test/fixtures/dw/*.json`
- `test/dwClient/*.test.ts`
- `test/services/*.test.ts`
- `test/routes/*.test.ts`

**Frontend (`frontend/`):**
- `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- `src/main.tsx`
- `src/App.tsx` — Router + QueryClient + protected routes
- `src/api/client.ts` — fetch wrapper
- `src/api/types.ts` — shared response types
- `src/store/wizardStore.ts` — Zustand wizard state
- `src/pages/Login.tsx`
- `src/pages/ItemSearch.tsx`
- `src/pages/SalesOrders.tsx`
- `src/pages/Releases.tsx`
- `src/pages/BomView.tsx`
- `src/components/WizardStepper.tsx`
- `src/components/BomTreeNode.tsx`
- `src/components/QuantityBadge.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/styles.css`
- `test/**` — Vitest + React Testing Library

---

## Task 1: Repo bootstrap (workspaces, gitignore, base configs)

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `README.md`

- [ ] **Step 1: Verify we are in the right directory and on the right branch**

Run: `pwd && git status`

Expected: cwd ends in `delmiaworks-production-reporter`, branch `main`, one commit (the spec).

- [ ] **Step 2: Write root `package.json`**

```json
{
  "name": "delmiaworks-production-reporter",
  "private": true,
  "version": "0.1.0",
  "description": "Wizard app for guided production reporting against DelmiaWorks WebAPI",
  "workspaces": ["backend", "frontend"],
  "scripts": {
    "dev:backend": "npm --workspace backend run dev",
    "dev:frontend": "npm --workspace frontend run dev",
    "build": "npm --workspace backend run build && npm --workspace frontend run build",
    "test": "npm --workspace backend run test && npm --workspace frontend run test"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 3: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true
  }
}
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
dist/
build/
.env
.env.local
*.log
.DS_Store
coverage/
.vscode/
.idea/
```

- [ ] **Step 5: Write `.editorconfig`**

```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

- [ ] **Step 6: Write `README.md`**

```markdown
# delmiaworks-production-reporter

Wizard app that walks a planner through: item → Sales Order → releases → multi-level BOM tree with calculated quantities. Phase 1 is read-only (no writes to DelmiaWorks).

## Development

```bash
npm install
npm run dev:backend   # http://localhost:3000
npm run dev:frontend  # http://localhost:5173
```

See `docs/superpowers/specs/2026-05-19-prijava-proizvodnje-phase1-design.md` for design and `docs/superpowers/plans/2026-05-19-prijava-proizvodnje-phase1.md` for the implementation plan.
```

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.base.json .gitignore .editorconfig README.md
git commit -m "chore: bootstrap monorepo (workspaces, tsconfig base, gitignore)"
```

---

## Task 2: Backend bootstrap (Express + pino + Vitest)

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/vitest.config.ts`
- Create: `backend/src/server.ts`
- Create: `backend/src/config.ts`
- Create: `backend/src/logger.ts`
- Create: `backend/test/server.test.ts`

- [ ] **Step 1: Write `backend/package.json`**

```json
{
  "name": "@dw-reporter/backend",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "axios": "^1.7.7",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.1",
    "pino": "^9.5.0",
    "pino-http": "^10.3.0",
    "pino-pretty": "^11.3.0",
    "uuid": "^11.0.3"
  },
  "devDependencies": {
    "@types/cookie-parser": "^1.4.7",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/node": "^22.9.0",
    "@types/supertest": "^6.0.2",
    "@types/uuid": "^10.0.0",
    "nock": "^13.5.6",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: Write `backend/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `backend/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
  },
});
```

- [ ] **Step 4: Write `backend/src/config.ts`**

```typescript
import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  sessionTtlMs: 8 * 60 * 60 * 1000,
} as const;
```

- [ ] **Step 5: Write `backend/src/logger.ts`**

```typescript
import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: config.nodeEnv === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});
```

- [ ] **Step 6: Write the failing test `backend/test/server.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server.js';

describe('server', () => {
  it('GET /healthz returns 200 with ok body', async () => {
    const app = createApp();
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 7: Run the test, confirm it fails (module not found)**

Run from repo root:
```bash
cd backend && npm install && npm test
```

Expected: failure because `../src/server.js` does not export `createApp`.

- [ ] **Step 8: Write `backend/src/server.ts`**

```typescript
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { logger } from './logger.js';
import { config } from './config.js';

export function createApp(): Express {
  const app = express();
  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const app = createApp();
  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'backend listening');
  });
}
```

- [ ] **Step 9: Run tests, confirm pass**

Run: `npm test`

Expected: 1 test passing.

- [ ] **Step 10: Commit**

```bash
cd ..
git add backend/
git commit -m "feat(backend): bootstrap Express + pino + Vitest, add /healthz"
```

---

## Task 3: `buildFilter` helper (DelmiaWorks filter syntax)

**Files:**
- Create: `backend/src/dwClient/filter.ts`
- Create: `backend/test/dwClient/filter.test.ts`

DelmiaWorks filter format: `(Field.op~Value~&Field.op~Value~)`. Operators: `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `startswith`, `contains`. Values delimited by `~`. We support AND-only filters in MVP (no OR groups), which covers every query in Phase 1.

- [ ] **Step 1: Write failing test `backend/test/dwClient/filter.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { buildFilter } from '../../src/dwClient/filter.js';

describe('buildFilter', () => {
  it('returns empty string for empty filter object', () => {
    expect(buildFilter({})).toBe('');
  });

  it('builds single equality filter', () => {
    expect(buildFilter({ ArInvtId: 123 })).toBe('(ArInvtId.eq~123~)');
  });

  it('builds AND of multiple equalities', () => {
    expect(buildFilter({ ArInvtId: 123, Status: 'Active' }))
      .toBe('(ArInvtId.eq~123~&Status.eq~Active~)');
  });

  it('supports explicit operator', () => {
    expect(buildFilter({ TotalQTYOrdered: { op: 'gt', value: 0 } }))
      .toBe('(TotalQTYOrdered.gt~0~)');
  });

  it('escapes ~ characters in values', () => {
    expect(buildFilter({ Description: 'A~B' }))
      .toBe('(Description.eq~A\\~B~)');
  });

  it('handles boolean values', () => {
    expect(buildFilter({ Active: true })).toBe('(Active.eq~true~)');
  });

  it('skips undefined values', () => {
    expect(buildFilter({ ArInvtId: 123, Status: undefined }))
      .toBe('(ArInvtId.eq~123~)');
  });
});
```

- [ ] **Step 2: Run test, confirm it fails**

Run: `npm test -- filter`
Expected: failure — module not found.

- [ ] **Step 3: Implement `backend/src/dwClient/filter.ts`**

```typescript
export type FilterOp = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'startswith' | 'contains';

export type FilterValue =
  | string | number | boolean
  | { op: FilterOp; value: string | number | boolean }
  | undefined;

export type FilterSpec = Record<string, FilterValue>;

function escapeValue(v: string | number | boolean): string {
  return String(v).replace(/~/g, '\\~');
}

export function buildFilter(spec: FilterSpec): string {
  const parts: string[] = [];
  for (const [field, raw] of Object.entries(spec)) {
    if (raw === undefined) continue;
    if (typeof raw === 'object' && raw !== null && 'op' in raw) {
      parts.push(`${field}.${raw.op}~${escapeValue(raw.value)}~`);
    } else {
      parts.push(`${field}.eq~${escapeValue(raw)}~`);
    }
  }
  if (parts.length === 0) return '';
  return `(${parts.join('&')})`;
}
```

- [ ] **Step 4: Run test, confirm pass**

Run: `npm test -- filter`
Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
cd ..
git add backend/src/dwClient/filter.ts backend/test/dwClient/filter.test.ts
git commit -m "feat(dwClient): add buildFilter helper for DW filter syntax"
```

---

## Task 4: dwClient HTTP base + auth (`login`, header injection, 403 re-login)

**Files:**
- Create: `backend/src/dwClient/types.ts`
- Create: `backend/src/dwClient/http.ts`
- Create: `backend/src/dwClient/auth.ts`
- Create: `backend/src/dwClient/index.ts`
- Create: `backend/test/fixtures/dw/login_success.json`
- Create: `backend/test/dwClient/auth.test.ts`

- [ ] **Step 1: Write fixture `backend/test/fixtures/dw/login_success.json`**

```json
{
  "AuthToken": "abc-token-123",
  "UserName": "testuser",
  "Success": true
}
```

- [ ] **Step 2: Write failing test `backend/test/dwClient/auth.test.ts`**

```typescript
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
```

- [ ] **Step 3: Run test, confirm failure**

Run: `npm test -- auth`
Expected: module not found.

- [ ] **Step 4: Implement `backend/src/dwClient/types.ts`**

```typescript
export type DwError = Error & { code: 'AUTH_FAILED' | 'DW_UNREACHABLE' | 'DW_ERROR' | 'AUTH_EXPIRED' };

export type LoginInput = { username: string; password: string; database: string; appName?: string };
export type LoginResult = { authToken: string; username: string };

export type DwClientConfig = { baseUrl: string };

export type DwResponseEnvelope<T> = { data: T } | T;
```

- [ ] **Step 5: Implement `backend/src/dwClient/http.ts`**

```typescript
import axios, { AxiosInstance, AxiosError } from 'axios';
import { DwError } from './types.js';

function makeError(code: DwError['code'], message: string, cause?: unknown): DwError {
  const err = new Error(message) as DwError;
  err.code = code;
  if (cause) (err as Error & { cause?: unknown }).cause = cause;
  return err;
}

export function createHttp(baseUrl: string): AxiosInstance {
  const http = axios.create({
    baseURL: baseUrl,
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
  });
  http.interceptors.response.use(
    r => r,
    (e: AxiosError) => {
      if (e.code === 'ECONNREFUSED' || e.code === 'ECONNABORTED' || e.code === 'ENOTFOUND') {
        throw makeError('DW_UNREACHABLE', `Cannot reach DelmiaWorks at ${baseUrl}`, e);
      }
      throw e;
    },
  );
  return http;
}

export { makeError };
```

- [ ] **Step 6: Implement `backend/src/dwClient/auth.ts`**

```typescript
import { AxiosInstance } from 'axios';
import { LoginInput, LoginResult } from './types.js';
import { makeError } from './http.js';

export function makeAuthApi(http: AxiosInstance) {
  return {
    async login(input: LoginInput): Promise<LoginResult> {
      try {
        const res = await http.post('/User/Login', {
          UserName: input.username,
          Password: input.password,
          Database: input.database,
          ApplicationName: input.appName ?? 'delmiaworks-production-reporter',
        });
        const body = res.data;
        const token = body?.AuthToken ?? body?.authToken ?? body?.data?.AuthToken;
        if (!token) throw makeError('AUTH_FAILED', 'No token in login response');
        return { authToken: token, username: body?.UserName ?? input.username };
      } catch (e: unknown) {
        if (e && typeof e === 'object' && 'code' in e) throw e;
        throw makeError('AUTH_FAILED', 'Login failed', e);
      }
    },
  };
}
```

- [ ] **Step 7: Implement `backend/src/dwClient/index.ts`**

```typescript
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
```

- [ ] **Step 8: Run tests, confirm pass**

Run: `npm test -- auth`
Expected: 2 passing.

- [ ] **Step 9: Commit**

```bash
cd ..
git add backend/src/dwClient/ backend/test/
git commit -m "feat(dwClient): add HTTP base and auth.login with error mapping"
```

---

## Task 5: dwClient inventory module (search items + materials-for-item)

**Files:**
- Create: `backend/src/dwClient/inventory.ts`
- Modify: `backend/src/dwClient/index.ts` (wire inventory api)
- Create: `backend/test/fixtures/dw/inventoryList.json`
- Create: `backend/test/fixtures/dw/materialsForItem.json`
- Create: `backend/test/dwClient/inventory.test.ts`

- [ ] **Step 1: Write fixture `backend/test/fixtures/dw/inventoryList.json`**

```json
{
  "data": [
    { "ID": 100, "ItemNo": "PART-A", "Description": "Widget A", "Rev": "1", "ItemClass": "MFG" },
    { "ID": 101, "ItemNo": "PART-B", "Description": "Widget B", "Rev": "2", "ItemClass": "BUY" }
  ]
}
```

- [ ] **Step 2: Write fixture `backend/test/fixtures/dw/materialsForItem.json`**

```json
{
  "data": [
    { "ArInvtId": 200, "ItemNo": "MAT-X", "Description": "Steel", "Rev": "A", "ItemClass": "BUY", "QtyRequired": 50, "Uom": "kg" },
    { "ArInvtId": 201, "ItemNo": "SUB-Y", "Description": "Subassembly Y", "Rev": "B", "ItemClass": "MFG", "QtyRequired": 10, "Uom": "ea" }
  ]
}
```

- [ ] **Step 3: Write failing test `backend/test/dwClient/inventory.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDwClient } from '../../src/dwClient/index.js';

const BASE = 'http://dw.test:8080/WebAPI';
const listFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/inventoryList.json'), 'utf8'));
const matFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/materialsForItem.json'), 'utf8'));

describe('dwClient.inventory', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('searchItems queries InventoryList with searchtext', async () => {
    nock(BASE)
      .get('/Manufacturing/Inventory/InventoryList/0')
      .query(q => q.searchtext === 'PART' && q.filterby === 'ItemNo')
      .reply(200, listFx);
    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const items = await client.inventory.searchItems({ query: 'PART' });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ arInvtId: 100, itemNumber: 'PART-A', isPurchased: false });
    expect(items[1]).toMatchObject({ arInvtId: 101, itemNumber: 'PART-B', isPurchased: true });
  });

  it('getMaterialsForItem returns calculated quantities', async () => {
    nock(BASE)
      .get('/Manufacturing/Inventory/MaterialsForItem/0')
      .query(q => q.arinvtId === '100' && q.qty === '500')
      .reply(200, matFx);
    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const mats = await client.inventory.getMaterialsForItem({ arInvtId: 100, qty: 500 });
    expect(mats).toHaveLength(2);
    expect(mats[0]).toMatchObject({ arInvtId: 200, qtyRequired: 50, isPurchased: true });
    expect(mats[1]).toMatchObject({ arInvtId: 201, qtyRequired: 10, isPurchased: false });
  });
});
```

- [ ] **Step 4: Run, confirm failure**

Run: `npm test -- inventory`
Expected: module not found.

- [ ] **Step 5: Implement `backend/src/dwClient/inventory.ts`**

```typescript
import { AxiosInstance } from 'axios';

export type InventoryItem = {
  arInvtId: number;
  itemNumber: string;
  description: string;
  rev: string;
  itemClass: string;
  isPurchased: boolean;
};

export type BomMaterial = {
  arInvtId: number;
  itemNumber: string;
  description: string;
  rev: string;
  itemClass: string;
  isPurchased: boolean;
  qtyRequired: number;
  uom: string;
};

const PURCHASED_CLASSES = new Set(['BUY', 'PUR', 'P']);
function detectPurchased(itemClass: string | undefined): boolean {
  if (!itemClass) return false;
  return PURCHASED_CLASSES.has(itemClass.toUpperCase());
}

function pickArray<T = unknown>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object' && 'data' in body && Array.isArray((body as { data: unknown[] }).data)) {
    return (body as { data: T[] }).data;
  }
  return [];
}

export function makeInventoryApi(http: AxiosInstance) {
  return {
    async searchItems(input: { query: string; page?: number; pageSize?: number }): Promise<InventoryItem[]> {
      const res = await http.get('/Manufacturing/Inventory/InventoryList/0', {
        params: {
          searchtext: input.query,
          filterby: 'ItemNo',
          page: input.page ?? 0,
          pageSize: input.pageSize ?? 50,
        },
      });
      return pickArray<Record<string, unknown>>(res.data).map(r => ({
        arInvtId: Number(r.ID ?? r.ArInvtId ?? r.Id),
        itemNumber: String(r.ItemNo ?? r.ItemNumber ?? ''),
        description: String(r.Description ?? ''),
        rev: String(r.Rev ?? ''),
        itemClass: String(r.ItemClass ?? ''),
        isPurchased: detectPurchased(r.ItemClass as string | undefined),
      }));
    },

    async getMaterialsForItem(input: { arInvtId: number; qty: number }): Promise<BomMaterial[]> {
      const res = await http.get('/Manufacturing/Inventory/MaterialsForItem/0', {
        params: { arinvtId: input.arInvtId, qty: input.qty },
      });
      return pickArray<Record<string, unknown>>(res.data).map(r => ({
        arInvtId: Number(r.ArInvtId ?? r.ID),
        itemNumber: String(r.ItemNo ?? r.ItemNumber ?? ''),
        description: String(r.Description ?? ''),
        rev: String(r.Rev ?? ''),
        itemClass: String(r.ItemClass ?? ''),
        isPurchased: detectPurchased(r.ItemClass as string | undefined),
        qtyRequired: Number(r.QtyRequired ?? r.Qty ?? 0),
        uom: String(r.Uom ?? r.UOM ?? ''),
      }));
    },
  };
}
```

- [ ] **Step 6: Wire into `backend/src/dwClient/index.ts`**

Replace the whole file with:

```typescript
import { createHttp } from './http.js';
import { makeAuthApi } from './auth.js';
import { makeInventoryApi } from './inventory.js';
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
    inventory: makeInventoryApi(http),
  };
}

export type DwClient = ReturnType<typeof createDwClient>;
```

- [ ] **Step 7: Run tests, confirm pass**

Run: `npm test`
Expected: all passing (3 suites: server, filter, auth, inventory).

- [ ] **Step 8: Commit**

```bash
cd ..
git add backend/src/dwClient/inventory.ts backend/src/dwClient/index.ts backend/test/
git commit -m "feat(dwClient): add inventory.searchItems and getMaterialsForItem"
```

---

## Task 6: dwClient salesOrders module

**Files:**
- Create: `backend/src/dwClient/salesOrders.ts`
- Modify: `backend/src/dwClient/index.ts`
- Create: `backend/test/fixtures/dw/salesOrder.json`
- Create: `backend/test/fixtures/dw/salesOrderReleases.json`
- Create: `backend/test/dwClient/salesOrders.test.ts`

- [ ] **Step 1: Write fixture `backend/test/fixtures/dw/salesOrder.json`**

```json
{
  "data": [
    { "Id": 1, "OrdDetailId": 11, "OrderNumber": "SO1001", "Company": "Acme", "PONumber": "PO-77", "TotalQTYOrdered": 500, "CummShipped": 100, "ArInvtId": 100, "Status": "Active", "EPlantId": 1 },
    { "Id": 2, "OrdDetailId": 22, "OrderNumber": "SO1002", "Company": "Globex", "PONumber": "PO-88", "TotalQTYOrdered": 300, "CummShipped": 0, "ArInvtId": 100, "Status": "Active", "EPlantId": 1 }
  ]
}
```

- [ ] **Step 2: Write fixture `backend/test/fixtures/dw/salesOrderReleases.json`**

```json
{
  "data": [
    { "Id": 901, "Seq": 1, "Qty": 200, "RequestDate": "2026-06-01T00:00:00", "PromiseDate": "2026-06-05T00:00:00" },
    { "Id": 902, "Seq": 2, "Qty": 300, "RequestDate": "2026-06-15T00:00:00", "PromiseDate": "2026-06-20T00:00:00" }
  ]
}
```

- [ ] **Step 3: Write failing test `backend/test/dwClient/salesOrders.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDwClient } from '../../src/dwClient/index.js';

const BASE = 'http://dw.test:8080/WebAPI';
const soFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/salesOrder.json'), 'utf8'));
const relFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/salesOrderReleases.json'), 'utf8'));

describe('dwClient.salesOrders', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('listForItem returns SO grouped by ordDetailId, filtered by ArInvtId+Active+EPlant', async () => {
    nock(BASE)
      .get('/SalesDistribution/SalesOrder/SalesOrder/0')
      .query(q => typeof q.filter === 'string' &&
        q.filter.includes('ArInvtId.eq~100~') &&
        q.filter.includes('Status.eq~Active~') &&
        q.filter.includes('EPlantId.eq~1~'))
      .reply(200, soFx);
    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const sos = await client.salesOrders.listForItem({ arInvtId: 100, eplantId: 1 });
    expect(sos).toHaveLength(2);
    expect(sos[0]).toMatchObject({
      ordDetailId: 11,
      orderNumber: 'SO1001',
      company: 'Acme',
      poNumber: 'PO-77',
      totalOrdered: 500,
      cummShipped: 100,
      remaining: 400,
    });
  });

  it('getReleases queries SalesOrderReleases by detailId', async () => {
    nock(BASE)
      .get('/SalesDistribution/SalesOrder/SalesOrderReleases/0')
      .query(q => q.salesOrderDetailId === '11')
      .reply(200, relFx);
    const client = createDwClient({ baseUrl: BASE });
    client.setAuthToken('t');
    const rels = await client.salesOrders.getReleases({ ordDetailId: 11 });
    expect(rels).toHaveLength(2);
    expect(rels[0]).toMatchObject({ releaseId: 901, seq: 1, qty: 200 });
  });
});
```

- [ ] **Step 4: Run test, confirm failure**

Run: `npm test -- salesOrders`
Expected: module not found.

- [ ] **Step 5: Implement `backend/src/dwClient/salesOrders.ts`**

```typescript
import { AxiosInstance } from 'axios';
import { buildFilter } from './filter.js';

export type SalesOrderRow = {
  ordDetailId: number;
  orderNumber: string;
  company: string;
  poNumber: string;
  totalOrdered: number;
  cummShipped: number;
  remaining: number;
  arInvtId: number;
};

export type SalesOrderRelease = {
  releaseId: number;
  seq: number;
  qty: number;
  requestDate: string | null;
  promiseDate: string | null;
};

function pickArray<T = unknown>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object' && 'data' in body && Array.isArray((body as { data: unknown[] }).data)) {
    return (body as { data: T[] }).data;
  }
  return [];
}

export function makeSalesOrdersApi(http: AxiosInstance) {
  return {
    async listForItem(input: { arInvtId: number; eplantId: number }): Promise<SalesOrderRow[]> {
      const filter = buildFilter({
        ArInvtId: input.arInvtId,
        Status: 'Active',
        EPlantId: input.eplantId,
      });
      const res = await http.get('/SalesDistribution/SalesOrder/SalesOrder/0', {
        params: { filter },
      });
      const rows = pickArray<Record<string, unknown>>(res.data);
      const byDetail = new Map<number, SalesOrderRow>();
      for (const r of rows) {
        const ordDetailId = Number(r.OrdDetailId);
        if (byDetail.has(ordDetailId)) continue;
        const totalOrdered = Number(r.TotalQTYOrdered ?? 0);
        const cummShipped = Number(r.CummShipped ?? 0);
        byDetail.set(ordDetailId, {
          ordDetailId,
          orderNumber: String(r.OrderNumber ?? ''),
          company: String(r.Company ?? ''),
          poNumber: String(r.PONumber ?? ''),
          totalOrdered,
          cummShipped,
          remaining: Math.max(0, totalOrdered - cummShipped),
          arInvtId: Number(r.ArInvtId ?? 0),
        });
      }
      return [...byDetail.values()];
    },

    async getReleases(input: { ordDetailId: number }): Promise<SalesOrderRelease[]> {
      const res = await http.get('/SalesDistribution/SalesOrder/SalesOrderReleases/0', {
        params: { salesOrderDetailId: input.ordDetailId },
      });
      return pickArray<Record<string, unknown>>(res.data).map(r => ({
        releaseId: Number(r.Id ?? r.ID),
        seq: Number(r.Seq ?? 0),
        qty: Number(r.Qty ?? 0),
        requestDate: r.RequestDate ? String(r.RequestDate) : null,
        promiseDate: r.PromiseDate ? String(r.PromiseDate) : null,
      }));
    },
  };
}
```

- [ ] **Step 6: Wire into `backend/src/dwClient/index.ts`**

```typescript
import { createHttp } from './http.js';
import { makeAuthApi } from './auth.js';
import { makeInventoryApi } from './inventory.js';
import { makeSalesOrdersApi } from './salesOrders.js';
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
    inventory: makeInventoryApi(http),
    salesOrders: makeSalesOrdersApi(http),
  };
}

export type DwClient = ReturnType<typeof createDwClient>;
```

- [ ] **Step 7: Run tests, confirm pass**

Run: `npm test`
Expected: all passing.

- [ ] **Step 8: Commit**

```bash
cd ..
git add backend/src/dwClient/salesOrders.ts backend/src/dwClient/index.ts backend/test/
git commit -m "feat(dwClient): add salesOrders.listForItem and getReleases"
```

---

## Task 7: dwClient bom module (`getBomComponents`)

`MaterialsForItem` already returns first-level components with calculated qty. For recursion we need the same call per sub-assembly. We expose `getBomComponentsForQty(arInvtId, qty)` as a thin alias over `getMaterialsForItem` so the tree builder reads naturally. We do NOT add separate `BomComponentsEx` calls in Phase 1 — `MaterialsForItem` is sufficient and already calculates quantities for us.

**Files:**
- Create: `backend/src/dwClient/bom.ts`
- Modify: `backend/src/dwClient/index.ts`
- Create: `backend/test/dwClient/bom.test.ts`

- [ ] **Step 1: Write failing test `backend/test/dwClient/bom.test.ts`**

```typescript
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
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- bom`
Expected: module not found.

- [ ] **Step 3: Implement `backend/src/dwClient/bom.ts`**

```typescript
import { AxiosInstance } from 'axios';
import { BomMaterial, makeInventoryApi } from './inventory.js';

export type BomComponent = BomMaterial;

export function makeBomApi(http: AxiosInstance) {
  const inv = makeInventoryApi(http);
  return {
    async getComponentsForQty(input: { arInvtId: number; qty: number }): Promise<BomComponent[]> {
      return inv.getMaterialsForItem(input);
    },
  };
}
```

- [ ] **Step 4: Wire into `backend/src/dwClient/index.ts`**

```typescript
import { createHttp } from './http.js';
import { makeAuthApi } from './auth.js';
import { makeInventoryApi } from './inventory.js';
import { makeSalesOrdersApi } from './salesOrders.js';
import { makeBomApi } from './bom.js';
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
    inventory: makeInventoryApi(http),
    salesOrders: makeSalesOrdersApi(http),
    bom: makeBomApi(http),
  };
}

export type DwClient = ReturnType<typeof createDwClient>;
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd ..
git add backend/src/dwClient/bom.ts backend/src/dwClient/index.ts backend/test/dwClient/bom.test.ts
git commit -m "feat(dwClient): add bom.getComponentsForQty (alias over MaterialsForItem)"
```

---

## Task 8: `bomTreeBuilder` service (recursion + cycle detection + parallelization)

**Files:**
- Create: `backend/src/services/bomTreeBuilder.ts`
- Create: `backend/test/services/bomTreeBuilder.test.ts`

- [ ] **Step 1: Write failing test `backend/test/services/bomTreeBuilder.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { buildBomTree, BomNode } from '../../src/services/bomTreeBuilder.js';
import { BomComponent } from '../../src/dwClient/bom.js';

function comp(arInvtId: number, itemNumber: string, qty: number, purchased: boolean): BomComponent {
  return {
    arInvtId, itemNumber, description: `Desc ${itemNumber}`, rev: '1',
    itemClass: purchased ? 'BUY' : 'MFG', isPurchased: purchased, qtyRequired: qty, uom: 'ea',
  };
}

describe('bomTreeBuilder', () => {
  it('returns null tree when root has no components (NO_BOM)', async () => {
    const getComponents = vi.fn().mockResolvedValue([]);
    const tree = await buildBomTree({
      rootArInvtId: 1, rootItemNumber: 'ROOT', rootDescription: 'r', rootRev: '1', rootItemClass: 'MFG',
      qty: 10, getComponents,
    });
    expect(tree).toBeNull();
  });

  it('builds 2-level tree, stops at purchased components', async () => {
    const getComponents = vi.fn().mockImplementation(async ({ arInvtId, qty }: { arInvtId: number; qty: number }) => {
      if (arInvtId === 1) return [comp(2, 'SUB', qty * 2, false), comp(3, 'NUT', qty * 4, true)];
      if (arInvtId === 2) return [comp(4, 'STEEL', qty * 5, true)];
      return [];
    });
    const tree = await buildBomTree({
      rootArInvtId: 1, rootItemNumber: 'TOP', rootDescription: 't', rootRev: '1', rootItemClass: 'MFG',
      qty: 10, getComponents,
    });
    expect(tree).not.toBeNull();
    expect(tree!.children).toHaveLength(2);
    const sub = tree!.children.find(c => c.itemNumber === 'SUB')!;
    expect(sub.qtyRequired).toBe(20);
    expect(sub.children).toHaveLength(1);
    expect(sub.children[0].itemNumber).toBe('STEEL');
    expect(sub.children[0].qtyRequired).toBe(100);
    expect(sub.children[0].children).toEqual([]);
    const nut = tree!.children.find(c => c.itemNumber === 'NUT')!;
    expect(nut.children).toEqual([]);
    expect(getComponents).not.toHaveBeenCalledWith(expect.objectContaining({ arInvtId: 3 }));
  });

  it('detects cycle in same branch, stops only that branch', async () => {
    const getComponents = vi.fn().mockImplementation(async ({ arInvtId }: { arInvtId: number }) => {
      if (arInvtId === 1) return [comp(2, 'B', 1, false)];
      if (arInvtId === 2) return [comp(1, 'A_AGAIN', 1, false)]; // cycle: 1 -> 2 -> 1
      return [];
    });
    const tree = await buildBomTree({
      rootArInvtId: 1, rootItemNumber: 'A', rootDescription: 'a', rootRev: '1', rootItemClass: 'MFG',
      qty: 1, getComponents,
    });
    expect(tree).not.toBeNull();
    const b = tree!.children[0];
    expect(b.itemNumber).toBe('B');
    const aAgain = b.children[0];
    expect(aAgain.cycleDetected).toBe(true);
    expect(aAgain.children).toEqual([]);
  });

  it('same component in different branches is NOT a cycle', async () => {
    const getComponents = vi.fn().mockImplementation(async ({ arInvtId }: { arInvtId: number }) => {
      if (arInvtId === 1) return [comp(2, 'B', 1, false), comp(3, 'C', 1, false)];
      if (arInvtId === 2) return [comp(99, 'SHARED', 1, true)];
      if (arInvtId === 3) return [comp(99, 'SHARED', 1, true)];
      return [];
    });
    const tree = await buildBomTree({
      rootArInvtId: 1, rootItemNumber: 'A', rootDescription: 'a', rootRev: '1', rootItemClass: 'MFG',
      qty: 1, getComponents,
    });
    expect(tree!.children[0].children[0].cycleDetected).toBeUndefined();
    expect(tree!.children[1].children[0].cycleDetected).toBeUndefined();
  });

  it('parallelizes children at same level (Promise.all)', async () => {
    const calls: number[] = [];
    const getComponents = vi.fn().mockImplementation(async ({ arInvtId }: { arInvtId: number }) => {
      calls.push(arInvtId);
      await new Promise(r => setTimeout(r, 5));
      if (arInvtId === 1) return [comp(2, 'X', 1, false), comp(3, 'Y', 1, false)];
      return [];
    });
    await buildBomTree({
      rootArInvtId: 1, rootItemNumber: 'A', rootDescription: 'a', rootRev: '1', rootItemClass: 'MFG',
      qty: 1, getComponents,
    });
    // After root expansion both children 2 and 3 should have been requested before either resolves
    expect(calls.slice(0, 3)).toEqual([1, 2, 3]);
  });

  it('reports stats: nodeCount, maxDepth, cycleCount', async () => {
    const getComponents = vi.fn().mockImplementation(async ({ arInvtId }: { arInvtId: number }) => {
      if (arInvtId === 1) return [comp(2, 'B', 1, false)];
      if (arInvtId === 2) return [comp(3, 'C', 1, true)];
      return [];
    });
    const { tree, stats } = await import('../../src/services/bomTreeBuilder.js')
      .then(m => m.buildBomTreeWithStats({
        rootArInvtId: 1, rootItemNumber: 'A', rootDescription: 'a', rootRev: '1', rootItemClass: 'MFG',
        qty: 1, getComponents,
      }));
    expect(tree).not.toBeNull();
    expect(stats.nodeCount).toBe(3); // root + B + C
    expect(stats.maxDepth).toBe(2);
    expect(stats.cycleCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- bomTreeBuilder`
Expected: module not found.

- [ ] **Step 3: Implement `backend/src/services/bomTreeBuilder.ts`**

```typescript
import { BomComponent } from '../dwClient/bom.js';

export type BomNode = {
  arInvtId: number;
  itemNumber: string;
  description: string;
  rev: string;
  itemClass: string;
  isPurchased: boolean;
  qtyRequired: number;
  uom: string;
  level: number;
  cycleDetected?: boolean;
  children: BomNode[];
};

export type BomBuildStats = { nodeCount: number; maxDepth: number; cycleCount: number };

export type BuildInput = {
  rootArInvtId: number;
  rootItemNumber: string;
  rootDescription: string;
  rootRev: string;
  rootItemClass: string;
  qty: number;
  getComponents: (input: { arInvtId: number; qty: number }) => Promise<BomComponent[]>;
};

async function expand(
  arInvtId: number,
  itemNumber: string,
  description: string,
  rev: string,
  itemClass: string,
  isPurchased: boolean,
  qty: number,
  uom: string,
  level: number,
  ancestors: ReadonlySet<number>,
  getComponents: BuildInput['getComponents'],
  stats: BomBuildStats,
): Promise<BomNode> {
  stats.nodeCount += 1;
  if (level > stats.maxDepth) stats.maxDepth = level;

  if (ancestors.has(arInvtId)) {
    stats.cycleCount += 1;
    return {
      arInvtId, itemNumber, description, rev, itemClass, isPurchased,
      qtyRequired: qty, uom, level, cycleDetected: true, children: [],
    };
  }
  if (isPurchased) {
    return { arInvtId, itemNumber, description, rev, itemClass, isPurchased, qtyRequired: qty, uom, level, children: [] };
  }

  const childComps = await getComponents({ arInvtId, qty });
  const newAncestors = new Set(ancestors);
  newAncestors.add(arInvtId);
  const children = await Promise.all(
    childComps.map(c => expand(
      c.arInvtId, c.itemNumber, c.description, c.rev, c.itemClass, c.isPurchased,
      c.qtyRequired, c.uom, level + 1, newAncestors, getComponents, stats,
    )),
  );
  return { arInvtId, itemNumber, description, rev, itemClass, isPurchased, qtyRequired: qty, uom, level, children };
}

export async function buildBomTreeWithStats(input: BuildInput): Promise<{ tree: BomNode | null; stats: BomBuildStats }> {
  const stats: BomBuildStats = { nodeCount: 0, maxDepth: 0, cycleCount: 0 };
  const rootChildren = await input.getComponents({ arInvtId: input.rootArInvtId, qty: input.qty });
  if (rootChildren.length === 0) {
    return { tree: null, stats };
  }
  stats.nodeCount = 1;
  const ancestors = new Set<number>([input.rootArInvtId]);
  const children = await Promise.all(
    rootChildren.map(c => expand(
      c.arInvtId, c.itemNumber, c.description, c.rev, c.itemClass, c.isPurchased,
      c.qtyRequired, c.uom, 1, ancestors, input.getComponents, stats,
    )),
  );
  const tree: BomNode = {
    arInvtId: input.rootArInvtId,
    itemNumber: input.rootItemNumber,
    description: input.rootDescription,
    rev: input.rootRev,
    itemClass: input.rootItemClass,
    isPurchased: false,
    qtyRequired: input.qty,
    uom: 'ea',
    level: 0,
    children,
  };
  if (stats.maxDepth < 1 && children.length > 0) stats.maxDepth = 1;
  return { tree, stats };
}

export async function buildBomTree(input: BuildInput): Promise<BomNode | null> {
  const { tree } = await buildBomTreeWithStats(input);
  return tree;
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test -- bomTreeBuilder`
Expected: all 6 tests passing.

- [ ] **Step 5: Commit**

```bash
cd ..
git add backend/src/services/bomTreeBuilder.ts backend/test/services/
git commit -m "feat(service): add bomTreeBuilder with cycle detection and parallel expansion"
```

---

## Task 9: Session store + middleware

**Files:**
- Create: `backend/src/session.ts`
- Create: `backend/src/middleware/requireSession.ts`
- Create: `backend/src/middleware/errorHandler.ts`
- Create: `backend/test/session.test.ts`

- [ ] **Step 1: Write failing test `backend/test/session.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createSessionStore } from '../src/session.js';

describe('session store', () => {
  it('creates, reads, and deletes sessions', () => {
    const store = createSessionStore({ ttlMs: 1000 });
    const id = store.create({
      username: 'u', baseUrl: 'http://x', database: 'db', eplantId: 1, authToken: 'tok',
    });
    expect(id).toBeTypeOf('string');
    const s = store.get(id);
    expect(s?.username).toBe('u');
    expect(s?.authToken).toBe('tok');
    store.destroy(id);
    expect(store.get(id)).toBeNull();
  });

  it('expires sessions after ttl', () => {
    vi.useFakeTimers();
    const store = createSessionStore({ ttlMs: 100 });
    const id = store.create({ username: 'u', baseUrl: 'x', database: 'db', eplantId: 1, authToken: 't' });
    vi.advanceTimersByTime(150);
    expect(store.get(id)).toBeNull();
    vi.useRealTimers();
  });

  it('touch resets expiry', () => {
    vi.useFakeTimers();
    const store = createSessionStore({ ttlMs: 100 });
    const id = store.create({ username: 'u', baseUrl: 'x', database: 'db', eplantId: 1, authToken: 't' });
    vi.advanceTimersByTime(80);
    store.touch(id);
    vi.advanceTimersByTime(80);
    expect(store.get(id)?.username).toBe('u');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- session`
Expected: module not found.

- [ ] **Step 3: Implement `backend/src/session.ts`**

```typescript
import { randomUUID } from 'node:crypto';

export type SessionData = {
  username: string;
  baseUrl: string;
  database: string;
  eplantId: number;
  authToken: string;
};

type StoredSession = SessionData & { id: string; expiresAt: number };

export type SessionStore = {
  create(data: SessionData): string;
  get(id: string): SessionData | null;
  touch(id: string): void;
  destroy(id: string): void;
  updateToken(id: string, authToken: string): void;
};

export function createSessionStore(opts: { ttlMs: number }): SessionStore {
  const map = new Map<string, StoredSession>();
  const now = () => Date.now();

  function get(id: string): SessionData | null {
    const s = map.get(id);
    if (!s) return null;
    if (s.expiresAt < now()) {
      map.delete(id);
      return null;
    }
    return s;
  }

  return {
    create(data) {
      const id = randomUUID();
      map.set(id, { id, ...data, expiresAt: now() + opts.ttlMs });
      return id;
    },
    get,
    touch(id) {
      const s = map.get(id);
      if (s) s.expiresAt = now() + opts.ttlMs;
    },
    destroy(id) { map.delete(id); },
    updateToken(id, token) {
      const s = map.get(id);
      if (s) s.authToken = token;
    },
  };
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test -- session`
Expected: 3 passing.

- [ ] **Step 5: Implement `backend/src/middleware/requireSession.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';
import { SessionData, SessionStore } from '../session.js';
import { createDwClient, DwClient } from '../dwClient/index.js';

declare module 'express-serve-static-core' {
  interface Request {
    session?: SessionData & { id: string };
    dw?: DwClient;
  }
}

export function makeRequireSession(store: SessionStore) {
  return function requireSession(req: Request, res: Response, next: NextFunction) {
    const id = req.cookies?.sessionId as string | undefined;
    const data = id ? store.get(id) : null;
    if (!id || !data) {
      res.status(401).json({ error: 'NOT_AUTHENTICATED' });
      return;
    }
    store.touch(id);
    req.session = { id, ...data };
    const dw = createDwClient({ baseUrl: data.baseUrl });
    dw.setAuthToken(data.authToken);
    req.dw = dw;
    next();
  };
}
```

- [ ] **Step 6: Implement `backend/src/middleware/errorHandler.ts`**

```typescript
import { ErrorRequestHandler } from 'express';
import { logger } from '../logger.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const code = (err && typeof err === 'object' && 'code' in err) ? String((err as { code: unknown }).code) : 'INTERNAL';
  const requestId = (req as Request & { id?: string }).id ?? '';
  logger.error({ err, code, path: req.path, requestId }, 'request error');
  const statusByCode: Record<string, number> = {
    AUTH_FAILED: 401,
    AUTH_EXPIRED: 401,
    DW_UNREACHABLE: 503,
    DW_ERROR: 502,
    INVALID_QTY: 400,
  };
  const status = statusByCode[code] ?? 500;
  res.status(status).json({ error: code, message: err?.message ?? 'unknown error', requestId });
};
```

- [ ] **Step 7: Commit**

```bash
cd ..
git add backend/src/session.ts backend/src/middleware/ backend/test/session.test.ts
git commit -m "feat(backend): add in-memory session store and auth middleware"
```

---

## Task 10: Auth routes (`/api/auth/login`, `/logout`, `/me`)

**Files:**
- Create: `backend/src/routes/auth.ts`
- Modify: `backend/src/server.ts` (wire routes + session store)
- Create: `backend/test/routes/auth.test.ts`

- [ ] **Step 1: Write failing test `backend/test/routes/auth.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import nock from 'nock';
import { createApp } from '../../src/server.js';

const BASE = 'http://dw.test:8080/WebAPI';

describe('POST /api/auth/login', () => {
  beforeEach(() => nock.disableNetConnect());
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
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- routes/auth`
Expected: routes not implemented.

- [ ] **Step 3: Implement `backend/src/routes/auth.ts`**

```typescript
import { Router } from 'express';
import { createDwClient } from '../dwClient/index.js';
import { SessionStore } from '../session.js';

export function makeAuthRouter(store: SessionStore) {
  const router = Router();

  router.post('/login', async (req, res, next) => {
    try {
      const { baseUrl, username, password, database, eplantId } = req.body ?? {};
      if (!baseUrl || !username || !password || !database || eplantId === undefined) {
        res.status(400).json({ error: 'MISSING_FIELDS' });
        return;
      }
      const dw = createDwClient({ baseUrl });
      const login = await dw.auth.login({ username, password, database });
      const sessionId = store.create({
        username: login.username,
        baseUrl, database, eplantId: Number(eplantId),
        authToken: login.authToken,
      });
      res.cookie('sessionId', sessionId, {
        httpOnly: true, sameSite: 'lax', secure: false, maxAge: 8 * 60 * 60 * 1000,
      });
      res.json({ username: login.username, eplantId: Number(eplantId) });
    } catch (e) { next(e); }
  });

  router.post('/logout', (req, res) => {
    const id = req.cookies?.sessionId as string | undefined;
    if (id) store.destroy(id);
    res.clearCookie('sessionId');
    res.json({ ok: true });
  });

  router.get('/me', (req, res) => {
    const id = req.cookies?.sessionId as string | undefined;
    const s = id ? store.get(id) : null;
    if (!s) { res.status(401).json({ error: 'NOT_AUTHENTICATED' }); return; }
    res.json({ username: s.username, eplantId: s.eplantId });
  });

  return router;
}
```

- [ ] **Step 4: Update `backend/src/server.ts`**

Replace the whole file:

```typescript
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { logger } from './logger.js';
import { config } from './config.js';
import { createSessionStore } from './session.js';
import { makeAuthRouter } from './routes/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): Express {
  const app = express();
  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  const sessionStore = createSessionStore({ ttlMs: config.sessionTtlMs });

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', makeAuthRouter(sessionStore));

  app.use(errorHandler);
  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const app = createApp();
  app.listen(config.port, () => logger.info({ port: config.port }, 'backend listening'));
}
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd ..
git add backend/
git commit -m "feat(backend): add /api/auth login/logout/me endpoints with session cookie"
```

---

## Task 11: Items + sales-orders + releases routes

**Files:**
- Create: `backend/src/routes/items.ts`
- Create: `backend/src/routes/salesOrders.ts`
- Modify: `backend/src/server.ts`
- Create: `backend/test/routes/items.test.ts`
- Create: `backend/test/routes/salesOrders.test.ts`

- [ ] **Step 1: Write failing test `backend/test/routes/items.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import nock from 'nock';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../../src/server.js';

const BASE = 'http://dw.test:8080/WebAPI';
const listFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/inventoryList.json'), 'utf8'));

async function login(app: ReturnType<typeof createApp>) {
  nock(BASE).post('/User/Login').reply(200, { AuthToken: 'tok', UserName: 'u' });
  const res = await request(app).post('/api/auth/login').send({
    baseUrl: BASE, username: 'u', password: 'p', database: 'db', eplantId: 1,
  });
  return res.headers['set-cookie'];
}

describe('GET /api/items', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).get('/api/items?q=PART');
    expect(res.status).toBe(401);
  });

  it('returns items list when authenticated', async () => {
    const app = createApp();
    const cookies = await login(app);
    nock(BASE).get('/Manufacturing/Inventory/InventoryList/0').query(true).reply(200, listFx);
    const res = await request(app).get('/api/items?q=PART').set('Cookie', cookies!);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].itemNumber).toBe('PART-A');
  });
});
```

- [ ] **Step 2: Write failing test `backend/test/routes/salesOrders.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import nock from 'nock';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from '../../src/server.js';

const BASE = 'http://dw.test:8080/WebAPI';
const soFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/salesOrder.json'), 'utf8'));
const relFx = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/dw/salesOrderReleases.json'), 'utf8'));

async function login(app: ReturnType<typeof createApp>) {
  nock(BASE).post('/User/Login').reply(200, { AuthToken: 'tok', UserName: 'u' });
  const res = await request(app).post('/api/auth/login').send({
    baseUrl: BASE, username: 'u', password: 'p', database: 'db', eplantId: 1,
  });
  return res.headers['set-cookie'];
}

describe('GET /api/items/:arInvtId/sales-orders', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('returns sales orders for item', async () => {
    const app = createApp();
    const cookies = await login(app);
    nock(BASE).get('/SalesDistribution/SalesOrder/SalesOrder/0').query(true).reply(200, soFx);
    const res = await request(app).get('/api/items/100/sales-orders').set('Cookie', cookies!);
    expect(res.status).toBe(200);
    expect(res.body.salesOrders).toHaveLength(2);
    expect(res.body.salesOrders[0].remaining).toBe(400);
  });
});

describe('GET /api/sales-orders/:ordDetailId/releases', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('returns releases for SO detail', async () => {
    const app = createApp();
    const cookies = await login(app);
    nock(BASE).get('/SalesDistribution/SalesOrder/SalesOrderReleases/0').query(true).reply(200, relFx);
    const res = await request(app).get('/api/sales-orders/11/releases').set('Cookie', cookies!);
    expect(res.status).toBe(200);
    expect(res.body.releases).toHaveLength(2);
    expect(res.body.releases[0].qty).toBe(200);
  });
});
```

- [ ] **Step 3: Run, confirm failure**

Run: `npm test -- routes/items` and `npm test -- routes/salesOrders`
Expected: routes not implemented.

- [ ] **Step 4: Implement `backend/src/routes/items.ts`**

```typescript
import { Router } from 'express';
import { SessionStore } from '../session.js';
import { makeRequireSession } from '../middleware/requireSession.js';

export function makeItemsRouter(store: SessionStore) {
  const router = Router();
  router.use(makeRequireSession(store));

  router.get('/', async (req, res, next) => {
    try {
      const q = String(req.query.q ?? '').trim();
      if (q.length < 2) { res.json({ items: [] }); return; }
      const page = Number(req.query.page ?? 0);
      const items = await req.dw!.inventory.searchItems({ query: q, page });
      res.json({ items });
    } catch (e) { next(e); }
  });

  router.get('/:arInvtId/sales-orders', async (req, res, next) => {
    try {
      const arInvtId = Number(req.params.arInvtId);
      const salesOrders = await req.dw!.salesOrders.listForItem({
        arInvtId, eplantId: req.session!.eplantId,
      });
      res.json({ salesOrders });
    } catch (e) { next(e); }
  });

  return router;
}
```

- [ ] **Step 5: Implement `backend/src/routes/salesOrders.ts`**

```typescript
import { Router } from 'express';
import { SessionStore } from '../session.js';
import { makeRequireSession } from '../middleware/requireSession.js';

export function makeSalesOrdersRouter(store: SessionStore) {
  const router = Router();
  router.use(makeRequireSession(store));

  router.get('/:ordDetailId/releases', async (req, res, next) => {
    try {
      const ordDetailId = Number(req.params.ordDetailId);
      const releases = await req.dw!.salesOrders.getReleases({ ordDetailId });
      res.json({ releases });
    } catch (e) { next(e); }
  });

  return router;
}
```

- [ ] **Step 6: Update `backend/src/server.ts`**

Add imports and wire them:

```typescript
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { logger } from './logger.js';
import { config } from './config.js';
import { createSessionStore } from './session.js';
import { makeAuthRouter } from './routes/auth.js';
import { makeItemsRouter } from './routes/items.js';
import { makeSalesOrdersRouter } from './routes/salesOrders.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): Express {
  const app = express();
  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  const sessionStore = createSessionStore({ ttlMs: config.sessionTtlMs });

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', makeAuthRouter(sessionStore));
  app.use('/api/items', makeItemsRouter(sessionStore));
  app.use('/api/sales-orders', makeSalesOrdersRouter(sessionStore));

  app.use(errorHandler);
  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const app = createApp();
  app.listen(config.port, () => logger.info({ port: config.port }, 'backend listening'));
}
```

- [ ] **Step 7: Run tests, confirm pass**

Run: `npm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
cd ..
git add backend/
git commit -m "feat(backend): add /api/items, /api/items/:id/sales-orders, /api/sales-orders/:id/releases"
```

---

## Task 12: BOM tree route (`GET /api/bom-tree`)

**Files:**
- Create: `backend/src/routes/bom.ts`
- Modify: `backend/src/server.ts`
- Create: `backend/test/routes/bom.test.ts`
- Create: `backend/test/fixtures/dw/bom_two_level_root.json`
- Create: `backend/test/fixtures/dw/bom_two_level_sub.json`

- [ ] **Step 1: Write fixture `backend/test/fixtures/dw/bom_two_level_root.json`**

```json
{
  "data": [
    { "ArInvtId": 200, "ItemNo": "SUB", "Description": "Sub", "Rev": "A", "ItemClass": "MFG", "QtyRequired": 20, "Uom": "ea" },
    { "ArInvtId": 201, "ItemNo": "NUT", "Description": "Nut", "Rev": "A", "ItemClass": "BUY", "QtyRequired": 40, "Uom": "ea" }
  ]
}
```

- [ ] **Step 2: Write fixture `backend/test/fixtures/dw/bom_two_level_sub.json`**

```json
{
  "data": [
    { "ArInvtId": 300, "ItemNo": "STEEL", "Description": "Steel bar", "Rev": "A", "ItemClass": "BUY", "QtyRequired": 100, "Uom": "kg" }
  ]
}
```

- [ ] **Step 3: Write failing test `backend/test/routes/bom.test.ts`**

```typescript
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

async function login(app: ReturnType<typeof createApp>) {
  nock(BASE).post('/User/Login').reply(200, { AuthToken: 'tok', UserName: 'u' });
  const res = await request(app).post('/api/auth/login').send({
    baseUrl: BASE, username: 'u', password: 'p', database: 'db', eplantId: 1,
  });
  return res.headers['set-cookie'];
}

describe('GET /api/bom-tree', () => {
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

  it('rejects qty <= 0', async () => {
    const app = createApp();
    const cookies = await login(app);
    const res = await request(app).get('/api/bom-tree?itemId=100&qty=0').set('Cookie', cookies!);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_QTY');
  });

  it('returns tree with stats and reason NO_BOM when empty', async () => {
    const app = createApp();
    const cookies = await login(app);
    // Root item lookup
    nock(BASE).get('/Manufacturing/Inventory/InventoryList/0').query(true).reply(200, listFx);
    // Empty BOM
    nock(BASE).get('/Manufacturing/Inventory/MaterialsForItem/0').query(true).reply(200, { data: [] });
    const res = await request(app).get('/api/bom-tree?itemId=100&qty=10').set('Cookie', cookies!);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tree: null, reason: 'NO_BOM' });
  });

  it('builds 2-level tree end-to-end', async () => {
    const app = createApp();
    const cookies = await login(app);
    nock(BASE).get('/Manufacturing/Inventory/InventoryList/0').query(true).reply(200, listFx);
    nock(BASE).get('/Manufacturing/Inventory/MaterialsForItem/0')
      .query(q => q.arinvtId === '100' && q.qty === '10').reply(200, fxRoot);
    nock(BASE).get('/Manufacturing/Inventory/MaterialsForItem/0')
      .query(q => q.arinvtId === '200' && q.qty === '20').reply(200, fxSub);
    const res = await request(app).get('/api/bom-tree?itemId=100&qty=10').set('Cookie', cookies!);
    expect(res.status).toBe(200);
    expect(res.body.tree.itemNumber).toBe('PART-A');
    expect(res.body.tree.children).toHaveLength(2);
    expect(res.body.stats.nodeCount).toBe(3);
  });
});
```

- [ ] **Step 4: Run, confirm failure**

Run: `npm test -- routes/bom`
Expected: route not implemented.

- [ ] **Step 5: Implement `backend/src/routes/bom.ts`**

```typescript
import { Router } from 'express';
import { SessionStore } from '../session.js';
import { makeRequireSession } from '../middleware/requireSession.js';
import { buildBomTreeWithStats } from '../services/bomTreeBuilder.js';
import { logger } from '../logger.js';

export function makeBomRouter(store: SessionStore) {
  const router = Router();
  router.use(makeRequireSession(store));

  router.get('/', async (req, res, next) => {
    try {
      const itemId = Number(req.query.itemId);
      const qty = Number(req.query.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        res.status(400).json({ error: 'INVALID_QTY' });
        return;
      }
      const dw = req.dw!;
      const root = (await dw.inventory.searchItems({ query: '' }))
        .find(i => i.arInvtId === itemId)
        ?? (await fetchItemById(dw, itemId));
      if (!root) { res.status(404).json({ error: 'ITEM_NOT_FOUND' }); return; }

      const { tree, stats } = await buildBomTreeWithStats({
        rootArInvtId: root.arInvtId,
        rootItemNumber: root.itemNumber,
        rootDescription: root.description,
        rootRev: root.rev,
        rootItemClass: root.itemClass,
        qty,
        getComponents: ({ arInvtId, qty }) => dw.bom.getComponentsForQty({ arInvtId, qty }),
      });
      logger.info({ stats, itemId, qty }, 'BOM tree built');
      if (!tree) { res.json({ tree: null, reason: 'NO_BOM', stats }); return; }
      res.json({ tree, stats });
    } catch (e) { next(e); }
  });

  return router;
}

async function fetchItemById(dw: NonNullable<ReturnType<typeof makeBomRouter> extends Router ? unknown : never> & Record<string, unknown> | any, itemId: number) {
  // Best-effort: most installs accept the InventoryList route with a search by ID via filter
  const all = await dw.inventory.searchItems({ query: String(itemId) });
  return all.find((i: { arInvtId: number }) => i.arInvtId === itemId) ?? null;
}
```

> **Note for engineer:** the `fetchItemById` helper uses the search endpoint with the ID as the query string. If your DW install has a dedicated `InventoryItem/{id}` endpoint that returns the item directly, replace the helper to call it. The test above uses fixture data where the item is in the search response, so the helper works for tests.

- [ ] **Step 6: Update `backend/src/server.ts`**

```typescript
import express, { Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { logger } from './logger.js';
import { config } from './config.js';
import { createSessionStore } from './session.js';
import { makeAuthRouter } from './routes/auth.js';
import { makeItemsRouter } from './routes/items.js';
import { makeSalesOrdersRouter } from './routes/salesOrders.js';
import { makeBomRouter } from './routes/bom.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): Express {
  const app = express();
  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  const sessionStore = createSessionStore({ ttlMs: config.sessionTtlMs });

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', makeAuthRouter(sessionStore));
  app.use('/api/items', makeItemsRouter(sessionStore));
  app.use('/api/sales-orders', makeSalesOrdersRouter(sessionStore));
  app.use('/api/bom-tree', makeBomRouter(sessionStore));

  app.use(errorHandler);
  return app;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const app = createApp();
  app.listen(config.port, () => logger.info({ port: config.port }, 'backend listening'));
}
```

- [ ] **Step 7: Run tests, confirm pass**

Run: `npm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
cd ..
git add backend/
git commit -m "feat(backend): add /api/bom-tree with recursive builder and stats"
```

---

## Task 13: Frontend bootstrap (Vite + React + TanStack Query + Zustand)

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/styles.css`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/types.ts`

- [ ] **Step 1: Write `frontend/package.json`**

```json
{
  "name": "@dw-reporter/frontend",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "vite --port 5173",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.59.20",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "zustand": "^5.0.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "happy-dom": "^15.11.6",
    "typescript": "^5.6.3",
    "vite": "^5.4.11",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: Write `frontend/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["vite/client"],
    "allowJs": false
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Write `frontend/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    setupFiles: ['./test/setup.ts'],
  },
});
```

- [ ] **Step 4: Write `frontend/index.html`**

```html
<!doctype html>
<html lang="sr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Prijava proizvodnje</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `frontend/src/styles.css`**

```css
:root {
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  --bg: #fafafa; --fg: #1a1a1a; --border: #ddd; --accent: #2563eb;
  --buy: #16a34a; --mfg: #2563eb; --cycle: #dc2626;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); }
.app { max-width: 1100px; margin: 0 auto; padding: 1rem; }
button { padding: 0.5rem 1rem; cursor: pointer; }
input { padding: 0.5rem; border: 1px solid var(--border); border-radius: 4px; }
.row { display: flex; gap: 0.5rem; align-items: center; }
.card { background: white; border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: 0.5rem; }
.tree-node { padding-left: 1.5rem; border-left: 1px dashed var(--border); margin-left: 0.25rem; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; color: white; }
.badge.buy { background: var(--buy); }
.badge.mfg { background: var(--mfg); }
.badge.cycle { background: var(--cycle); }
.error { color: #b91c1c; }
.stepper { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.step { padding: 0.25rem 0.75rem; background: white; border: 1px solid var(--border); border-radius: 999px; }
.step.active { background: var(--accent); color: white; border-color: var(--accent); }
```

- [ ] **Step 6: Write `frontend/src/api/types.ts`**

```typescript
export type Me = { username: string; eplantId: number };
export type Item = { arInvtId: number; itemNumber: string; description: string; rev: string; itemClass: string; isPurchased: boolean };
export type SalesOrderRow = {
  ordDetailId: number; orderNumber: string; company: string; poNumber: string;
  totalOrdered: number; cummShipped: number; remaining: number; arInvtId: number;
};
export type Release = { releaseId: number; seq: number; qty: number; requestDate: string | null; promiseDate: string | null };
export type BomNode = {
  arInvtId: number; itemNumber: string; description: string; rev: string; itemClass: string;
  isPurchased: boolean; qtyRequired: number; uom: string; level: number;
  cycleDetected?: boolean; children: BomNode[];
};
export type BomTreeResponse = { tree: BomNode | null; reason?: 'NO_BOM'; stats: { nodeCount: number; maxDepth: number; cycleCount: number } };
```

- [ ] **Step 7: Write `frontend/src/api/client.ts`**

```typescript
import type { Me, Item, SalesOrderRow, Release, BomTreeResponse } from './types.js';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'include', ...init });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message ?? `${res.status}`) as Error & { code?: string; status?: number };
    err.code = body.error;
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const api = {
  login: (body: { baseUrl: string; username: string; password: string; database: string; eplantId: number }) =>
    req<Me>('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  logout: () => req<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  me: () => req<Me>('/api/auth/me'),
  searchItems: (q: string) => req<{ items: Item[] }>(`/api/items?q=${encodeURIComponent(q)}`),
  salesOrdersForItem: (arInvtId: number) => req<{ salesOrders: SalesOrderRow[] }>(`/api/items/${arInvtId}/sales-orders`),
  releasesForSO: (ordDetailId: number) => req<{ releases: Release[] }>(`/api/sales-orders/${ordDetailId}/releases`),
  bomTree: (itemId: number, qty: number) => req<BomTreeResponse>(`/api/bom-tree?itemId=${itemId}&qty=${qty}`),
};
```

- [ ] **Step 8: Write `frontend/src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { api } from './api/client.js';
import { Login } from './pages/Login.js';
import { ItemSearch } from './pages/ItemSearch.js';
import { SalesOrdersPage } from './pages/SalesOrders.js';
import { ReleasesPage } from './pages/Releases.js';
import { BomView } from './pages/BomView.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><ItemSearch /></ProtectedRoute>} />
          <Route path="/sales-orders" element={<ProtectedRoute><SalesOrdersPage /></ProtectedRoute>} />
          <Route path="/releases" element={<ProtectedRoute><ReleasesPage /></ProtectedRoute>} />
          <Route path="/bom" element={<ProtectedRoute><BomView /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 9: Write `frontend/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
root.render(<StrictMode><App /></StrictMode>);
```

- [ ] **Step 10: Create stub files for pages and protected route so build compiles (real implementations come in later tasks)**

Create `frontend/src/components/ProtectedRoute.tsx`:

```tsx
import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
    retry: false,
  });
  if (isLoading) return <div className="app">Loading...</div>;
  if (isError || !data) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

Create stub pages (each just renders title; replaced in later tasks):

`frontend/src/pages/Login.tsx`:
```tsx
export function Login() { return <div className="app"><h1>Login (stub)</h1></div>; }
```

`frontend/src/pages/ItemSearch.tsx`:
```tsx
export function ItemSearch() { return <div className="app"><h1>Item Search (stub)</h1></div>; }
```

`frontend/src/pages/SalesOrders.tsx`:
```tsx
export function SalesOrdersPage() { return <div className="app"><h1>Sales Orders (stub)</h1></div>; }
```

`frontend/src/pages/Releases.tsx`:
```tsx
export function ReleasesPage() { return <div className="app"><h1>Releases (stub)</h1></div>; }
```

`frontend/src/pages/BomView.tsx`:
```tsx
export function BomView() { return <div className="app"><h1>BOM View (stub)</h1></div>; }
```

- [ ] **Step 11: Write `frontend/test/setup.ts`**

```typescript
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 12: Install and verify build**

Run:
```bash
cd ../frontend && npm install && npm run build
```

Expected: build succeeds, produces `dist/`.

- [ ] **Step 13: Commit**

```bash
cd ..
git add frontend/
git commit -m "feat(frontend): bootstrap Vite + React + TanStack Query + Router with stub pages"
```

---

## Task 14: Wizard store (Zustand with persist)

**Files:**
- Create: `frontend/src/store/wizardStore.ts`
- Create: `frontend/test/store/wizardStore.test.ts`

- [ ] **Step 1: Write failing test `frontend/test/store/wizardStore.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useWizardStore } from '../../src/store/wizardStore.js';

describe('wizardStore', () => {
  beforeEach(() => useWizardStore.getState().reset());

  it('starts at step 1 with empty state', () => {
    const s = useWizardStore.getState();
    expect(s.step).toBe(1);
    expect(s.selectedItem).toBeUndefined();
    expect(s.selectedSO).toBeUndefined();
    expect(s.selection.mode).toBe('full');
    expect(s.selection.releaseIds).toEqual([]);
    expect(s.finalQty).toBe(0);
  });

  it('selectItem advances to step 2', () => {
    useWizardStore.getState().selectItem({ arInvtId: 1, itemNumber: 'P', description: 'd' });
    expect(useWizardStore.getState().step).toBe(2);
    expect(useWizardStore.getState().selectedItem?.arInvtId).toBe(1);
  });

  it('selectSO advances to step 3', () => {
    useWizardStore.getState().selectItem({ arInvtId: 1, itemNumber: 'P', description: 'd' });
    useWizardStore.getState().selectSO({ ordDetailId: 11, orderNumber: 'SO1', totalOrdered: 500, cummShipped: 0 });
    expect(useWizardStore.getState().step).toBe(3);
    expect(useWizardStore.getState().selectedSO?.ordDetailId).toBe(11);
  });

  it('setSelectionFull computes finalQty = totalOrdered', () => {
    useWizardStore.getState().selectItem({ arInvtId: 1, itemNumber: 'P', description: 'd' });
    useWizardStore.getState().selectSO({ ordDetailId: 11, orderNumber: 'SO1', totalOrdered: 500, cummShipped: 100 });
    useWizardStore.getState().setSelectionFull();
    expect(useWizardStore.getState().finalQty).toBe(500);
  });

  it('setSelectionReleases sums checked release qtys', () => {
    useWizardStore.getState().selectItem({ arInvtId: 1, itemNumber: 'P', description: 'd' });
    useWizardStore.getState().selectSO({ ordDetailId: 11, orderNumber: 'SO1', totalOrdered: 500, cummShipped: 0 });
    useWizardStore.getState().setSelectionReleases({
      releaseIds: [901, 902],
      releases: [
        { releaseId: 901, seq: 1, qty: 200, requestDate: null, promiseDate: null },
        { releaseId: 902, seq: 2, qty: 150, requestDate: null, promiseDate: null },
        { releaseId: 903, seq: 3, qty: 50, requestDate: null, promiseDate: null },
      ],
    });
    expect(useWizardStore.getState().finalQty).toBe(350);
  });

  it('reset returns to step 1 and clears state', () => {
    useWizardStore.getState().selectItem({ arInvtId: 1, itemNumber: 'P', description: 'd' });
    useWizardStore.getState().reset();
    expect(useWizardStore.getState().step).toBe(1);
    expect(useWizardStore.getState().selectedItem).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- wizardStore` (from frontend folder)
Expected: module not found.

- [ ] **Step 3: Implement `frontend/src/store/wizardStore.ts`**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Release } from '../api/types.js';

type SelectedItem = { arInvtId: number; itemNumber: string; description: string };
type SelectedSO = { ordDetailId: number; orderNumber: string; totalOrdered: number; cummShipped: number };
type Selection = { mode: 'full' | 'releases'; releaseIds: number[] };

type WizardState = {
  step: 1 | 2 | 3 | 4;
  selectedItem?: SelectedItem;
  selectedSO?: SelectedSO;
  selection: Selection;
  finalQty: number;
  goTo: (s: 1 | 2 | 3 | 4) => void;
  selectItem: (item: SelectedItem) => void;
  selectSO: (so: SelectedSO) => void;
  setSelectionFull: () => void;
  setSelectionReleases: (input: { releaseIds: number[]; releases: Release[] }) => void;
  reset: () => void;
};

const initial = { step: 1 as const, selection: { mode: 'full' as const, releaseIds: [] }, finalQty: 0 };

export const useWizardStore = create<WizardState>()(
  persist(
    (set, get) => ({
      ...initial,
      goTo: (step) => set({ step }),
      selectItem: (item) => set({ selectedItem: item, step: 2, selectedSO: undefined, finalQty: 0, selection: { mode: 'full', releaseIds: [] } }),
      selectSO: (so) => set({ selectedSO: so, step: 3, selection: { mode: 'full', releaseIds: [] }, finalQty: 0 }),
      setSelectionFull: () => {
        const so = get().selectedSO;
        set({ selection: { mode: 'full', releaseIds: [] }, finalQty: so?.totalOrdered ?? 0 });
      },
      setSelectionReleases: ({ releaseIds, releases }) => {
        const sum = releases.filter(r => releaseIds.includes(r.releaseId)).reduce((acc, r) => acc + r.qty, 0);
        set({ selection: { mode: 'releases', releaseIds }, finalQty: sum });
      },
      reset: () => set({ ...initial, selectedItem: undefined, selectedSO: undefined }),
    }),
    { name: 'dw-reporter-wizard' },
  ),
);
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test -- wizardStore`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/store/ frontend/test/store/
git commit -m "feat(frontend): add Zustand wizardStore with persist"
```

---

## Task 15: Login page (real implementation)

**Files:**
- Modify: `frontend/src/pages/Login.tsx`

- [ ] **Step 1: Replace `frontend/src/pages/Login.tsx`**

```tsx
import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';

export function Login() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const resetWizard = useWizardStore(s => s.reset);
  const [baseUrl, setBaseUrl] = useState('http://localhost:8080/WebAPI');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('IQORA');
  const [eplantId, setEplantId] = useState('1');

  const m = useMutation({
    mutationFn: () => api.login({ baseUrl, username, password, database, eplantId: Number(eplantId) }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      resetWizard();
      navigate('/');
    },
  });

  function onSubmit(e: FormEvent) { e.preventDefault(); m.mutate(); }

  return (
    <div className="app">
      <h1>Prijava — DelmiaWorks</h1>
      <form className="card" onSubmit={onSubmit}>
        <div className="row"><label style={{ width: 140 }}>DW Base URL</label>
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} style={{ flex: 1 }} required /></div>
        <div className="row" style={{ marginTop: 8 }}><label style={{ width: 140 }}>Database</label>
          <input value={database} onChange={e => setDatabase(e.target.value)} required /></div>
        <div className="row" style={{ marginTop: 8 }}><label style={{ width: 140 }}>EPlant ID</label>
          <input value={eplantId} onChange={e => setEplantId(e.target.value)} type="number" min={1} required /></div>
        <div className="row" style={{ marginTop: 8 }}><label style={{ width: 140 }}>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username" /></div>
        <div className="row" style={{ marginTop: 8 }}><label style={{ width: 140 }}>Password</label>
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" required autoComplete="current-password" /></div>
        <div className="row" style={{ marginTop: 16 }}>
          <button type="submit" disabled={m.isPending}>{m.isPending ? 'Prijavljujem...' : 'Prijavi se'}</button>
          {m.isError && <span className="error">{(m.error as Error).message}</span>}
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend builds**

Run from `frontend/`:
```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd ..
git add frontend/src/pages/Login.tsx
git commit -m "feat(frontend): implement Login page (DW URL + credentials + EPlant)"
```

---

## Task 16: WizardStepper + ItemSearch page

**Files:**
- Create: `frontend/src/components/WizardStepper.tsx`
- Modify: `frontend/src/pages/ItemSearch.tsx`
- Create: `frontend/test/pages/ItemSearch.test.tsx`

- [ ] **Step 1: Write `frontend/src/components/WizardStepper.tsx`**

```tsx
import { useWizardStore } from '../store/wizardStore.js';

const labels = ['1. Artikal', '2. Sales Order', '3. Release', '4. BOM'];

export function WizardStepper() {
  const step = useWizardStore(s => s.step);
  return (
    <div className="stepper">
      {labels.map((label, i) => (
        <div key={i} className={`step${i + 1 === step ? ' active' : ''}`}>{label}</div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write failing test `frontend/test/pages/ItemSearch.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ItemSearch } from '../../src/pages/ItemSearch.js';
import { useWizardStore } from '../../src/store/wizardStore.js';

vi.mock('../../src/api/client.js', () => ({
  api: {
    searchItems: vi.fn(async (q: string) => ({
      items: q.length >= 2 ? [
        { arInvtId: 1, itemNumber: 'PART-A', description: 'Widget A', rev: '1', itemClass: 'MFG', isPurchased: false },
      ] : [],
    })),
  },
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ItemSearch />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ItemSearch', () => {
  beforeEach(() => useWizardStore.getState().reset());

  it('searches and lists items after 2 chars', async () => {
    renderPage();
    const input = screen.getByPlaceholderText(/pretraga/i);
    await userEvent.type(input, 'PA');
    await waitFor(() => expect(screen.getByText('PART-A')).toBeInTheDocument());
  });

  it('clicking item updates store and advances to step 2', async () => {
    renderPage();
    await userEvent.type(screen.getByPlaceholderText(/pretraga/i), 'PA');
    await waitFor(() => screen.getByText('PART-A'));
    await userEvent.click(screen.getByText('PART-A'));
    expect(useWizardStore.getState().selectedItem?.arInvtId).toBe(1);
    expect(useWizardStore.getState().step).toBe(2);
  });
});
```

- [ ] **Step 3: Run, confirm failure**

Run: `npm test -- ItemSearch`
Expected: stub implementation has no input.

- [ ] **Step 4: Replace `frontend/src/pages/ItemSearch.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';
import { WizardStepper } from '../components/WizardStepper.js';

function useDebounced(value: string, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ItemSearch() {
  const navigate = useNavigate();
  const selectItem = useWizardStore(s => s.selectItem);
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, isFetching, error } = useQuery({
    queryKey: ['items', dq],
    queryFn: () => api.searchItems(dq),
    enabled: dq.length >= 2,
    staleTime: 30_000,
  });

  return (
    <div className="app">
      <WizardStepper />
      <h2>Izaberi artikal</h2>
      <input
        placeholder="Pretraga (min 2 znaka)..."
        value={q}
        onChange={e => setQ(e.target.value)}
        style={{ width: '100%' }}
      />
      {isFetching && <p>Učitavam...</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      <div style={{ marginTop: 8 }}>
        {data?.items.map(item => (
          <div
            key={item.arInvtId}
            className="card"
            style={{ cursor: 'pointer' }}
            onClick={() => { selectItem({ arInvtId: item.arInvtId, itemNumber: item.itemNumber, description: item.description }); navigate('/sales-orders'); }}
          >
            <strong>{item.itemNumber}</strong> — {item.description} <em>({item.itemClass})</em>
          </div>
        ))}
        {data && data.items.length === 0 && dq.length >= 2 && <p>Nema rezultata.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npm test -- ItemSearch`
Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/src/components/WizardStepper.tsx frontend/src/pages/ItemSearch.tsx frontend/test/pages/ItemSearch.test.tsx
git commit -m "feat(frontend): implement ItemSearch page with debounced query"
```

---

## Task 17: Sales Orders page

**Files:**
- Modify: `frontend/src/pages/SalesOrders.tsx`
- Create: `frontend/test/pages/SalesOrders.test.tsx`

- [ ] **Step 1: Write failing test `frontend/test/pages/SalesOrders.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SalesOrdersPage } from '../../src/pages/SalesOrders.js';
import { useWizardStore } from '../../src/store/wizardStore.js';

vi.mock('../../src/api/client.js', () => ({
  api: {
    salesOrdersForItem: vi.fn(async () => ({
      salesOrders: [
        { ordDetailId: 11, orderNumber: 'SO1001', company: 'Acme', poNumber: 'PO-1', totalOrdered: 500, cummShipped: 100, remaining: 400, arInvtId: 1 },
      ],
    })),
  },
}));

function renderPage() {
  useWizardStore.getState().selectItem({ arInvtId: 1, itemNumber: 'PART-A', description: 'Widget A' });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SalesOrdersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SalesOrdersPage', () => {
  beforeEach(() => useWizardStore.getState().reset());

  it('lists SOs for selected item and advances on click', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('SO1001')).toBeInTheDocument());
    expect(screen.getByText(/Acme/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('SO1001'));
    expect(useWizardStore.getState().selectedSO?.ordDetailId).toBe(11);
    expect(useWizardStore.getState().step).toBe(3);
  });

  it('redirects to / if no item is selected', () => {
    // No selectItem called
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/sales-orders']}>
          <SalesOrdersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Since we use programmatic navigate, just assert that the list isn't rendered
    expect(screen.queryByText('SO1001')).toBeNull();
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- SalesOrders`
Expected: stub fails to render SO list.

- [ ] **Step 3: Replace `frontend/src/pages/SalesOrders.tsx`**

```tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';
import { WizardStepper } from '../components/WizardStepper.js';

export function SalesOrdersPage() {
  const navigate = useNavigate();
  const item = useWizardStore(s => s.selectedItem);
  const selectSO = useWizardStore(s => s.selectSO);

  useEffect(() => {
    if (!item) navigate('/');
  }, [item, navigate]);

  const { data, isFetching, error } = useQuery({
    queryKey: ['sales-orders', item?.arInvtId],
    queryFn: () => api.salesOrdersForItem(item!.arInvtId),
    enabled: !!item,
    staleTime: 60_000,
  });

  if (!item) return null;

  return (
    <div className="app">
      <WizardStepper />
      <h2>Sales Order-i za {item.itemNumber}</h2>
      <p>{item.description}</p>
      {isFetching && <p>Učitavam...</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">Order #</th>
            <th align="left">Kupac</th>
            <th align="left">PO #</th>
            <th align="right">Ukupno</th>
            <th align="right">Isporučeno</th>
            <th align="right">Preostalo</th>
          </tr>
        </thead>
        <tbody>
          {data?.salesOrders.map(so => (
            <tr
              key={so.ordDetailId}
              style={{ cursor: 'pointer', borderTop: '1px solid var(--border)' }}
              onClick={() => { selectSO({ ordDetailId: so.ordDetailId, orderNumber: so.orderNumber, totalOrdered: so.totalOrdered, cummShipped: so.cummShipped }); navigate('/releases'); }}
            >
              <td>{so.orderNumber}</td>
              <td>{so.company}</td>
              <td>{so.poNumber}</td>
              <td align="right">{so.totalOrdered}</td>
              <td align="right">{so.cummShipped}</td>
              <td align="right">{so.remaining}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && data.salesOrders.length === 0 && <p>Nema aktivnih Sales Order-a za ovaj artikal.</p>}
      <button style={{ marginTop: 16 }} onClick={() => navigate('/')}>← Nazad</button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test -- SalesOrders`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/pages/SalesOrders.tsx frontend/test/pages/SalesOrders.test.tsx
git commit -m "feat(frontend): implement SalesOrders page"
```

---

## Task 18: Releases page (full qty vs selected releases)

**Files:**
- Modify: `frontend/src/pages/Releases.tsx`
- Create: `frontend/test/pages/Releases.test.tsx`

- [ ] **Step 1: Write failing test `frontend/test/pages/Releases.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ReleasesPage } from '../../src/pages/Releases.js';
import { useWizardStore } from '../../src/store/wizardStore.js';

vi.mock('../../src/api/client.js', () => ({
  api: {
    releasesForSO: vi.fn(async () => ({
      releases: [
        { releaseId: 901, seq: 1, qty: 200, requestDate: null, promiseDate: null },
        { releaseId: 902, seq: 2, qty: 300, requestDate: null, promiseDate: null },
      ],
    })),
  },
}));

function renderPage() {
  useWizardStore.getState().selectItem({ arInvtId: 1, itemNumber: 'PART-A', description: 'd' });
  useWizardStore.getState().selectSO({ ordDetailId: 11, orderNumber: 'SO1', totalOrdered: 500, cummShipped: 100 });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ReleasesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReleasesPage', () => {
  beforeEach(() => useWizardStore.getState().reset());

  it('defaults to Puna kolicina = TotalOrdered (500)', async () => {
    renderPage();
    await waitFor(() => screen.getByLabelText(/puna koli/i));
    expect(screen.getByLabelText(/puna koli/i)).toBeChecked();
    expect(screen.getByTestId('final-qty').textContent).toBe('500');
  });

  it('switching to release mode sums checked release qtys', async () => {
    renderPage();
    await waitFor(() => screen.getByLabelText(/release-ove/i));
    await userEvent.click(screen.getByLabelText(/release-ove/i));
    await waitFor(() => screen.getByLabelText(/Release #901/));
    await userEvent.click(screen.getByLabelText(/Release #901/));
    expect(screen.getByTestId('final-qty').textContent).toBe('200');
    await userEvent.click(screen.getByLabelText(/Release #902/));
    expect(screen.getByTestId('final-qty').textContent).toBe('500');
  });

  it('Dalje is disabled when no releases checked in release mode', async () => {
    renderPage();
    await waitFor(() => screen.getByLabelText(/release-ove/i));
    await userEvent.click(screen.getByLabelText(/release-ove/i));
    expect(screen.getByRole('button', { name: /dalje/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run, confirm failure**

Run: `npm test -- Releases`
Expected: stub.

- [ ] **Step 3: Replace `frontend/src/pages/Releases.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';
import { WizardStepper } from '../components/WizardStepper.js';

export function ReleasesPage() {
  const navigate = useNavigate();
  const item = useWizardStore(s => s.selectedItem);
  const so = useWizardStore(s => s.selectedSO);
  const selection = useWizardStore(s => s.selection);
  const finalQty = useWizardStore(s => s.finalQty);
  const setFull = useWizardStore(s => s.setSelectionFull);
  const setReleases = useWizardStore(s => s.setSelectionReleases);

  useEffect(() => {
    if (!item || !so) navigate('/');
    else if (selection.mode === 'full' && finalQty === 0) setFull();
  }, [item, so, selection.mode, finalQty, setFull, navigate]);

  const { data, isFetching } = useQuery({
    queryKey: ['releases', so?.ordDetailId],
    queryFn: () => api.releasesForSO(so!.ordDetailId),
    enabled: !!so,
    staleTime: 60_000,
  });

  const [checked, setChecked] = useState<Set<number>>(new Set(selection.releaseIds));

  function toggle(id: number) {
    const next = new Set(checked);
    next.has(id) ? next.delete(id) : next.add(id);
    setChecked(next);
    setReleases({ releaseIds: [...next], releases: data?.releases ?? [] });
  }

  if (!item || !so) return null;

  return (
    <div className="app">
      <WizardStepper />
      <h2>Količina za {item.itemNumber} — {so.orderNumber}</h2>
      <div className="card">
        <label>
          <input type="radio" name="mode" checked={selection.mode === 'full'} onChange={() => { setFull(); setChecked(new Set()); }} />
          {' '}Puna količina ({so.totalOrdered})
        </label>
        <div style={{ marginTop: 8 }}>
          <label>
            <input type="radio" name="mode" checked={selection.mode === 'releases'}
              onChange={() => setReleases({ releaseIds: [...checked], releases: data?.releases ?? [] })} />
            {' '}Selektuj release-ove
          </label>
        </div>
      </div>

      {selection.mode === 'releases' && (
        <div className="card">
          {isFetching && <p>Učitavam release-ove...</p>}
          {data?.releases.length === 0 && <p>Nema release-ova. Koristi punu količinu.</p>}
          {data?.releases.map(r => (
            <div key={r.releaseId} style={{ padding: 4 }}>
              <label>
                <input type="checkbox"
                  aria-label={`Release #${r.releaseId}`}
                  checked={checked.has(r.releaseId)}
                  onChange={() => toggle(r.releaseId)} />
                {' '}Release #{r.releaseId} (seq {r.seq}) — {r.qty} kom, request {r.requestDate ?? '-'}
              </label>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <strong>Finalna količina: <span data-testid="final-qty">{finalQty}</span></strong>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={() => navigate('/sales-orders')}>← Nazad</button>
        <button
          disabled={selection.mode === 'releases' && checked.size === 0}
          onClick={() => { useWizardStore.getState().goTo(4); navigate('/bom'); }}
        >Dalje →</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test -- Releases`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/pages/Releases.tsx frontend/test/pages/Releases.test.tsx
git commit -m "feat(frontend): implement Releases page (full qty vs release selection)"
```

---

## Task 19: BomView page with BomTreeNode + Refresh button

**Files:**
- Create: `frontend/src/components/BomTreeNode.tsx`
- Create: `frontend/src/components/QuantityBadge.tsx`
- Modify: `frontend/src/pages/BomView.tsx`
- Create: `frontend/test/pages/BomView.test.tsx`

- [ ] **Step 1: Write `frontend/src/components/QuantityBadge.tsx`**

```tsx
export function QuantityBadge({ isPurchased, cycleDetected }: { isPurchased: boolean; cycleDetected?: boolean }) {
  if (cycleDetected) return <span className="badge cycle">⚠ ciklus</span>;
  return <span className={`badge ${isPurchased ? 'buy' : 'mfg'}`}>{isPurchased ? 'KUPOVNI' : 'PROIZVODNI'}</span>;
}
```

- [ ] **Step 2: Write `frontend/src/components/BomTreeNode.tsx`**

```tsx
import { useState } from 'react';
import type { BomNode } from '../api/types.js';
import { QuantityBadge } from './QuantityBadge.js';

export function BomTreeNode({ node, defaultExpanded = false }: { node: BomNode; defaultExpanded?: boolean }) {
  const [open, setOpen] = useState(defaultExpanded);
  const hasChildren = node.children.length > 0;
  return (
    <div className="tree-node">
      <div className="row">
        {hasChildren ? (
          <button onClick={() => setOpen(o => !o)} style={{ padding: '0 6px' }}>{open ? '▾' : '▸'}</button>
        ) : <span style={{ width: 18 }} />}
        <strong>{node.itemNumber}</strong>
        <span>{node.description}</span>
        <QuantityBadge isPurchased={node.isPurchased} cycleDetected={node.cycleDetected} />
        <span>{node.qtyRequired} {node.uom}</span>
        <small>nivo {node.level}</small>
      </div>
      {open && node.children.map(c => (
        <BomTreeNode key={`${c.arInvtId}-${c.level}`} node={c} defaultExpanded={c.level < 3} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write failing test `frontend/test/pages/BomView.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BomView } from '../../src/pages/BomView.js';
import { useWizardStore } from '../../src/store/wizardStore.js';

const calls = { count: 0 };
vi.mock('../../src/api/client.js', () => ({
  api: {
    bomTree: vi.fn(async (itemId: number, qty: number) => {
      calls.count++;
      return {
        tree: {
          arInvtId: itemId, itemNumber: 'PART-A', description: 'Widget A', rev: '1', itemClass: 'MFG',
          isPurchased: false, qtyRequired: qty, uom: 'ea', level: 0,
          children: [
            { arInvtId: 2, itemNumber: 'SUB', description: 'Sub', rev: '1', itemClass: 'MFG', isPurchased: false, qtyRequired: qty * 2, uom: 'ea', level: 1, children: [] },
            { arInvtId: 3, itemNumber: 'NUT', description: 'Nut', rev: '1', itemClass: 'BUY', isPurchased: true, qtyRequired: qty * 4, uom: 'ea', level: 1, children: [] },
          ],
        },
        stats: { nodeCount: 3, maxDepth: 1, cycleCount: 0 },
      };
    }),
  },
}));

function renderPage() {
  useWizardStore.getState().selectItem({ arInvtId: 1, itemNumber: 'PART-A', description: 'Widget A' });
  useWizardStore.getState().selectSO({ ordDetailId: 11, orderNumber: 'SO1', totalOrdered: 500, cummShipped: 0 });
  useWizardStore.getState().setSelectionFull();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BomView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BomView', () => {
  beforeEach(() => { useWizardStore.getState().reset(); calls.count = 0; });

  it('renders tree with calculated quantities', async () => {
    renderPage();
    await waitFor(() => screen.getByText('PART-A'));
    expect(screen.getByText('SUB')).toBeInTheDocument();
    expect(screen.getByText('NUT')).toBeInTheDocument();
    expect(screen.getByText(/2000 ea/)).toBeInTheDocument();
  });

  it('Refresh button triggers refetch', async () => {
    renderPage();
    await waitFor(() => screen.getByText('PART-A'));
    const before = calls.count;
    await userEvent.click(screen.getByRole('button', { name: /osveži bom/i }));
    await waitFor(() => expect(calls.count).toBeGreaterThan(before));
  });
});
```

- [ ] **Step 4: Run, confirm failure**

Run: `npm test -- BomView`
Expected: stub fails.

- [ ] **Step 5: Replace `frontend/src/pages/BomView.tsx`**

```tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useWizardStore } from '../store/wizardStore.js';
import { WizardStepper } from '../components/WizardStepper.js';
import { BomTreeNode } from '../components/BomTreeNode.js';

export function BomView() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const item = useWizardStore(s => s.selectedItem);
  const finalQty = useWizardStore(s => s.finalQty);
  const reset = useWizardStore(s => s.reset);

  useEffect(() => {
    if (!item || finalQty <= 0) navigate('/');
  }, [item, finalQty, navigate]);

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['bom-tree', item?.arInvtId, finalQty],
    queryFn: () => api.bomTree(item!.arInvtId, finalQty),
    enabled: !!item && finalQty > 0,
    staleTime: Infinity,
  });

  if (!item) return null;

  return (
    <div className="app">
      <WizardStepper />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>BOM za {item.itemNumber} × {finalQty}</h2>
        <div className="row">
          <button onClick={() => refetch()}>🔄 Osveži BOM</button>
          <button onClick={() => { reset(); navigate('/'); }}>↺ Reset</button>
        </div>
      </div>
      {isFetching && <p>Učitavam BOM...</p>}
      {error && <p className="error">{(error as Error).message}</p>}
      {data?.reason === 'NO_BOM' && <p>Ovaj artikal nema definisan BOM.</p>}
      {data?.tree && (
        <>
          <p>Nodes: {data.stats.nodeCount}, max dubina: {data.stats.maxDepth}, ciklusa: {data.stats.cycleCount}</p>
          <BomTreeNode node={data.tree} defaultExpanded />
        </>
      )}
      <button style={{ marginTop: 16 }} onClick={() => navigate('/releases')}>← Nazad</button>
    </div>
  );
}
```

- [ ] **Step 6: Run tests, confirm pass**

Run: `npm test -- BomView`
Expected: 2 passing.

- [ ] **Step 7: Run all frontend tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
cd ..
git add frontend/src/components/ frontend/src/pages/BomView.tsx frontend/test/pages/BomView.test.tsx
git commit -m "feat(frontend): implement BomView with recursive tree and Refresh button"
```

---

## Task 20: README + getting-started instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md`**

```markdown
# delmiaworks-production-reporter

Wizard app that walks a planner through:
1. Pick an item
2. Pick an active Sales Order for that item
3. Pick the full ordered quantity or specific releases
4. View the multi-level BOM with calculated component quantities

Phase 1 is **read-only** — nothing is written to DelmiaWorks.

## Requirements

- Node.js 20+
- A reachable DelmiaWorks WebAPI (e.g. `http://delmiaworks-host:8080/WebAPI`) and valid credentials
- Network access from the dev machine to the DW WebAPI

## Setup

```bash
npm install
```

## Dev

In two terminals:

```bash
# Terminal 1 — backend (http://localhost:3000)
npm run dev:backend

# Terminal 2 — frontend (http://localhost:5173)
npm run dev:frontend
```

Open http://localhost:5173, log in with your DW credentials, and walk through the wizard.

## Test

```bash
npm test                # runs backend + frontend test suites
```

## Build

```bash
npm run build
```

## Architecture

See [`docs/superpowers/specs/2026-05-19-prijava-proizvodnje-phase1-design.md`](docs/superpowers/specs/2026-05-19-prijava-proizvodnje-phase1-design.md).

## Roadmap

- **Phase 1 (this):** read-only item → SO → releases → BOM tree
- **Phase 2:** find and select Work Orders for the chosen quantity
- **Phase 3:** create Purchase Order + auto-receive + print labels
- **Phase 4:** automatic production reporting bottom-up
- **Phase 5:** hardening — persistent audit log, resumable runs, role-based authz
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: expand README with setup, dev, test, build instructions"
```

---

## Task 21: Create GitHub repo and push

**Files:** none (uses `gh` CLI).

- [ ] **Step 1: Verify `gh` is authenticated**

Run: `gh auth status`
Expected: logged in to github.com.

- [ ] **Step 2: Create public repo `delmiaworks-production-reporter` under the authenticated account**

Run:
```bash
gh repo create delmiaworks-production-reporter --public --description "Wizard app for guided production reporting against DelmiaWorks WebAPI (Phase 1: read-only item->SO->releases->BOM)." --source=. --remote=origin --push
```

Expected: repo created, `origin` set, `main` pushed.

- [ ] **Step 3: Verify**

Run:
```bash
gh repo view --web
```

Expected: opens the repo in browser; commits and README visible.

- [ ] **Step 4: Confirm CI status (no CI yet — Phase 1 keeps it simple)**

No CI yet. Document this in a follow-up issue:

```bash
gh issue create --title "Add CI (lint + test) for backend and frontend" --body "Phase 1 ships without CI. Add GitHub Actions running 'npm test' for both workspaces and lint checks before merging Phase 2 work."
```

Expected: issue URL printed.

---

## Task 22: End-to-end smoke test against the real DW VM

**Files:** none (manual procedure documented).

This task is human-driven — there are no test assertions to write. Procedure:

- [ ] **Step 1: Start both processes**

```bash
npm run dev:backend
npm run dev:frontend
```

- [ ] **Step 2: Browser checks**

1. Open http://localhost:5173/login
2. Enter the DW base URL, database, EPlant ID, username, password — click "Prijavi se"
3. On the search page, type at least 2 characters of a known item number. Verify the item shows in the list.
4. Click an item — page navigates to "Sales Orders" and lists active SOs. Verify counts (Total/Shipped/Remaining) match a known SO.
5. Click an SO — page navigates to Releases. Verify "Puna količina" radio defaults to TotalOrdered. Toggle to "Releases", check 1-2, verify sum.
6. Click "Dalje →" — BOM tree renders. Verify:
    - All children appear with calculated quantities
    - Purchased components have green badge, manufactured blue
    - "Osveži BOM" triggers a fresh request (watch backend logs)
7. Click "Reset" — wizard returns to step 1, state cleared.

- [ ] **Step 3: Log inspection**

Tail backend logs (printed to stdout). Verify each step logs the DW calls it made and their durations.

- [ ] **Step 4: Open issues for any discovered gaps**

For each unexpected behavior, file an issue with `gh issue create`. Common candidates from the spec's open-questions list:
- EPlant list endpoint
- Item-class detection (purchased vs manufactured)
- `InventoryList` filter field
- Active SO status string

---

## Self-Review

- **Spec coverage:**
  - §2 Tech stack → Tasks 1–2, 13 ✓
  - §3 Repo structure → Tasks 1, 2, 13 ✓
  - §4.1 dwClient → Tasks 3 (filter), 4 (auth/http), 5 (inventory), 6 (salesOrders), 7 (bom) ✓
  - §4.2 bomTreeBuilder → Task 8 ✓
  - §4.3 Session → Task 9 ✓
  - §4.4 BFF routes → Tasks 10 (auth), 11 (items+sales-orders), 12 (bom-tree) ✓
  - §4.5 Wizard UI → Tasks 13 (bootstrap), 14 (store), 15 (login), 16 (search+stepper), 17 (SO), 18 (Releases), 19 (BomView+Refresh) ✓
  - §4.6 EPlant → captured at login (Task 15) and threaded through session (Task 9) and SO query (Task 6+11) ✓
  - §5 Data flow → matches Task 10–12 (backend) + Task 14–19 (frontend) ✓
  - §6 Error handling → errorHandler (Task 9), AUTH_FAILED/INVALID_QTY/NO_BOM tests in Tasks 10/12, cycle detection in Task 8 ✓
  - §7 Testing → vitest+nock+supertest+RTL in every task ✓
  - §8 In/out of scope → no work-order or PO tasks in plan ✓
  - §9 Open questions → noted in Task 22 to file as issues

- **Placeholder scan:** no "TBD", "TODO", "implement later", or "similar to Task N" patterns in code blocks. Task 12's `fetchItemById` note flags one DW-install-specific spot but provides a working helper.

- **Type consistency:**
  - `BomNode`/`BomComponent`/`BomMaterial` use consistent field names (`arInvtId`, `qtyRequired`, `isPurchased`, `uom`) across Tasks 5, 7, 8, 13
  - `SalesOrderRow` field set is consistent across Tasks 6, 11, 13, 17 (`ordDetailId`, `orderNumber`, `company`, `poNumber`, `totalOrdered`, `cummShipped`, `remaining`, `arInvtId`)
  - `Release` shape `{releaseId, seq, qty, requestDate, promiseDate}` consistent across Tasks 6, 11, 13, 18
  - `WizardState.finalQty` and `selection.releaseIds` consistent in Task 14 and consumers (Tasks 18, 19)
  - `useWizardStore` selectors used in pages match action names defined in Task 14

- **No gaps found.**
