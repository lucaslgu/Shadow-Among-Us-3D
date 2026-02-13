import { FillGaugeTaskBase } from './base/FillGaugeTaskBase.js';
import type { TaskComponentProps } from '../TaskOverlay.js';

export function ReabastecerCombustivelTask({ onComplete, onCancel }: TaskComponentProps) {
  return (
    <FillGaugeTaskBase
      title="Reabastecer Combustível"
      subtitle="Encha os dois tanques nas zonas verdes"
      gauges={[
        { targetMin: 0.40, targetMax: 0.60, fillRate: 0.28, label: 'Tanque A' },
        { targetMin: 0.70, targetMax: 0.90, fillRate: 0.25, label: 'Tanque B' },
      ]}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}
