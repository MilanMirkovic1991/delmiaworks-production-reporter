import { Router } from 'express';
import { SessionStore } from '../session.js';
import { makeRequireSession } from '../middleware/requireSession.js';

export function makeEPlantsRouter(store: SessionStore) {
  const router = Router();
  router.use(makeRequireSession(store));

  router.get('/', async (req, res, next) => {
    try {
      const eplants = await req.dw!.eplants.list();
      res.json({ eplants });
    } catch (e) { next(e); }
  });

  return router;
}
