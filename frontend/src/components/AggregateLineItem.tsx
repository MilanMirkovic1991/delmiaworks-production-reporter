import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import type { SalesOrderLineItem } from '../api/types.js';
import type { DemandUnit } from '../utils/aggregateDemand.js';

/**
 * One sales-order line item in the aggregation screen. Default contributes its
 * FULL ordered quantity; switching to "release-ovi" lets the user pick specific
 * releases. It reports its current demand (full qty, or the checked releases) up
 * via onChange so the parent can aggregate across all line items / sales orders.
 */
export function AggregateLineItem({ lineItem, onChange }: {
  lineItem: SalesOrderLineItem;
  onChange: (units: DemandUnit[]) => void;
}) {
  const [mode, setMode] = useState<'full' | 'releases'>('full');
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const releasesQ = useQuery({
    queryKey: ['releases', lineItem.ordDetailId],
    queryFn: () => api.releasesForSO(lineItem.ordDetailId),
    enabled: mode === 'releases',
    staleTime: 60_000,
  });

  const base = { arInvtId: lineItem.arInvtId, itemNumber: lineItem.itemNumber, description: lineItem.description };

  useEffect(() => {
    if (mode === 'full') {
      onChange([{ ...base, qty: lineItem.totalOrdered }]);
    } else {
      const rels = releasesQ.data?.releases ?? [];
      onChange(rels.filter(r => checked.has(r.releaseId)).map(r => ({ ...base, qty: r.qty })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, checked, releasesQ.data]);

  function toggle(id: number) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="agg-line">
      <div className="agg-line-head">
        <span><strong>{lineItem.itemNumber}</strong> <span style={{ color: 'var(--muted)' }}>{lineItem.description}</span></span>
        <span className="agg-line-modes">
          <label><input type="radio" name={`m-${lineItem.ordDetailId}`} checked={mode === 'full'} onChange={() => setMode('full')} /> Puna ({lineItem.totalOrdered})</label>
          <label><input type="radio" name={`m-${lineItem.ordDetailId}`} checked={mode === 'releases'} onChange={() => setMode('releases')} /> Release-ovi</label>
        </span>
      </div>
      {mode === 'releases' && (
        <div className="agg-releases">
          {releasesQ.isFetching && <span style={{ color: 'var(--muted)' }}>Učitavam release-ove...</span>}
          {!releasesQ.isFetching && (releasesQ.data?.releases ?? []).length === 0 && (
            <span style={{ color: 'var(--muted)' }}>Nema release-ova — koristi „Puna".</span>
          )}
          {(releasesQ.data?.releases ?? []).map(r => (
            <label key={r.releaseId} style={{ display: 'block', padding: '2px 0' }}>
              <input
                type="checkbox"
                checked={checked.has(r.releaseId)}
                onChange={() => toggle(r.releaseId)}
                aria-label={`Release ${r.releaseId} za ${lineItem.itemNumber}`}
              />
              {' '}Release #{r.releaseId} (seq {r.seq}) — {r.qty} kom{r.requestDate ? `, ${r.requestDate.slice(0, 10)}` : ''}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
