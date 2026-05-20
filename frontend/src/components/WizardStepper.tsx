import { useWizardStore } from '../store/wizardStore.js';

const labels = ['1. Artikal', '2. Sales Order', '3. Release', '4. BOM'];

export function WizardStepper() {
  const step = useWizardStore(s => s.step);
  return (
    <div className="stepper">
      {labels.map((label, i) => (
        <div key={i} className={`step${i + 1 === step ? ' active' : ''}`}>{label}</div>
      ))}
    </div>
  );
}
