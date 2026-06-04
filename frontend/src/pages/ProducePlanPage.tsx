import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWizardStore } from '../store/wizardStore.js';
import { WizardStepper } from '../components/WizardStepper.js';
import type { ProducePart } from '../utils/aggregateDemand.js';

export function ProducePlanPage() {
  const navigate = useNavigate();
  const producePlan = useWizardStore(s => s.producePlan);
  const activatePart = useWizardStore(s => s.activatePart);

  // No plan -> back to start. Exactly one part -> skip the list, open its tree directly.
  useEffect(() => {
    if (producePlan.length === 0) { navigate('/'); return; }
    if (producePlan.length === 1) { activatePart(producePlan[0]!); navigate('/work-orders'); }
  }, [producePlan, activatePart, navigate]);

  if (producePlan.length <= 1) return null;

  function open(part: ProducePart) {
    activatePart(part);
    navigate('/work-orders');
  }

  return (
    <div className="app">
      <WizardStepper />
      <h2>Artikli za proizvodnju ({producePlan.length})</h2>
      <p style={{ color: 'var(--muted)', marginTop: -4 }}>
        Otvori svaki artikal i prijavi njegovu proizvodnju (stablo radnih naloga + kaskada).
      </p>
      <table style={{ width: '100%' }}>
        <thead>
          <tr><th align="left">Artikal</th><th align="left">Opis</th><th align="right">Količina</th><th></th></tr>
        </thead>
        <tbody>
          {producePlan.map(p => (
            <tr key={p.arInvtId} style={{ borderTop: '1px solid var(--border)' }}>
              <td><strong>{p.itemNumber}</strong></td>
              <td>{p.description}</td>
              <td align="right"><strong>{p.qty}</strong></td>
              <td align="right">
                <button className="primary small" onClick={() => open(p)}>Otvori stablo →</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={() => navigate('/aggregate')}>← Nazad</button>
      </div>
    </div>
  );
}
