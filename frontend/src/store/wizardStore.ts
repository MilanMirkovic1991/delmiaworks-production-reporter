import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Release } from '../api/types.js';

type SelectedSO = {
  salesOrderId: number; orderNumber: string; company: string; customerNumber: string;
};
type SelectedLineItem = {
  ordDetailId: number; arInvtId: number; itemNumber: string;
  description: string; totalOrdered: number; cummShipped: number; remaining: number;
};
type Selection = { mode: 'full' | 'releases'; releaseIds: number[] };

type WizardState = {
  step: 1 | 2 | 3 | 4;
  selectedSO?: SelectedSO;
  selectedLineItem?: SelectedLineItem;
  selection: Selection;
  finalQty: number;
  goTo: (s: 1 | 2 | 3 | 4) => void;
  selectSO: (so: SelectedSO) => void;
  selectLineItem: (item: SelectedLineItem) => void;
  setSelectionFull: () => void;
  setSelectionReleases: (input: { releaseIds: number[]; releases: Release[] }) => void;
  reset: () => void;
};

const initial = { step: 1 as const, selection: { mode: 'full' as const, releaseIds: [] }, finalQty: 0 };

export const useWizardStore = create<WizardState>()(
  persist(
    (set, get) => ({
      ...initial,
      goTo: (step) => set({ step }),
      selectSO: (so) => set({
        selectedSO: so, step: 2,
        selectedLineItem: undefined, selection: { mode: 'full', releaseIds: [] }, finalQty: 0,
      }),
      selectLineItem: (item) => set({
        selectedLineItem: item, step: 3,
        selection: { mode: 'full', releaseIds: [] }, finalQty: item.totalOrdered,
      }),
      setSelectionFull: () => {
        const lineItem = get().selectedLineItem;
        set({ selection: { mode: 'full', releaseIds: [] }, finalQty: lineItem?.totalOrdered ?? 0 });
      },
      setSelectionReleases: ({ releaseIds, releases }) => {
        const sum = releases.filter(r => releaseIds.includes(r.releaseId)).reduce((acc, r) => acc + r.qty, 0);
        set({ selection: { mode: 'releases', releaseIds }, finalQty: sum });
      },
      reset: () => set({ ...initial, selectedSO: undefined, selectedLineItem: undefined }),
    }),
    { name: 'dw-reporter-wizard' },
  ),
);
