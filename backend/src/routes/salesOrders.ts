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
