import type { CascadeResult } from '../api/client.js';

/**
 * Side panel that lists every work order whose production report did NOT pass,
 * so the user can quickly see where data is missing in DelmiaWorks. Shows the
 * item number, the WO number (to locate it), and DW's exact reason.
 *
 * `results` is the last cascade's result array, or null/undefined before any run.
 */
export function FailuresPanel({ results }: { results?: CascadeResult[] | null }) {
  if (results == null) {
    return (
      <section className="wo-failures-section">
        <h3>Neuspešne prijave</h3>
        <div className="card" style={{ color: 'var(--muted)' }}>
          Pokreni „▶ Prijavi proizvodnju" pa će se ovde izlistati sve za šta prijava nije prošla.
        </div>
      </section>
    );
  }

  const failures = results.filter(r => !r.success);

  return (
    <section className="wo-failures-section">
      <h3>Neuspešne prijave ({failures.length})</h3>
      {failures.length === 0 ? (
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
    </section>
  );
}
