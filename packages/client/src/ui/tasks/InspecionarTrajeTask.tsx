import { ClickTargetTaskBase } from './base/ClickTargetTaskBase.js';
import type { TaskComponentProps } from '../TaskOverlay.js';

export function InspecionarTrajeTask({ onComplete, onCancel }: TaskComponentProps) {
  return (
    <ClickTargetTaskBase
      title="Inspect Suit"
      subtitle="Find and click the 3 damage points"
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
