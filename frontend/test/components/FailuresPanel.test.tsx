import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FailuresPanel } from '../../src/components/FailuresPanel.js';
import type { CascadeResult } from '../../src/api/client.js';

function ok(workOrderId: number, itemNumber: string): CascadeResult {
  return { workOrderId, mfgNumber: `WO-${workOrderId}`, itemNumber, arInvtId: workOrderId, goodPartsQty: 5, productionHours: 1, success: true };
}
function fail(workOrderId: number, itemNumber: string, error: string): CascadeResult {
  return { workOrderId, mfgNumber: `WO-${workOrderId}`, itemNumber, arInvtId: workOrderId, goodPartsQty: 0, productionHours: 0, success: false, error };
}

describe('FailuresPanel', () => {
  it('before any cascade run, shows a hint to run reporting', () => {
    render(<FailuresPanel results={null} />);
    expect(screen.getByText(/Pokreni/i)).toBeInTheDocument();
    expect(screen.queryByText(/✓/)).toBeNull();
  });

  it('when everything passed, shows an all-clear message and count 0', () => {
    render(<FailuresPanel results={[ok(1, 'PART-A'), ok(2, 'SUB')]} />);
    expect(screen.getByText(/Neuspešne prijave \(0\)/)).toBeInTheDocument();
    expect(screen.getByText(/sve.*pro[šs]l/i)).toBeInTheDocument();
  });

  it('lists each failed work order with item number, WO number and the reason', () => {
    const results = [
      ok(1, 'PART-A'),
      fail(2, 'SUB', 'Insufficient inventory of consumed components. Item No: 097327103'),
      fail(3, 'NUT', 'No recipe card found'),
    ];
    render(<FailuresPanel results={results} />);
    expect(screen.getByText(/Neuspešne prijave \(2\)/)).toBeInTheDocument();
    // failed items appear with their reasons
    expect(screen.getByText('SUB')).toBeInTheDocument();
    expect(screen.getByText(/097327103/)).toBeInTheDocument();
    expect(screen.getByText('NUT')).toBeInTheDocument();
    expect(screen.getByText(/No recipe card found/)).toBeInTheDocument();
    // WO numbers shown to locate them
    expect(screen.getByText(/WO-2/)).toBeInTheDocument();
    // the successful one is NOT listed
    expect(screen.queryByText('PART-A')).toBeNull();
  });
});
