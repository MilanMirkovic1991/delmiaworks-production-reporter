export function QuantityBadge({ isPurchased, cycleDetected }: { isPurchased: boolean; cycleDetected?: boolean }) {
  if (cycleDetected) return <span className="badge cycle">⚠ ciklus</span>;
  return <span className={`badge ${isPurchased ? 'buy' : 'mfg'}`}>{isPurchased ? 'KUPOVNI' : 'PROIZVODNI'}</span>;
}
