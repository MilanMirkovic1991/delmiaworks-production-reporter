import { Router } from 'express';
import { SessionStore } from '../session.js';
import { makeRequireSession } from '../middleware/requireSession.js';
import { logger } from '../logger.js';

const DEFAULT_VENDOR_ID = 61465;

export function makePORouter(store: SessionStore) {
  const router = Router();
  router.use(makeRequireSession(store));

  router.post('/create', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const vendorId = Number(body.vendorId ?? DEFAULT_VENDOR_ID);
      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) {
        res.status(400).json({ error: 'NO_ITEMS' });
        return;
      }
      const cleanItems = items.map((it: unknown) => {
        const o = it as { arInvtId?: unknown; quantity?: unknown };
        return { arInvtId: Number(o?.arInvtId ?? 0), quantity: Number(o?.quantity ?? 0) };
      }).filter((it: { arInvtId: number; quantity: number }) =>
        Number.isFinite(it.arInvtId) && it.arInvtId > 0 && Number.isFinite(it.quantity) && it.quantity > 0);
      if (cleanItems.length === 0) {
        res.status(400).json({ error: 'NO_VALID_ITEMS' });
        return;
      }
      logger.info({ vendorId, itemCount: cleanItems.length }, 'Creating PO');
      const result = await req.dw!.po.createPurchaseOrder({
        vendorId,
        items: cleanItems,
        approverUsername: req.session!.username,
      });
      logger.info({
        poId: result.poId,
        approved: result.approved,
        successCount: result.lineItems.filter(l => l.success).length,
      }, 'PO created');
      res.json(result);
    } catch (e) { next(e); }
  });

  return router;
}
