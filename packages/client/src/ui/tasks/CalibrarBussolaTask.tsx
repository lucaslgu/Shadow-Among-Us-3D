import { TimingTaskBase } from './base/TimingTaskBase.js';
import type { TaskComponentProps } from '../TaskOverlay.js';

export function CalibrarBussolaTask({ onComplete, onCancel }: TaskComponentProps) {
  return (
    <TimingTaskBase
      title="Calibrar Bússola"
      subtitle="Clique quando a agulha estiver na zona verde — 3 acertos seguidos"
      speed={180}
      zoneSize={30}
      requiredHits={3}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}
