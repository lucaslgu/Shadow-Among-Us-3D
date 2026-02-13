import { SequenceTaskBase } from './base/SequenceTaskBase.js';
import type { TaskComponentProps } from '../TaskOverlay.js';

export function EnviarRelatorioTask({ onComplete, onCancel }: TaskComponentProps) {
  return (
    <SequenceTaskBase
      title="Send Report"
      subtitle="Transmit the status report"
      steps={[
        { label: 'Select file', icon: '📄', buttonText: 'Select' },
        { label: 'Confirm send', icon: '📡', buttonText: 'Confirm Send' },
        { label: 'Transmitting...', icon: '⏳', buttonText: 'Waiting...' },
      ]}
      autoCompleteLastStep={2000}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}
