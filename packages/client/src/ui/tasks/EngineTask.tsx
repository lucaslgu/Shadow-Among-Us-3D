import { useState, useRef, useCallback, useEffect } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

const FILL_RATE = 0.30; // 30% per second
const TARGET_MIN = 0.70; // 70%
const TARGET_MAX = 1.00; // 100%
const GAUGE_HEIGHT = 280;

export function EngineTask({ onComplete, onCancel }: TaskComponentProps) {
  const [level, setLevel] = useState(0);
  const [filling, setFilling] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'filling' | 'success' | 'fail'>('idle');
  const [failMessage, setFailMessage] = useState('');

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const levelRef = useRef(0);
  const completedRef = useRef(false);

  const resetGauge = useCallback(() => {
    setLevel(0);
    levelRef.current = 0;
    setStatus('idle');
  }, []);

  const animate = useCallback(
    (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dt = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      const newLevel = levelRef.current + FILL_RATE * dt;

      if (newLevel > TARGET_MAX) {
        // Overfilled - reset
        levelRef.current = 0;
        setLevel(0);
        setFilling(false);
        setStatus('fail');
        setFailMessage('Exceeded! Try again.');
        setTimeout(resetGauge, 1000);
        return;
      }

      levelRef.current = newLevel;
      setLevel(newLevel);
      rafRef.current = requestAnimationFrame(animate);
    },
    [resetGauge],
  );

  const startFilling = useCallback(() => {
    if (completedRef.current) return;
    setFilling(true);
    setStatus('filling');
    setFailMessage('');
    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);
  }, [animate]);

  const stopFilling = useCallback(() => {
    if (completedRef.current) return;
    setFilling(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const currentLevel = levelRef.current;

    if (currentLevel >= TARGET_MIN && currentLevel <= TARGET_MAX) {
      // Success!
      completedRef.current = true;
      setCompleted(true);
      setStatus('success');
      setTimeout(onComplete, 600);
    } else if (currentLevel < TARGET_MIN && currentLevel > 0) {
      // Released too early
      setStatus('fail');
      setFailMessage('Insufficient! Hold until the green zone.');
      setTimeout(resetGauge, 1000);
    }
  }, [onComplete, resetGauge]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const pct = Math.round(level * 100);
  const isInZone = level >= TARGET_MIN && level <= TARGET_MAX;

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      {/* Title */}
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
        Engines
      </div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 24 }}>
        Hold to refuel (zone: 70-100%)
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          gap: 24,
        }}
      >
        {/* Gauge */}
        <div
          style={{
            width: 80,
            height: GAUGE_HEIGHT,
            background: '#0a0a12',
            border: `1px solid ${status === 'success' ? '#4ade80' : '#2a2a45'}`,
            borderRadius: 12,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Target zone background (70% - 100%) */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: `${TARGET_MIN * 100}%`,
              height: `${(TARGET_MAX - TARGET_MIN) * 100}%`,
              background: 'rgba(74, 222, 128, 0.08)',
              borderTop: '1px dashed rgba(74, 222, 128, 0.4)',
              borderBottom: '1px dashed rgba(74, 222, 128, 0.4)',
            }}
          />

          {/* Target zone labels */}
          <div
            style={{
              position: 'absolute',
              right: 4,
              bottom: `${TARGET_MAX * 100}%`,
              transform: 'translateY(50%)',
              fontSize: 9,
              color: '#4ade80',
              fontFamily: "'Courier New', monospace",
              fontWeight: 700,
            }}
          >
            100%
          </div>
          <div
            style={{
              position: 'absolute',
              right: 4,
              bottom: `${TARGET_MIN * 100}%`,
              transform: 'translateY(50%)',
              fontSize: 9,
              color: '#4ade80',
              fontFamily: "'Courier New', monospace",
              fontWeight: 700,
            }}
          >
            70%
          </div>

          {/* Fill level */}
          <div
            style={{
              position: 'absolute',
              left: 4,
              right: 4,
              bottom: 4,
              height: `${Math.min(pct, 100)}%`,
              maxHeight: GAUGE_HEIGHT - 8,
              background: completed
                ? 'linear-gradient(to top, #2d8a4e, #4ade80)'
                : isInZone
                  ? 'linear-gradient(to top, #2d6a8a, #44aaff)'
                  : level > TARGET_MAX
                    ? 'linear-gradient(to top, #8a2d2d, #ef4444)'
                    : 'linear-gradient(to top, #2d3a6a, #44aaff)',
              borderRadius: 8,
              transition: filling ? 'none' : 'height 0.2s ease',
            }}
          />

          {/* Percentage overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 700,
              color: '#e2e2f0',
              fontFamily: "'Courier New', monospace",
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            }}
          >
            {pct}%
          </div>
        </div>

        {/* Right side: button and info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Fill button */}
          <button
            onMouseDown={startFilling}
            onMouseUp={stopFilling}
            onMouseLeave={() => {
              if (filling) stopFilling();
            }}
            onTouchStart={startFilling}
            onTouchEnd={stopFilling}
            disabled={completed}
            style={{
              width: 160,
              padding: '24px 16px',
              fontSize: 15,
              fontWeight: 700,
              fontFamily: "'Segoe UI', system-ui, sans-serif",
              border: `2px solid ${
                completed
                  ? '#4ade80'
                  : filling
                    ? isInZone
                      ? '#4ade80'
                      : '#44aaff'
                    : '#2a2a45'
              }`,
              borderRadius: 12,
              background: completed
                ? 'rgba(74, 222, 128, 0.15)'
                : filling
                  ? isInZone
                    ? 'rgba(74, 222, 128, 0.12)'
                    : 'rgba(68, 170, 255, 0.12)'
                  : 'rgba(42, 42, 69, 0.3)',
              color: completed
                ? '#4ade80'
                : filling
                  ? isInZone
                    ? '#4ade80'
                    : '#44aaff'
                  : '#e2e2f0',
              cursor: completed ? 'default' : 'pointer',
              transition: 'all 0.2s',
              userSelect: 'none',
            }}
          >
            {completed
              ? 'Refueled!'
              : filling
                ? isInZone
                  ? 'Release now!'
                  : 'Filling...'
                : 'Hold to\nfill'}
          </button>

          {/* Status message */}
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color:
                status === 'success'
                  ? '#4ade80'
                  : status === 'fail'
                    ? '#ef4444'
                    : isInZone
                      ? '#4ade80'
                      : '#6b6b8a',
              minHeight: 16,
              textAlign: 'center',
            }}
          >
            {status === 'success'
              ? 'Engine refueled!'
              : status === 'fail'
                ? failMessage
                : isInZone
                  ? 'In zone! Release!'
                  : filling
                    ? 'Filling...'
                    : ''}
          </div>

          {/* Zone indicator legend */}
          <div style={{ fontSize: 11, color: '#3a3a55' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 8, height: 8, background: '#4ade80', borderRadius: 2 }} />
              <span>Target zone (70-100%)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, background: '#ef4444', borderRadius: 2 }} />
              <span>Exceeded (&gt;100%)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
