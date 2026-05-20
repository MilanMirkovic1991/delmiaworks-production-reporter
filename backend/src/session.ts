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
