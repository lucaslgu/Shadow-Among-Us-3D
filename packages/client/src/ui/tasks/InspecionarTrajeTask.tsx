import { ClickTargetTaskBase } from './base/ClickTargetTaskBase.js';
import type { TaskComponentProps } from '../TaskOverlay.js';

export function InspecionarTrajeTask({ onComplete, onCancel }: TaskComponentProps) {
  return (
    <ClickTargetTaskBase
      title="Inspecionar Traje"
      subtitle="Encontre e clique nos 3 pontos de dano"
      targetCount={3}
      viewportW={420}
      viewportH={320}
      stationaryTargets
      targetSize={22}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}
