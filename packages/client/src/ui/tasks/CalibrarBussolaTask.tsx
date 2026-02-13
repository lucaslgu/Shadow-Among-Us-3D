import { TimingTaskBase } from './base/TimingTaskBase.js';
import type { TaskComponentProps } from '../TaskOverlay.js';

export function CalibrarBussolaTask({ onComplete, onCancel }: TaskComponentProps) {
  return (
    <TimingTaskBase
      title="Calibrate Compass"
      subtitle="Click when the needle is in the green zone — 3 hits in a row"
      speed={180}
      zoneSize={30}
      requiredHits={3}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}
