import { AxiosInstance } from 'axios';
import { pickArray } from './shared.js';

export type WorkOrderRow = {
  workOrderId: number;        // Id
  mfgNumber: string;          // WO number (humans read this)
  mfgDescrip: string;
  arInvtId: number;           // StandardID field, or fallback to input arInvtId
  eplantId: number;
  priorityLevel: number | null;
  startDate: string | null;
  status: string;
};

export function makeWorkOrdersApi(http: AxiosInstance) {
  return {
    async findForPart(input: { arInvtId: number; eplantId: number }): Promise<WorkOrderRow[]> {
      const res = await http.get('/Manufacturing/WorkOrders/WorkOrdersForPart/0', {
        params: { arInvtId: input.arInvtId },
      });
      const rows = pickArray<Record<string, unknown>>(res.data);
      return rows
        .filter(r => Number(r.EplantID) === input.eplantId)
        .map(r => ({
          workOrderId: Number(r.Id ?? 0),
          mfgNumber: String(r.MfgNumber ?? ''),
          mfgDescrip: String(r.MfgDescrip ?? ''),
          arInvtId: Number(r.ArInvtId ?? r.StandardID ?? input.arInvtId),
          eplantId: Number(r.EplantID ?? input.eplantId),
          priorityLevel: r.PriorityLevel != null ? Number(r.PriorityLevel) : null,
          startDate: r.StartDate ? String(r.StartDate) : null,
          status: String(r.Status ?? ''),
        }));
    },
  };
}
