import { ClickTargetTaskBase } from './base/ClickTargetTaskBase.js';
import type { TaskComponentProps } from '../TaskOverlay.js';

export function NavegarAsteroideTask({ onComplete, onCancel }: TaskComponentProps) {
  return (
    <ClickTargetTaskBase
      title="Navegar Campo de Asteroides"
      subtitle="Destrua os asteroides azuis — evite os vermelhos!"
      targetCount={8}
      viewportW={520}
      viewportH={340}
      targetSpeed={2.5}
      targetSize={24}
      hasDecoys
      decoyPenalty={1}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}
