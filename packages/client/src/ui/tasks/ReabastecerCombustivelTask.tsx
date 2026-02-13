import { FillGaugeTaskBase } from './base/FillGaugeTaskBase.js';
import type { TaskComponentProps } from '../TaskOverlay.js';

export function ReabastecerCombustivelTask({ onComplete, onCancel }: TaskComponentProps) {
  return (
    <FillGaugeTaskBase
      title="Refuel"
      subtitle="Fill both tanks in the green zones"
      gauges={[
        { targetMin: 0.40, targetMax: 0.60, fillRate: 0.28, label: 'Tank A' },
        { targetMin: 0.70, targetMax: 0.90, fillRate: 0.25, label: 'Tank B' },
      ]}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}
