import { SequenceTaskBase } from './base/SequenceTaskBase.js';
import type { TaskComponentProps } from '../TaskOverlay.js';

export function LimparFiltroTask({ onComplete, onCancel }: TaskComponentProps) {
  return (
    <SequenceTaskBase
      title="Limpar Filtro"
      subtitle="Siga os passos para trocar o filtro"
      steps={[
        { label: 'Abrir a tampa do filtro', icon: '🔓', buttonText: 'Abrir Tampa' },
        { label: 'Remover filtro antigo', icon: '🗑️', buttonText: 'Remover Filtro' },
        { label: 'Inserir filtro novo', icon: '📦', buttonText: 'Inserir Filtro' },
        { label: 'Fechar a tampa', icon: '🔒', buttonText: 'Fechar Tampa' },
      ]}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}
