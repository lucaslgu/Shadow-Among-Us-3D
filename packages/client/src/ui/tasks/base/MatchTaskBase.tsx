import { useState, useEffect, useRef } from 'react';

export interface MatchTaskBaseProps {
  title: string;
  subtitle: string;
  itemCount: number;
  generateTarget: () => number[];
  labels?: string[];
  onComplete: () => void;
  onCancel: () => void;
}

export function MatchTaskBase({
  title, subtitle, itemCount, generateTarget, labels, onComplete,
}: MatchTaskBaseProps) {
  const [target] = useState<number[]>(() => generateTarget());
  const [current, setCurrent] = useState<number[]>(() => Array(itemCount).fill(0));
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    if (completedRef.current) return;
    const matches = current.every((val, i) => val === target[i]);
    if (matches) {
      completedRef.current = true;
      setCompleted(true);
      setTimeout(onComplete, 600);
    }
  }, [current, target, onComplete]);

  function adjustItem(index: number, delta: number) {
    if (completedRef.current) return;
    setCurrent(prev => {
      const next = [...prev];
      next[index] = next[index] + delta;
      return next;
    });
  }

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 24 }}>{subtitle}</div>

      {/* Target display */}
      <div style={{ marginBottom: 8 }}>
        <div style={{
          fontSize: 12, color: '#6b6b8a', marginBottom: 8,
          textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
        }}>Target</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
          {target.map((val, i) => (
            <div key={`t-${i}`} style={{
              width: 56, height: 56, background: 'rgba(74,222,128,0.12)',
              border: '2px solid #4ade8066', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 700, color: '#4ade80',
              fontFamily: "'Courier New', monospace",
            }}>
              {labels ? labels[val % labels.length] : val}
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: '#2a2a45', margin: '20px 0' }} />

      {/* Current values (interactive) */}
      <div>
        <div style={{
          fontSize: 12, color: '#6b6b8a', marginBottom: 8,
          textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
        }}>Your values</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
          {current.map((val, i) => {
            const matches = val === target[i];
            return (
              <div key={`c-${i}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <button onClick={() => adjustItem(i, 1)} disabled={completed}
                  style={{
                    width: 56, height: 28, border: '1px solid #2a2a45', borderRadius: '8px 8px 0 0',
                    background: '#0a0a12', color: '#e2e2f0', cursor: 'pointer', fontSize: 16, fontWeight: 700,
                  }}>+</button>
                <div style={{
                  width: 56, height: 56,
                  background: matches ? 'rgba(74,222,128,0.15)' : 'rgba(68,170,255,0.1)',
                  border: `2px solid ${matches ? '#4ade80' : '#44aaff'}`,
                  borderRadius: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, fontWeight: 700,
                  color: matches ? '#4ade80' : '#44aaff',
                  fontFamily: "'Courier New', monospace",
                }}>
                  {labels ? labels[((val % labels.length) + labels.length) % labels.length] : val}
                </div>
                <button onClick={() => adjustItem(i, -1)} disabled={completed}
                  style={{
                    width: 56, height: 28, border: '1px solid #2a2a45', borderRadius: '0 0 8px 8px',
                    background: '#0a0a12', color: '#e2e2f0', cursor: 'pointer', fontSize: 16, fontWeight: 700,
                  }}>-</button>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        marginTop: 24, fontSize: 14, fontWeight: 600,
        color: completed ? '#4ade80' : '#6b6b8a',
      }}>
        {completed ? 'Values aligned successfully!' : 'Adjust the values to match the target'}
      </div>
    </div>
  );
}
