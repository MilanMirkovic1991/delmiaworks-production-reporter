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
