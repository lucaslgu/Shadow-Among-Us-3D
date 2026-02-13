import { HoldTaskBase } from './base/HoldTaskBase.js';
import type { TaskComponentProps } from '../TaskOverlay.js';

export function VerificarOxigenioTask({ onComplete, onCancel }: TaskComponentProps) {
  return (
    <HoldTaskBase
      title="Check Oxygen"
      subtitle="Hold the valve to check the level"
      holdDuration={2000}
      icon="O&#8322;"
      completedIcon="&#10003;"
      barColor="#22d3ee"
      completedColor="#4ade80"
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}
