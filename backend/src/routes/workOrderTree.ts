import { Router } from 'express';
import { SessionStore } from '../session.js';
import { makeRequireSession } from '../middleware/requireSession.js';
import { buildWorkOrderTreeWithStats } from '../services/workOrderTreeBuilder.js';
import { logger } from '../logger.js';
import { DwClient } from '../dwClient/index.js';
import { InventoryItem } from '../dwClient/inventory.js';

async function fetchItemById(dw: DwClient, itemId: number): Promise<InventoryItem | null> {
  const candidates = await dw.inventory.searchItems({ query: String(itemId) });
  return candidates.find(i => i.arInvtId === itemId) ?? null;
}

export function makeWorkOrderTreeRouter(store: SessionStore) {
  const router = Router();
  router.use(makeRequireSession(store));

  router.get('/', async (req, res, next) => {
    try {
      const itemId = Number(req.query.arInvtId);
      const qty = Number(req.query.qty);
      if (!Number.isFinite(itemId)) { res.status(400).json({ error: 'INVALID_ARINVTID' }); return; }
      if (!Number.isFinite(qty) || qty <= 0) { res.status(400).json({ error: 'INVALID_QTY' }); return; }
      const dw = req.dw!;
      const eplantId = req.session!.eplantId;
      const root = await fetchItemById(dw, itemId);
      if (!root) { res.status(404).json({ error: 'ITEM_NOT_FOUND' }); return; }

      const { tree, stats } = await buildWorkOrderTreeWithStats({
        rootArInvtId: root.arInvtId,
        rootItemNumber: root.itemNumber,
        rootDescription: root.description,
        rootRev: root.rev,
        rootItemClass: root.itemClass,
        qty,
        getComponents: ({ arInvtId, qty }) => dw.bom.getComponentsForQty({ arInvtId, qty }),
        getWorkOrders: ({ arInvtId }) => dw.workOrders.findForPart({ arInvtId, eplantId }),
      });
      logger.info({ stats, itemId, qty }, 'Work order tree built');
      if (!tree) { res.json({ tree: null, reason: 'NO_DATA', stats }); return; }
      res.json({ tree, stats });
    } catch (e) { next(e); }
  });

  return router;
}
