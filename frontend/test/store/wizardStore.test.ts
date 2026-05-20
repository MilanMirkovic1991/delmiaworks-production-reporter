import { describe, it, expect, beforeEach } from 'vitest';
import { useWizardStore } from '../../src/store/wizardStore.js';

describe('wizardStore', () => {
  beforeEach(() => useWizardStore.getState().reset());

  it('starts at step 1 with empty state', () => {
    const s = useWizardStore.getState();
    expect(s.step).toBe(1);
    expect(s.selectedItem).toBeUndefined();
    expect(s.selectedSO).toBeUndefined();
    expect(s.selection.mode).toBe('full');
    expect(s.selection.releaseIds).toEqual([]);
    expect(s.finalQty).toBe(0);
  });

  it('selectItem advances to step 2', () => {
    useWizardStore.getState().selectItem({ arInvtId: 1, itemNumber: 'P', description: 'd' });
    expect(useWizardStore.getState().step).toBe(2);
    expect(useWizardStore.getState().selectedItem?.arInvtId).toBe(1);
  });

  it('selectSO advances to step 3', () => {
    useWizardStore.getState().selectItem({ arInvtId: 1, itemNumber: 'P', description: 'd' });
    useWizardStore.getState().selectSO({ ordDetailId: 11, orderNumber: 'SO1', totalOrdered: 500, cummShipped: 0 });
    expect(useWizardStore.getState().step).toBe(3);
    expect(useWizardStore.getState().selectedSO?.ordDetailId).toBe(11);
  });

  it('setSelectionFull computes finalQty = totalOrdered', () => {
    useWizardStore.getState().selectItem({ arInvtId: 1, itemNumber: 'P', description: 'd' });
    useWizardStore.getState().selectSO({ ordDetailId: 11, orderNumber: 'SO1', totalOrdered: 500, cummShipped: 100 });
    useWizardStore.getState().setSelectionFull();
    expect(useWizardStore.getState().finalQty).toBe(500);
  });

  it('setSelectionReleases sums checked release qtys', () => {
    useWizardStore.getState().selectItem({ arInvtId: 1, itemNumber: 'P', description: 'd' });
    useWizardStore.getState().selectSO({ ordDetailId: 11, orderNumber: 'SO1', totalOrdered: 500, cummShipped: 0 });
    useWizardStore.getState().setSelectionReleases({
      releaseIds: [901, 902],
      releases: [
        { releaseId: 901, seq: 1, qty: 200, requestDate: null, promiseDate: null },
        { releaseId: 902, seq: 2, qty: 150, requestDate: null, promiseDate: null },
        { releaseId: 903, seq: 3, qty: 50, requestDate: null, promiseDate: null },
      ],
    });
    expect(useWizardStore.getState().finalQty).toBe(350);
  });

  it('reset returns to step 1 and clears state', () => {
    useWizardStore.getState().selectItem({ arInvtId: 1, itemNumber: 'P', description: 'd' });
    useWizardStore.getState().reset();
    expect(useWizardStore.getState().step).toBe(1);
    expect(useWizardStore.getState().selectedItem).toBeUndefined();
  });
});
