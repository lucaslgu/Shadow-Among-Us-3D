import { useState } from 'react';
import { MatchTaskBase } from './base/MatchTaskBase.js';
import { FillGaugeTaskBase } from './base/FillGaugeTaskBase.js';
import { HoldTaskBase } from './base/HoldTaskBase.js';
import type { TaskComponentProps } from '../TaskOverlay.js';

function generateSwitchPattern(): number[] {
  return Array.from({ length: 4 }, () => Math.random() > 0.5 ? 1 : 0);
}

export function RepararReatorTask({ onComplete, onCancel }: TaskComponentProps) {
  const [phase, setPhase] = useState<1 | 2 | 3>(1);

  return (
    <div>
      {/* Phase indicator */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16,
        userSelect: 'none',
      }}>
        {[1, 2, 3].map(p => (
          <div key={p} style={{
            width: 32, height: 32, borderRadius: '50%',
            background: p < phase ? '#4ade80' : p === phase ? '#44aaff' : '#2a2a45',
            border: `2px solid ${p < phase ? '#4ade80' : p === phase ? '#44aaff' : '#2a2a45'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700,
            color: p <= phase ? '#fff' : '#6b6b8a',
          }}>{p}</div>
        ))}
      </div>

      {phase === 1 && (
        <MatchTaskBase
          title="Reparar Reator — Fase 1"
          subtitle="Alinhe os interruptores com o padrão"
          itemCount={4}
          generateTarget={generateSwitchPattern}
          labels={['OFF', 'ON']}
          onComplete={() => setPhase(2)}
          onCancel={onCancel}
        />
      )}

      {phase === 2 && (
        <FillGaugeTaskBase
          title="Reparar Reator — Fase 2"
          subtitle="Encha o gauge na zona estreita (80-95%)"
          gauges={[{ targetMin: 0.80, targetMax: 0.95, fillRate: 0.22 }]}
          onComplete={() => setPhase(3)}
          onCancel={onCancel}
        />
      )}

      {phase === 3 && (
        <HoldTaskBase
          title="Reparar Reator — Fase 3"
          subtitle="Segure para estabilizar o reator"
          holdDuration={4000}
          icon="&#9762;"
          completedIcon="&#10003;"
          barColor="#eab308"
          completedColor="#4ade80"
          onComplete={onComplete}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}
