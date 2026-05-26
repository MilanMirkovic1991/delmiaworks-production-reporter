import { AxiosInstance } from 'axios';
import { pickArray } from './shared.js';

export type EPlant = {
  id: number;
  plantName: string;
  companyName: string;
  inactive: boolean;
};

export function makeEPlantsApi(http: AxiosInstance) {
  return {
    async list(): Promise<EPlant[]> {
      const res = await http.get('/AssemblyData/FinalAssembly/GetEplants/0');
      return pickArray<Record<string, unknown>>(res.data)
        .map(r => ({
          id: Number(r.ID ?? r.Id ?? 0),
          plantName: String(r.PlantName ?? ''),
          companyName: String(r.CompanyName ?? ''),
          inactive: Boolean(r.Inactive),
        }))
        .filter(p => Number.isFinite(p.id) && p.id > 0)
        .filter(p => !p.inactive);
    },
  };
}
