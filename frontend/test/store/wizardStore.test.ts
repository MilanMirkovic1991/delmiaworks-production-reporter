import { describe, it, expect, beforeEach } from 'vitest';
import { useWizardStore } from '../../src/store/wizardStore.js';

describe('wizardStore', () => {
  beforeEach(() => useWizardStore.getState().reset());

  it('starts at step 1 with empty state', () => {
    const s = useWizardStore.getState();
    expect(s.step).toBe(1);
    expect(s.selectedSO).toBeUndefined();
    expect(s.selectedLineItem).toBeUndefined();
    expect(s.selection.mode).toBe('full');
    expect(s.selection.releaseIds).toEqual([]);
    expect(s.finalQty).toBe(0);
  });

  it('selectSO advances to step 2', () => {
    useWizardStore.getState().selectSO({
      salesOrderId: 42, orderNumber: 'SO1001', company: 'Acme', customerNumber: 'C001',
    });
    expect(useWizardStore.getState().step).toBe(2);
    expect(useWizardStore.getState().selectedSO?.salesOrderId).toBe(42);
    expect(useWizardStore.getState().selectedLineItem).toBeUndefined();
  });

  it('selectLineItem advances to step 3 and finalQty defaults to totalOrdered', () => {
    useWizardStore.getState().selectSO({
      salesOrderId: 42, orderNumber: 'SO1001', company: 'Acme', customerNumber: 'C001',
    });
    useWizardStore.getState().selectLineItem({
      ordDetailId: 11, arInvtId: 1, itemNumber: 'PART-A', description: 'Widget',
      totalOrdered: 500, cummShipped: 100, remaining: 400,
    });
    expect(useWizardStore.getState().step).toBe(3);
    expect(useWizardStore.getState().selectedLineItem?.ordDetailId).toBe(11);
    expect(useWizardStore.getState().finalQty).toBe(500);
  });

  it('setSelectionReleases sums qtys', () => {
    useWizardStore.getState().selectSO({
      salesOrderId: 42, orderNumber: 'SO1001', company: 'Acme', customerNumber: 'C001',
    });
    useWizardStore.getState().selectLineItem({
      ordDetailId: 11, arInvtId: 1, itemNumber: 'PART-A', description: 'Widget',
      totalOrdered: 500, cummShipped: 0, remaining: 500,
    });
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

  it('reset clears state', () => {
    useWizardStore.getState().selectSO({
      salesOrderId: 42, orderNumber: 'SO1001', company: 'Acme', customerNumber: 'C001',
    });
    useWizardStore.getState().reset();
    expect(useWizardStore.getState().step).toBe(1);
    expect(useWizardStore.getState().selectedSO).toBeUndefined();
    expect(useWizardStore.getState().selectedLineItem).toBeUndefined();
    expect(useWizardStore.getState().finalQty).toBe(0);
  });

  it('Puna količina = lineItem.totalOrdered', () => {
    useWizardStore.getState().selectSO({
      salesOrderId: 42, orderNumber: 'SO1001', company: 'Acme', customerNumber: 'C001',
    });
    useWizardStore.getState().selectLineItem({
      ordDetailId: 11, arInvtId: 1, itemNumber: 'PART-A', description: 'Widget',
      totalOrdered: 500, cummShipped: 100, remaining: 400,
    });
    useWizardStore.getState().setSelectionFull();
    expect(useWizardStore.getState().finalQty).toBe(500);
    expect(useWizardStore.getState().selection.mode).toBe('full');
  });
});
