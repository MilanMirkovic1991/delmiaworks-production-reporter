import { Router } from 'express';
import { SessionStore } from '../session.js';
import { makeRequireSession } from '../middleware/requireSession.js';

export function makeSalesOrdersRouter(store: SessionStore) {
  const router = Router();
  router.use(makeRequireSession(store));

  // GET / — list active SOs (aggregated, one row per SO header)
  router.get('/', async (req, res, next) => {
    try {
      const salesOrders = await req.dw!.salesOrders.listActive({
        eplantId: req.session!.eplantId,
      });
      res.json({ salesOrders });
    } catch (e) { next(e); }
  });

  // GET /:salesOrderId/line-items — per-line rows for a given SO header
  router.get('/:salesOrderId/line-items', async (req, res, next) => {
    try {
      const salesOrderId = Number(req.params.salesOrderId);
      const lineItems = await req.dw!.salesOrders.getLineItems({ salesOrderId });
      res.json({ lineItems });
    } catch (e) { next(e); }
  });

  // GET /:ordDetailId/releases — releases for a specific SO detail line
  router.get('/:ordDetailId/releases', async (req, res, next) => {
    try {
      const ordDetailId = Number(req.params.ordDetailId);
      const releases = await req.dw!.salesOrders.getReleases({ ordDetailId });
      res.json({ releases });
    } catch (e) { next(e); }
  });

  return router;
}
