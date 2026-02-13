import { useState, useRef, useCallback } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

const BLOCK_VALUES = [1, 2, 3, 4, 5];
const TARGET_PER_SIDE = 3;

export function EquilibrarCargaTask({ onComplete }: TaskComponentProps) {
  const [available, setAvailable] = useState(() =>
    [...BLOCK_VALUES].sort(() => Math.random() - 0.5)
  );
  const [leftSide, setLeftSide] = useState<number[]>([]);
  const [rightSide, setRightSide] = useState<number[]>([]);
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);

  const leftSum = leftSide.reduce((a, b) => a + b, 0);
  const rightSum = rightSide.reduce((a, b) => a + b, 0);

  const checkBalance = useCallback((left: number[], right: number[]) => {
    if (left.length >= TARGET_PER_SIDE && right.length >= TARGET_PER_SIDE) {
      const ls = left.reduce((a, b) => a + b, 0);
      const rs = right.reduce((a, b) => a + b, 0);
      if (ls === rs && !completedRef.current) {
        completedRef.current = true;
        setCompleted(true);
        setTimeout(onComplete, 500);
      }
    }
  }, [onComplete]);

  const moveToLeft = useCallback((val: number) => {
    if (completedRef.current) return;
    const newAvail = available.filter((v, i) => { if (v === val) { available.splice(i, 1); return false; } return true; });
    // Actually remove first occurrence
    const idx = available.indexOf(val);
    if (idx < 0) return;
    const newA = [...available];
    newA.splice(idx, 1);
    setAvailable(newA);
    const newLeft = [...leftSide, val];
    setLeftSide(newLeft);
    checkBalance(newLeft, rightSide);
  }, [available, leftSide, rightSide, checkBalance]);

  const moveToRight = useCallback((val: number) => {
    if (completedRef.current) return;
    const idx = available.indexOf(val);
    if (idx < 0) return;
    const newA = [...available];
    newA.splice(idx, 1);
    setAvailable(newA);
    const newRight = [...rightSide, val];
    setRightSide(newRight);
    checkBalance(leftSide, newRight);
  }, [available, leftSide, rightSide, checkBalance]);

  const returnBlock = useCallback((side: 'left' | 'right', val: number) => {
    if (completedRef.current) return;
    if (side === 'left') {
      const idx = leftSide.indexOf(val);
      if (idx < 0) return;
      const newL = [...leftSide]; newL.splice(idx, 1);
      setLeftSide(newL);
    } else {
      const idx = rightSide.indexOf(val);
      if (idx < 0) return;
      const newR = [...rightSide]; newR.splice(idx, 1);
      setRightSide(newR);
    }
    setAvailable(prev => [...prev, val]);
  }, [leftSide, rightSide]);

  const tilt = leftSum - rightSum;
  const tiltDeg = Math.max(-15, Math.min(15, tilt * 3));

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Equilibrar Carga</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 24 }}>
        Distribua os blocos igualmente entre os dois lados
      </div>

      {/* Available blocks */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
        {available.map((val, i) => (
          <div key={`a-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button onClick={() => moveToLeft(val)} disabled={completed}
              style={{ fontSize: 10, background: 'none', border: '1px solid #44aaff44', borderRadius: 4, color: '#44aaff', cursor: 'pointer', padding: '2px 6px' }}>
              &#x25C0;
            </button>
            <div style={{
              width: 44, height: 44, borderRadius: 8,
              background: '#44aaff', border: '2px solid #44aaff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700, color: '#000',
            }}>{val}</div>
            <button onClick={() => moveToRight(val)} disabled={completed}
              style={{ fontSize: 10, background: 'none', border: '1px solid #44aaff44', borderRadius: 4, color: '#44aaff', cursor: 'pointer', padding: '2px 6px' }}>
              &#x25B6;
            </button>
          </div>
        ))}
        {available.length === 0 && <div style={{ fontSize: 13, color: '#6b6b8a' }}>Todos distribuídos</div>}
      </div>

      {/* Balance beam */}
      <div style={{ position: 'relative', height: 120, marginBottom: 16 }}>
        {/* Pivot */}
        <div style={{
          position: 'absolute', left: '50%', bottom: 0,
          width: 0, height: 0,
          borderLeft: '16px solid transparent', borderRight: '16px solid transparent',
          borderBottom: '20px solid #2a2a45',
          transform: 'translateX(-50%)',
        }} />

        {/* Beam */}
        <div style={{
          position: 'absolute', left: '10%', right: '10%', top: 40,
          height: 6, background: '#4a4a6a', borderRadius: 3,
          transform: `rotate(${tiltDeg}deg)`,
          transformOrigin: '50% 50%',
          transition: 'transform 0.3s',
        }} />

        {/* Left side blocks */}
        <div style={{
          position: 'absolute', left: '10%', top: 50, display: 'flex', gap: 4,
          transform: `rotate(${tiltDeg}deg) translateY(-100%)`,
          transformOrigin: 'center bottom',
        }}>
          {leftSide.map((val, i) => (
            <div key={`l-${i}`} onClick={() => returnBlock('left', val)}
              style={{
                width: 32, height: 32, borderRadius: 6, background: '#3b82f6',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: '#fff', cursor: completed ? 'default' : 'pointer',
              }}>{val}</div>
          ))}
        </div>

        {/* Right side blocks */}
        <div style={{
          position: 'absolute', right: '10%', top: 50, display: 'flex', gap: 4,
          transform: `rotate(${tiltDeg}deg) translateY(-100%)`,
          transformOrigin: 'center bottom',
        }}>
          {rightSide.map((val, i) => (
            <div key={`r-${i}`} onClick={() => returnBlock('right', val)}
              style={{
                width: 32, height: 32, borderRadius: 6, background: '#f97316',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: '#fff', cursor: completed ? 'default' : 'pointer',
              }}>{val}</div>
          ))}
        </div>
      </div>

      {/* Sums */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#3b82f6' }}>Esq: {leftSum}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: completed ? '#4ade80' : '#6b6b8a' }}>
          {completed ? '=' : tilt === 0 ? '=' : tilt > 0 ? '>' : '<'}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f97316' }}>Dir: {rightSum}</div>
      </div>

      <div style={{ marginTop: 16, fontSize: 14, fontWeight: 600, color: completed ? '#4ade80' : '#6b6b8a' }}>
        {completed ? 'Carga equilibrada!' : 'Distribua os blocos para equilibrar a balança'}
      </div>
    </div>
  );
}
