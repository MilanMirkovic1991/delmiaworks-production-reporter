import { Router } from 'express';
import { SessionStore } from '../session.js';
import { makeRequireSession } from '../middleware/requireSession.js';

export function makeWorkOrdersRouter(store: SessionStore) {
  const router = Router();
  router.use(makeRequireSession(store));

  router.get('/', async (req, res, next) => {
    try {
      const arInvtId = Number(req.query.arInvtId);
      if (!Number.isFinite(arInvtId)) {
        res.status(400).json({ error: 'INVALID_ARINVTID' });
        return;
      }
      const workOrders = await req.dw!.workOrders.findForPart({
        arInvtId, eplantId: req.session!.eplantId,
      });
      res.json({ workOrders });
    } catch (e) { next(e); }
  });

  return router;
}
