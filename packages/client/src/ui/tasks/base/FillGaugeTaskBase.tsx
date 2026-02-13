import { useState, useRef, useCallback, useEffect } from 'react';

export interface GaugeConfig {
  targetMin: number;
  targetMax: number;
  fillRate?: number;
  label?: string;
}

export interface FillGaugeTaskBaseProps {
  title: string;
  subtitle: string;
  gauges: GaugeConfig[];
  onComplete: () => void;
  onCancel: () => void;
}

export function FillGaugeTaskBase({
  title, subtitle, gauges, onComplete,
}: FillGaugeTaskBaseProps) {
  const [levels, setLevels] = useState<number[]>(() => gauges.map(() => 0));
  const [activeGauge, setActiveGauge] = useState(0);
  const [results, setResults] = useState<('pending' | 'success' | 'fail')[]>(() => gauges.map(() => 'pending'));
  const [filling, setFilling] = useState(false);
  const [completed, setCompleted] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const completedRef = useRef(false);

  const animate = useCallback((timestamp: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = timestamp;
    const dt = (timestamp - lastTimeRef.current) / 1000;
    lastTimeRef.current = timestamp;

    setLevels(prev => {
      const next = [...prev];
      const rate = gauges[activeGauge]?.fillRate ?? 0.30;
      next[activeGauge] = Math.min(1.05, next[activeGauge] + rate * dt);

      // Auto-fail on overfill
      if (next[activeGauge] > 1.0) {
        setFilling(false);
        setResults(r => {
          const nr = [...r];
          nr[activeGauge] = 'fail';
          return nr;
        });
        // Reset this gauge after brief delay
        setTimeout(() => {
          setLevels(l => { const nl = [...l]; nl[activeGauge] = 0; return nl; });
          setResults(r => { const nr = [...r]; nr[activeGauge] = 'pending'; return nr; });
        }, 600);
        return next;
      }
      return next;
    });

    rafRef.current = requestAnimationFrame(animate);
  }, [activeGauge, gauges]);

  const startFilling = useCallback(() => {
    if (completedRef.current || results[activeGauge] !== 'pending') return;
    setFilling(true);
    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);
  }, [activeGauge, animate, results]);

  const stopFilling = useCallback(() => {
    setFilling(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const gauge = gauges[activeGauge];
    const level = levels[activeGauge];
    if (level >= gauge.targetMin && level <= gauge.targetMax) {
      const newResults = [...results];
      newResults[activeGauge] = 'success';
      setResults(newResults);

      // Check if all gauges are done
      if (newResults.every(r => r === 'success') && !completedRef.current) {
        completedRef.current = true;
        setCompleted(true);
        setTimeout(onComplete, 500);
      } else {
        // Move to next pending gauge
        const nextIdx = newResults.findIndex((r, i) => i > activeGauge && r === 'pending');
        if (nextIdx >= 0) setActiveGauge(nextIdx);
      }
    } else if (level > 0 && level < gauges[activeGauge].targetMin) {
      // Too low — reset
      setResults(r => { const nr = [...r]; nr[activeGauge] = 'fail'; return nr; });
      setTimeout(() => {
        setLevels(l => { const nl = [...l]; nl[activeGauge] = 0; return nl; });
        setResults(r => { const nr = [...r]; nr[activeGauge] = 'pending'; return nr; });
      }, 600);
    }
  }, [activeGauge, levels, gauges, results, onComplete]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const gaugeHeight = 200;

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 24 }}>{subtitle}</div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 24 }}>
        {gauges.map((g, i) => {
          const level = levels[i];
          const inZone = level >= g.targetMin && level <= g.targetMax;
          const isActive = i === activeGauge && !completed;
          const result = results[i];
          const barColor = result === 'success' ? '#4ade80'
            : result === 'fail' ? '#ef4444'
            : inZone ? '#4ade80'
            : level > g.targetMax ? '#ef4444'
            : '#44aaff';

          return (
            <div key={i} style={{ textAlign: 'center' }}>
              {g.label && <div style={{ fontSize: 12, color: '#6b6b8a', marginBottom: 8 }}>{g.label}</div>}
              <div style={{
                width: 48, height: gaugeHeight, background: '#0a0a12',
                border: `2px solid ${isActive ? '#44aaff' : '#2a2a45'}`,
                borderRadius: 8, position: 'relative', overflow: 'hidden',
              }}>
                {/* Target zone */}
                <div style={{
                  position: 'absolute', left: 0, right: 0,
                  bottom: `${g.targetMin * 100}%`,
                  height: `${(g.targetMax - g.targetMin) * 100}%`,
                  background: 'rgba(74,222,128,0.12)',
                  borderTop: '1px dashed #4ade8066',
                  borderBottom: '1px dashed #4ade8066',
                }} />
                {/* Fill */}
                <div style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0,
                  height: `${Math.min(level, 1) * 100}%`,
                  background: barColor, transition: filling ? 'none' : 'height 0.1s',
                  opacity: 0.7,
                }} />
              </div>
              <div style={{ fontSize: 11, color: barColor, marginTop: 4, fontWeight: 600 }}>
                {Math.round(Math.min(level, 1) * 100)}%
              </div>
            </div>
          );
        })}
      </div>

      {completed ? (
        <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80' }}>Calibration complete!</div>
      ) : (
        <button
          onMouseDown={startFilling} onMouseUp={stopFilling} onMouseLeave={stopFilling}
          onTouchStart={startFilling} onTouchEnd={stopFilling}
          disabled={results[activeGauge] !== 'pending'}
          style={{
            width: '100%', padding: '14px 32px', fontSize: 16, fontWeight: 700,
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            border: `2px solid ${filling ? '#44aaff' : '#2a2a45'}`, borderRadius: 12,
            background: filling ? 'rgba(68,170,255,0.12)' : 'rgba(42,42,69,0.3)',
            color: filling ? '#44aaff' : '#e2e2f0',
            cursor: 'pointer', transition: 'all 0.2s',
          }}
        >
          {filling ? 'Filling... release in the green zone!' : 'Hold to fill'}
        </button>
      )}
    </div>
  );
}
