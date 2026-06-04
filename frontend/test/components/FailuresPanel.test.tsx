import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FailuresPanel } from '../../src/components/FailuresPanel.js';
import type { CascadeResult } from '../../src/api/client.js';

function ok(workOrderId: number, itemNumber: string): CascadeResult {
  return { workOrderId, mfgNumber: `WO-${workOrderId}`, itemNumber, arInvtId: workOrderId, goodPartsQty: 5, productionHours: 1, success: true };
}
function fail(workOrderId: number, itemNumber: string, error: string): CascadeResult {
  return { workOrderId, mfgNumber: `WO-${workOrderId}`, itemNumber, arInvtId: workOrderId, goodPartsQty: 0, productionHours: 0, success: false, error };
}

describe('FailuresPanel (on-demand)', () => {
  it('is collapsed by default — failures appear only after clicking the toggle', () => {
    render(<FailuresPanel results={[ok(1, 'PART-A'), fail(2, 'SUB', 'Insufficient inventory. Item No: 097327103'), fail(3, 'NUT', 'No recipe card found')]} />);
    // collapsed: the toggle shows the count, but the list is NOT rendered yet
    const toggle = screen.getByRole('button', { name: /Neuspešne prijave \(2\)/ });
    expect(toggle).toBeInTheDocument();
    expect(screen.queryByText('SUB')).toBeNull();

    // click to reveal
    fireEvent.click(toggle);
    expect(screen.getByText('SUB')).toBeInTheDocument();
    expect(screen.getByText(/097327103/)).toBeInTheDocument();
    expect(screen.getByText('NUT')).toBeInTheDocument();
    expect(screen.getByText(/No recipe card found/)).toBeInTheDocument();
    expect(screen.getByText(/WO-2/)).toBeInTheDocument();
    // the successful one is never listed
    expect(screen.queryByText('PART-A')).toBeNull();

    // click again to collapse
    fireEvent.click(toggle);
    expect(screen.queryByText('SUB')).toBeNull();
  });

  it('before any cascade run, the toggle opens to a hint', () => {
    render(<FailuresPanel results={null} />);
    const toggle = screen.getByRole('button', { name: /Neuspešne prijave/i });
    fireEvent.click(toggle);
    expect(screen.getByText(/Pokreni/i)).toBeInTheDocument();
  });

  it('when everything passed, the toggle shows (0) and opens to an all-clear', () => {
    render(<FailuresPanel results={[ok(1, 'PART-A'), ok(2, 'SUB')]} />);
    const toggle = screen.getByRole('button', { name: /Neuspešne prijave \(0\)/ });
    fireEvent.click(toggle);
    expect(screen.getByText(/sve.*pro[šs]l/i)).toBeInTheDocument();
  });
});
