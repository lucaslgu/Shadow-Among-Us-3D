import { SequenceTaskBase } from './base/SequenceTaskBase.js';
import type { TaskComponentProps } from '../TaskOverlay.js';

export function EnviarRelatorioTask({ onComplete, onCancel }: TaskComponentProps) {
  return (
    <SequenceTaskBase
      title="Enviar Relatório"
      subtitle="Transmita o relatório de status"
      steps={[
        { label: 'Selecionar arquivo', icon: '📄', buttonText: 'Selecionar' },
        { label: 'Confirmar envio', icon: '📡', buttonText: 'Confirmar Envio' },
        { label: 'Transmitindo...', icon: '⏳', buttonText: 'Aguardando...' },
      ]}
      autoCompleteLastStep={2000}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}
