import { AxiosInstance } from 'axios';
import { pickArray } from './shared.js';
import { logger } from '../logger.js';

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
      if (rows.length > 0) {
        const first = rows[0]!;
        logger.info({
          endpoint: 'WorkOrdersForPart',
          keys: Object.keys(first),
          sample: {
            Id: first.Id,
            MfgNumber: first.MfgNumber, MfgNo: first.MfgNo, WoNumber: first.WoNumber, WONumber: first.WONumber, Number: first.Number, WorkOrderNo: first.WorkOrderNo,
            MfgDescrip: first.MfgDescrip, Descrip: first.Descrip, Description: first.Description,
            EplantID: first.EplantID, EplantId: first.EplantId,
            Status: first.Status, Stage: first.Stage,
            PriorityLevel: first.PriorityLevel,
            StartDate: first.StartDate,
          },
        }, 'DW response sample (WorkOrdersForPart)');
      }
      return rows
        .filter(r => {
          const wantEplant = String(input.eplantId);
          const gotEplant = String(r.EplantID ?? r.EplantId ?? '');
          return gotEplant === wantEplant;
        })
        .map(r => ({
          workOrderId: Number(r.Id ?? 0),
          mfgNumber: String(r.MfgNumber ?? r.MfgNo ?? r.WoNumber ?? r.WONumber ?? r.Number ?? r.WorkOrderNo ?? ''),
          mfgDescrip: String(r.MfgDescrip ?? r.Descrip ?? r.Description ?? ''),
          arInvtId: Number(r.ArInvtId ?? r.StandardID ?? input.arInvtId),
          eplantId: Number(r.EplantID ?? r.EplantId ?? input.eplantId),
          priorityLevel: r.PriorityLevel != null ? Number(r.PriorityLevel) : null,
          startDate: r.StartDate ? String(r.StartDate) : null,
          status: String(r.Status ?? r.Stage ?? ''),
        }));
    },
  };
}
