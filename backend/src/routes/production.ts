import { Router } from 'express';
import { SessionStore } from '../session.js';
import { makeRequireSession } from '../middleware/requireSession.js';
import { buildWorkOrderTreeWithStats } from '../services/workOrderTreeBuilder.js';
import {
  flattenBottomUp, jitterHours, runCascade,
  type CascadeWorkOrder, type ReportOneResult,
} from '../services/productionCascade.js';
import { looksLikeAuthError } from '../dwClient/http.js';
import { logger } from '../logger.js';

/**
 * Cascade production reporting. A single click on a node reports production for
 * that node's whole subtree, bottom-up. Per work order: read the standard hours
 * (WorkOrderEx) and the full quantity (ReportProductionByWorkOrder/WorkOrder),
 * jitter the time ±15%, then POST GoodPartsQuantityDisposition. Sequential, with
 * per-WO results. `rng` is injectable for deterministic tests.
 */
export function makeProductionRouter(store: SessionStore, rng: () => number = Math.random) {
  const router = Router();
  router.use(makeRequireSession(store));

  router.post('/report-cascade', async (req, res, next) => {
    try {
      const arInvtId = Number(req.body?.arInvtId);
      const qty = Number(req.body?.qty);
      if (!Number.isFinite(arInvtId)) { res.status(400).json({ error: 'INVALID_ARINVTID' }); return; }
      if (!Number.isFinite(qty) || qty <= 0) { res.status(400).json({ error: 'INVALID_QTY' }); return; }

      const dw = req.dw!;
      const eplantId = req.session!.eplantId;

      const root = await dw.inventory.getById(arInvtId);
      if (!root) { res.status(404).json({ error: 'ITEM_NOT_FOUND' }); return; }

      const { tree } = await buildWorkOrderTreeWithStats({
        rootArInvtId: root.arInvtId,
        rootItemNumber: root.itemNumber,
        rootDescription: root.description,
        rootRev: root.rev,
        rootItemClass: root.itemClass,
        qty,
        getComponents: ({ arInvtId, qty }) => dw.bom.getComponentsForQty({ arInvtId, qty }),
        getWorkOrders: ({ arInvtId }) => dw.workOrders.findForPart({ arInvtId, eplantId }),
        getInventoryItem: (id) => dw.inventory.getById(id),
      });
      if (!tree) { res.json({ total: 0, results: [], succeeded: 0, failed: 0, stoppedOnAuth: false }); return; }

      const cascadeWOs = flattenBottomUp(tree);

      const reportOne = async (cwo: CascadeWorkOrder): Promise<ReportOneResult> => {
        const woId = cwo.workOrder.workOrderId;
        // Full WO quantity is reported as-is; only the time is jittered.
        const reportable = await dw.production.getReportWorkOrder({ eplantId, workOrderId: woId });
        const std = await dw.production.getWorkOrderEx(woId);
        const goodPartsQty = reportable?.quantity ?? 0;
        const productionHours = jitterHours(std?.productionHours ?? 0, rng);
        // The produced component's lot number IS the work-order number being reported.
        // (DW backflushes the BOM components on disposition; because we report bottom-up,
        // each child already exists under its own WO-number lot for the parent to consume.)
        const lotNo = cwo.workOrder.mfgNumber;
        await dw.production.reportGoodParts({ eplantId, workOrderId: woId, goodPartsQty, productionHours, lotNo });
        return {
          workOrderId: woId,
          mfgNumber: cwo.workOrder.mfgNumber,
          itemNumber: cwo.itemNumber,
          arInvtId: cwo.arInvtId,
          goodPartsQty,
          productionHours,
          success: true,
        };
      };

      const { results, stoppedOnAuth } = await runCascade(cascadeWOs, reportOne, looksLikeAuthError);
      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      logger.info({ arInvtId, total: cascadeWOs.length, succeeded, failed, stoppedOnAuth }, 'Production cascade complete');
      res.json({ total: cascadeWOs.length, results, succeeded, failed, stoppedOnAuth });
    } catch (e) { next(e); }
  });

  return router;
}
