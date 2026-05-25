import { useWizardStore } from '../store/wizardStore.js';

const labels = ['1. Sales Order', '2. Stavka', '3. Release', '4. Work Order'];

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
