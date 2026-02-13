import { useState, useRef, useCallback } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

const BAR_COUNT = 5;

export function AnalisarDadosTask({ onComplete }: TaskComponentProps) {
  const [values] = useState(() => {
    // Generate 5 unique random values
    const vals: number[] = [];
    while (vals.length < BAR_COUNT) {
      const v = 10 + Math.floor(Math.random() * 90);
      if (!vals.includes(v)) vals.push(v);
    }
    return vals;
  });
  const [sorted] = useState(() => [...values].sort((a, b) => a - b));
  const [clicks, setClicks] = useState<number[]>([]);
  const [error, setError] = useState(false);
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);

  const handleBarClick = useCallback((value: number) => {
    if (completedRef.current || clicks.includes(value)) return;

    const expectedValue = sorted[clicks.length];
    if (value !== expectedValue) {
      setError(true);
      setClicks([]);
      setTimeout(() => setError(false), 600);
      return;
    }

    const newClicks = [...clicks, value];
    setClicks(newClicks);

    if (newClicks.length === BAR_COUNT) {
      completedRef.current = true;
      setCompleted(true);
      setTimeout(onComplete, 500);
    }
  }, [clicks, sorted, onComplete]);

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Analyze Data</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 24 }}>
        Click the bars in ascending order (smallest to largest)
      </div>

      {error && (
        <div style={{ fontSize: 14, color: '#ef4444', fontWeight: 600, marginBottom: 12 }}>
          Wrong order! Try again
        </div>
      )}

      {/* Progress */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
        {sorted.map((_, i) => (
          <div key={i} style={{
            width: 10, height: 10, borderRadius: '50%',
            background: i < clicks.length ? '#4ade80' : '#2a2a45',
          }} />
        ))}
      </div>

      {/* Bar chart */}
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
        gap: 16, height: 200, padding: '0 20px', marginBottom: 24,
      }}>
        {values.map((val, i) => {
          const isClicked = clicks.includes(val);
          const isNext = !isClicked && sorted[clicks.length] === val;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => handleBarClick(val)}
                disabled={isClicked || completed}
                style={{
                  width: 56, height: `${val * 1.8}px`,
                  background: isClicked ? '#4ade80' : error ? '#ef444444' : '#44aaff',
                  border: `2px solid ${isClicked ? '#4ade80' : isNext ? '#eab308' : '#44aaff'}`,
                  borderRadius: '8px 8px 0 0',
                  cursor: isClicked || completed ? 'default' : 'pointer',
                  opacity: isClicked ? 0.5 : 1,
                  transition: 'all 0.2s',
                }}
              />
              <div style={{
                fontSize: 14, fontWeight: 700,
                color: isClicked ? '#4ade80' : '#e2e2f0',
                fontFamily: "'Courier New', monospace",
              }}>{val}</div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: completed ? '#4ade80' : '#6b6b8a' }}>
        {completed ? 'Data analyzed correctly!' : `${clicks.length}/${BAR_COUNT} selected`}
      </div>
    </div>
  );
}
