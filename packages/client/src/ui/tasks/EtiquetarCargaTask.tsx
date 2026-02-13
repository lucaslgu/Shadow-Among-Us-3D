import { useState, useCallback, useRef } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

const COLORS = ['#ef4444', '#3b82f6', '#eab308'];
const COLOR_NAMES = ['Vermelho', 'Azul', 'Amarelo'];

export function EtiquetarCargaTask({ onComplete }: TaskComponentProps) {
  const [tags] = useState(() => {
    // Shuffle colors for tags
    const shuffled = [...COLORS.keys()].sort(() => Math.random() - 0.5);
    return shuffled.map(i => ({ colorIdx: i, placed: false }));
  });
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [placedCount, setPlacedCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);

  const handleDrop = useCallback((boxColorIdx: number) => {
    if (completedRef.current || draggingIdx === null) return;
    const tag = tags[draggingIdx];
    if (tag.colorIdx === boxColorIdx) {
      tag.placed = true;
      const newCount = placedCount + 1;
      setPlacedCount(newCount);
      if (newCount >= tags.length) {
        completedRef.current = true;
        setCompleted(true);
        setTimeout(onComplete, 500);
      }
    }
    setDraggingIdx(null);
  }, [draggingIdx, tags, placedCount, onComplete]);

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Etiquetar Carga</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 24 }}>
        Arraste cada etiqueta para a caixa da cor correspondente
      </div>

      {/* Tags row */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 32 }}>
        {tags.map((tag, i) => (
          <div
            key={i}
            onMouseDown={() => !tag.placed && setDraggingIdx(i)}
            style={{
              width: 80, height: 40, borderRadius: 8,
              background: tag.placed ? '#1a1a2e' : COLORS[tag.colorIdx],
              border: `2px solid ${tag.placed ? '#2a2a45' : COLORS[tag.colorIdx]}`,
              opacity: tag.placed ? 0.3 : draggingIdx === i ? 0.7 : 1,
              cursor: tag.placed ? 'default' : 'grab',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: '#fff',
              transition: 'opacity 0.2s',
            }}
          >
            {tag.placed ? '---' : COLOR_NAMES[tag.colorIdx]}
          </div>
        ))}
      </div>

      {/* Boxes row */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
        {COLORS.map((color, i) => {
          const hasTag = tags.some(t => t.colorIdx === i && t.placed);
          return (
            <div
              key={i}
              onMouseUp={() => handleDrop(i)}
              style={{
                width: 100, height: 80, borderRadius: 12,
                background: hasTag ? `${color}33` : '#0a0a12',
                border: `3px dashed ${hasTag ? color : '#2a2a45'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 4, cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: 4,
                background: color, opacity: 0.6,
              }} />
              <div style={{ fontSize: 11, color: '#6b6b8a' }}>{COLOR_NAMES[i]}</div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 24, fontSize: 14, fontWeight: 600, color: completed ? '#4ade80' : '#6b6b8a' }}>
        {completed ? 'Carga etiquetada!' : `${placedCount}/${tags.length} etiquetas colocadas`}
      </div>
    </div>
  );
}
