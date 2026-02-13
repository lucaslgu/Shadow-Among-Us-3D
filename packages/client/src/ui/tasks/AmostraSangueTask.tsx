import { HoldTaskBase } from './base/HoldTaskBase.js';
import type { TaskComponentProps } from '../TaskOverlay.js';

export function AmostraSangueTask({ onComplete, onCancel }: TaskComponentProps) {
  return (
    <HoldTaskBase
      title="Blood Sample"
      subtitle="Hold to collect the sample"
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
