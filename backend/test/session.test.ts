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
