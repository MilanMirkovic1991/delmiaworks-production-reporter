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
      const root = await dw.inventory.getById(itemId);
      if (!root) {
        res.status(404).json({ error: 'ITEM_NOT_FOUND' });
        return;
      }

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
      if (!tree) {
        res.json({ tree: null, reason: 'NO_BOM', stats });
        return;
      }
      res.json({ tree, stats });
    } catch (e) { next(e); }
  });

  return router;
}
