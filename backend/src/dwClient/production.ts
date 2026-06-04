import { AxiosInstance } from 'axios';

/** Standard (planned) data for a work order, from WorkOrderEx. */
export type WorkOrderStandard = {
  workOrderId: number;
  standardId: number;
  /** Standard production hours for this WO (derived from STANDARD.CYCLETM_DISP). */
  productionHours: number;
  cyclesRequired: number;
  batchSize: number;
  mfgNumber: string;
};

/** A work order as seen by the production-reporting screen (quantities + status). */
export type ReportableWorkOrder = {
  workOrderId: number;
  quantity: number;
  remainingQuantity: number;
  quantityReported: number;
  completed: boolean;
  itemNumber: string;
  mfgNumber: string;
};

function unwrap(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const inner = (d.data ?? d) as unknown;
  if (!inner || typeof inner !== 'object') return null;
  return inner as Record<string, unknown>;
}

export function makeProductionApi(http: AxiosInstance) {
  return {
    /** GET the standard production hours (and standard id) for a work order. */
    async getWorkOrderEx(workOrderId: number): Promise<WorkOrderStandard | null> {
      const res = await http.get(`/Manufacturing/WorkOrders/WorkOrderEx/${workOrderId}`);
      const o = unwrap(res.data);
      if (!o) return null;
      return {
        workOrderId: Number(o.Id ?? workOrderId),
        standardId: Number(o.StandardID ?? o.StandardId ?? 0),
        productionHours: Number(o.ProductionHours ?? 0),
        cyclesRequired: Number(o.CyclesRequired ?? 0),
        batchSize: Number(o.BatchSize ?? 0),
        mfgNumber: String(o.MfgNumber ?? ''),
      };
    },

    /** GET the reportable quantities/status for a work order under an eplant. */
    async getReportWorkOrder(input: { eplantId: number; workOrderId: number }): Promise<ReportableWorkOrder | null> {
      const res = await http.get(
        `/Manufacturing/ReportProductionByWorkOrder/WorkOrder/${input.eplantId}`,
        { params: { workOrderId: input.workOrderId } },
      );
      const o = unwrap(res.data);
      if (!o) return null;
      return {
        workOrderId: Number(o.Id ?? input.workOrderId),
        quantity: Number(o.Quantity ?? 0),
        remainingQuantity: Number(o.RemainingQuantity ?? 0),
        quantityReported: Number(o.QuantityReported ?? 0),
        completed: Boolean(o.Completed),
        itemNumber: String(o.ItemNumber ?? ''),
        mfgNumber: String(o.MfgNumber ?? ''),
      };
    },

    /**
     * POST a production report (good parts) for a work order. Mirrors DW's
     * "Report Production By Work Order" screen. Quantity is reported as-is;
     * productionHours is the (already jittered) time. lotNo is optional — DW
     * assigns a finished-good lot when it is empty.
     */
    async reportGoodParts(input: {
      eplantId: number;
      workOrderId: number;
      goodPartsQty: number;
      productionHours: number;
      lotNo?: string;
    }): Promise<{ ok: true; raw: unknown }> {
      const res = await http.post(
        `/Manufacturing/ReportProductionByWorkOrder/GoodPartsQuantityDisposition/${input.eplantId}`,
        null,
        {
          params: {
            workOrderId: input.workOrderId,
            goodPartsQty: input.goodPartsQty,
            productionHours: input.productionHours,
            lotNo: input.lotNo ?? '',
          },
        },
      );
      return { ok: true, raw: res.data };
    },
  };
}
