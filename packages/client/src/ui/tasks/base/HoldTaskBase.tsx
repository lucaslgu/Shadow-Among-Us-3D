import { useState, useRef, useCallback, useEffect } from 'react';

export interface HoldTaskBaseProps {
  title: string;
  subtitle: string;
  holdDuration: number; // ms
  icon?: string;
  completedIcon?: string;
  barColor?: string;
  completedColor?: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function HoldTaskBase({
  title, subtitle, holdDuration, icon = '////',
  completedIcon = 'OK', barColor = '#44aaff',
  completedColor = '#4ade80', onComplete,
}: HoldTaskBaseProps) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [completed, setCompleted] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const progressRef = useRef(0);

  const stopHolding = useCallback(() => {
    setHolding(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (!completed) {
      setProgress(0);
      progressRef.current = 0;
    }
  }, [completed]);

  const animate = useCallback((timestamp: number) => {
    if (!startTimeRef.current) {
      startTimeRef.current = timestamp - progressRef.current * holdDuration;
    }
    const elapsed = timestamp - startTimeRef.current;
    const p = Math.min(elapsed / holdDuration, 1);
    progressRef.current = p;
    setProgress(p);

    if (p >= 1) {
      setCompleted(true);
      setHolding(false);
      setTimeout(onComplete, 400);
      return;
    }
    rafRef.current = requestAnimationFrame(animate);
  }, [holdDuration, onComplete]);

  const startHolding = useCallback(() => {
    if (completed) return;
    setHolding(true);
    startTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);
  }, [animate, completed]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const pct = Math.round(progress * 100);
  const activeColor = completed ? completedColor : holding ? barColor : '#2a2a45';

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 32 }}>{subtitle}</div>

      <div style={{
        width: '100%', height: 120, background: '#0a0a12', border: '1px solid #2a2a45',
        borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24, position: 'relative', overflow: 'hidden',
      }}>
        {holding && (
          <div style={{
            position: 'absolute', left: 0, top: `${(1 - progress) * 100}%`,
            width: '100%', height: 2, background: barColor, boxShadow: `0 0 12px ${barColor}`,
          }} />
        )}
        <div style={{
          fontSize: 48, color: activeColor, fontFamily: "'Courier New', monospace",
          fontWeight: 700, transition: 'color 0.3s',
        }}>
          {completed ? completedIcon : icon}
        </div>
      </div>

      <div style={{
        width: '100%', height: 24, background: '#0a0a12', border: '1px solid #2a2a45',
        borderRadius: 12, overflow: 'hidden', marginBottom: 12, position: 'relative',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: activeColor,
          borderRadius: 12, transition: holding ? 'none' : 'width 0.2s ease',
        }} />
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#e2e2f0',
          fontFamily: "'Courier New', monospace",
        }}>{pct}%</div>
      </div>

      <button
        onMouseDown={startHolding} onMouseUp={stopHolding} onMouseLeave={stopHolding}
        onTouchStart={startHolding} onTouchEnd={stopHolding}
        disabled={completed}
        style={{
          width: '100%', padding: '16px 32px', fontSize: 16, fontWeight: 700,
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          border: `2px solid ${activeColor}`, borderRadius: 12,
          background: completed ? `${completedColor}22` : holding ? `${barColor}22` : 'rgba(42,42,69,0.3)',
          color: completed ? completedColor : holding ? barColor : '#e2e2f0',
          cursor: completed ? 'default' : 'pointer', transition: 'all 0.2s', userSelect: 'none',
        }}
      >
        {completed ? 'Complete!' : holding ? 'Holding...' : 'Hold to continue'}
      </button>
    </div>
  );
}
