import { HoldTaskBase } from './base/HoldTaskBase.js';
import type { TaskComponentProps } from '../TaskOverlay.js';

export function AmostraSangueTask({ onComplete, onCancel }: TaskComponentProps) {
  return (
    <HoldTaskBase
      title="Coleta de Sangue"
      subtitle="Segure para coletar a amostra"
      holdDuration={2500}
      icon="&#128137;"
      completedIcon="&#10003;"
      barColor="#cc2233"
      completedColor="#4ade80"
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}
