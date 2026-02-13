import { MatchTaskBase } from './base/MatchTaskBase.js';
import type { TaskComponentProps } from '../TaskOverlay.js';

function generateTargetTemp(): number[] {
  // Single target temperature between -20 and 80
  return [Math.floor(Math.random() * 100) - 20];
}

export function RegistrarTemperaturaTask({ onComplete, onCancel }: TaskComponentProps) {
  return (
    <MatchTaskBase
      title="Registrar Temperatura"
      subtitle="Ajuste o termômetro para a temperatura alvo"
      itemCount={1}
      generateTarget={generateTargetTemp}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}
