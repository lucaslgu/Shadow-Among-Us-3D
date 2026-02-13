import { SequenceTaskBase } from './base/SequenceTaskBase.js';
import type { TaskComponentProps } from '../TaskOverlay.js';

export function LimparFiltroTask({ onComplete, onCancel }: TaskComponentProps) {
  return (
    <SequenceTaskBase
      title="Clean Filter"
      subtitle="Follow the steps to replace the filter"
      steps={[
        { label: 'Open filter cover', icon: '🔓', buttonText: 'Open Cover' },
        { label: 'Remove old filter', icon: '🗑️', buttonText: 'Remove Filter' },
        { label: 'Insert new filter', icon: '📦', buttonText: 'Insert Filter' },
        { label: 'Close cover', icon: '🔒', buttonText: 'Close Cover' },
      ]}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}
