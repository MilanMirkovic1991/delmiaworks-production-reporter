import { useState } from 'react';
import type { CascadeResult } from '../api/client.js';

/**
 * On-demand side panel that lists every work order whose production report did
 * NOT pass, so the user can quickly see where data is missing in DelmiaWorks.
 * Collapsed by default — the user clicks the header to reveal the list. Shows the
 * item number, the WO number (to locate it), and DW's exact reason.
 *
 * `results` is the last cascade's result array, or null/undefined before any run.
 */
export function FailuresPanel({ results }: { results?: CascadeResult[] | null }) {
  const [open, setOpen] = useState(false);
  const hasRun = results != null;
  const failures = (results ?? []).filter(r => !r.success);
  const count = failures.length;

  return (
    <section className="wo-failures-section">
      <button
        type="button"
        className="failures-toggle"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className="failures-caret">{open ? '▾' : '▸'}</span>
        <span>Neuspešne prijave{hasRun ? ` (${count})` : ''}</span>
        {hasRun && count > 0 && <span className="failures-badge">{count}</span>}
      </button>

      {open && (
        <div className="failures-body">
          {!hasRun ? (
            <div className="card" style={{ color: 'var(--muted)' }}>
              Pokreni „▶ Prijavi proizvodnju" pa će se ovde izlistati sve za šta prijava nije prošla.
            </div>
          ) : count === 0 ? (
            <div className="card" style={{ background: '#dcfce7', border: '1px solid var(--buy)' }}>
              ✓ Sve prijave su prošle — ništa ne fali.
            </div>
          ) : (
            <div className="failures-list">
              {failures.map(f => (
                <div key={f.workOrderId} className="card failure-item">
                  <div className="failure-item-head">
                    <strong>{f.itemNumber || `arInvtId ${f.arInvtId}`}</strong>
                    <span className="wo-meta">WO {f.mfgNumber || `#${f.workOrderId}`}</span>
                  </div>
                  <div className="failure-reason">{f.error || 'nepoznata greška'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
