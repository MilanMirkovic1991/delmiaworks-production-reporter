import { Router } from 'express';
import { createDwClient } from '../dwClient/index.js';
import { SessionStore } from '../session.js';

export function makeAuthRouter(store: SessionStore) {
  const router = Router();

  router.post('/login', async (req, res, next) => {
    try {
      const { baseUrl, username, password, database, eplantId } = req.body ?? {};
      if (!baseUrl || !username || !password || !database) {
        res.status(400).json({ error: 'MISSING_FIELDS' });
        return;
      }
      const dw = createDwClient({ baseUrl });
      const login = await dw.auth.login({ username, password, database });
      const sessionId = store.create({
        username: login.username,
        baseUrl, database,
        eplantId: Number(eplantId ?? 0),  // 0 = not yet selected
        authToken: login.authToken,
      });
      res.cookie('sessionId', sessionId, {
        httpOnly: true, sameSite: 'lax', secure: false, maxAge: 8 * 60 * 60 * 1000,
      });
      res.json({ username: login.username, eplantId: Number(eplantId ?? 0) });
    } catch (e) { next(e); }
  });

  router.post('/select-eplant', (req, res) => {
    const id = req.cookies?.sessionId as string | undefined;
    const s = id ? store.get(id) : null;
    if (!id || !s) { res.status(401).json({ error: 'NOT_AUTHENTICATED' }); return; }
    const eplantId = Number(req.body?.eplantId);
    if (!Number.isFinite(eplantId) || eplantId <= 0) {
      res.status(400).json({ error: 'INVALID_EPLANT' });
      return;
    }
    store.destroy(id);
    const newId = store.create({ ...s, eplantId });
    res.cookie('sessionId', newId, {
      httpOnly: true, sameSite: 'lax', secure: false, maxAge: 8 * 60 * 60 * 1000,
    });
    res.json({ ok: true, eplantId });
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
