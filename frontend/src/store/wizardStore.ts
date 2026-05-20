import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Release } from '../api/types.js';

type SelectedItem = { arInvtId: number; itemNumber: string; description: string };
type SelectedSO = { ordDetailId: number; orderNumber: string; totalOrdered: number; cummShipped: number };
type Selection = { mode: 'full' | 'releases'; releaseIds: number[] };

type WizardState = {
  step: 1 | 2 | 3 | 4;
  selectedItem?: SelectedItem;
  selectedSO?: SelectedSO;
  selection: Selection;
  finalQty: number;
  goTo: (s: 1 | 2 | 3 | 4) => void;
  selectItem: (item: SelectedItem) => void;
  selectSO: (so: SelectedSO) => void;
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
      selectItem: (item) => set({ selectedItem: item, step: 2, selectedSO: undefined, finalQty: 0, selection: { mode: 'full', releaseIds: [] } }),
      selectSO: (so) => set({ selectedSO: so, step: 3, selection: { mode: 'full', releaseIds: [] }, finalQty: 0 }),
      setSelectionFull: () => {
        const so = get().selectedSO;
        set({ selection: { mode: 'full', releaseIds: [] }, finalQty: so?.totalOrdered ?? 0 });
      },
      setSelectionReleases: ({ releaseIds, releases }) => {
        const sum = releases.filter(r => releaseIds.includes(r.releaseId)).reduce((acc, r) => acc + r.qty, 0);
        set({ selection: { mode: 'releases', releaseIds }, finalQty: sum });
      },
      reset: () => set({ ...initial, selectedItem: undefined, selectedSO: undefined }),
    }),
    { name: 'dw-reporter-wizard' },
  ),
);
