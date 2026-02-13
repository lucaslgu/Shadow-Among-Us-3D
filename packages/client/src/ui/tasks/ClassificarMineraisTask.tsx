import { useState, useRef, useCallback } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

const MINERAL_COLORS = ['#ef4444', '#3b82f6', '#eab308', '#22c55e', '#a855f7'];
const COLOR_NAMES = ['Ruby', 'Sapphire', 'Topaz', 'Emerald', 'Amethyst'];
const BIN_COUNT = 3;

export function ClassificarMineraisTask({ onComplete }: TaskComponentProps) {
  // Pick 3 unique colors for bins
  const [binColors] = useState(() => {
    const indices = [...MINERAL_COLORS.keys()].sort(() => Math.random() - 0.5);
    return indices.slice(0, BIN_COUNT);
  });

  // Generate 5 minerals that need to go into the 3 bins
  const [minerals] = useState(() => {
    const items: { colorIdx: number; placed: boolean }[] = [];
    // At least 1 mineral per bin, then fill randomly
    for (const bIdx of binColors) items.push({ colorIdx: bIdx, placed: false });
    while (items.length < 5) {
      items.push({ colorIdx: binColors[Math.floor(Math.random() * BIN_COUNT)], placed: false });
    }
    return items.sort(() => Math.random() - 0.5);
  });

  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [placedCount, setPlacedCount] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [wrongFlash, setWrongFlash] = useState<number | null>(null);
  const completedRef = useRef(false);

  const handleDrop = useCallback((binColorIdx: number) => {
    if (completedRef.current || draggingIdx === null) return;
    const mineral = minerals[draggingIdx];

    if (mineral.colorIdx === binColorIdx) {
      mineral.placed = true;
      const newCount = placedCount + 1;
      setPlacedCount(newCount);
      if (newCount >= minerals.length) {
        completedRef.current = true;
        setCompleted(true);
        setTimeout(onComplete, 500);
      }
    } else {
      setWrongFlash(draggingIdx);
      setTimeout(() => setWrongFlash(null), 400);
    }
    setDraggingIdx(null);
  }, [draggingIdx, minerals, placedCount, onComplete]);

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Sort Minerals</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 24 }}>
        Drag each mineral to the correct color container
      </div>

      {/* Minerals row */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
        {minerals.map((m, i) => (
          <div
            key={i}
            onMouseDown={() => !m.placed && setDraggingIdx(i)}
            style={{
              width: 56, height: 56, borderRadius: 12,
              background: m.placed ? '#1a1a2e' : MINERAL_COLORS[m.colorIdx],
              border: `2px solid ${m.placed ? '#2a2a45' : wrongFlash === i ? '#fff' : MINERAL_COLORS[m.colorIdx]}`,
              opacity: m.placed ? 0.3 : draggingIdx === i ? 0.6 : 1,
              cursor: m.placed ? 'default' : 'grab',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color: '#fff',
              transform: wrongFlash === i ? 'scale(1.1)' : 'scale(1)',
              transition: 'all 0.15s',
            }}
          >
            {m.placed ? '' : COLOR_NAMES[m.colorIdx]}
          </div>
        ))}
      </div>

      {/* Bins row */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
        {binColors.map(colorIdx => {
          const count = minerals.filter(m => m.colorIdx === colorIdx && m.placed).length;
          return (
            <div
              key={colorIdx}
              onMouseUp={() => handleDrop(colorIdx)}
              style={{
                width: 100, height: 80, borderRadius: 12,
                background: `${MINERAL_COLORS[colorIdx]}11`,
                border: `3px dashed ${MINERAL_COLORS[colorIdx]}88`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 4, cursor: 'pointer',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: MINERAL_COLORS[colorIdx], opacity: 0.5,
              }} />
              <div style={{ fontSize: 11, color: '#6b6b8a' }}>{COLOR_NAMES[colorIdx]}</div>
              {count > 0 && <div style={{ fontSize: 10, color: '#4ade80' }}>{count} item(s)</div>}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 24, fontSize: 14, fontWeight: 600, color: completed ? '#4ade80' : '#6b6b8a' }}>
        {completed ? 'Minerals sorted!' : `${placedCount}/${minerals.length} sorted`}
      </div>
    </div>
  );
}
