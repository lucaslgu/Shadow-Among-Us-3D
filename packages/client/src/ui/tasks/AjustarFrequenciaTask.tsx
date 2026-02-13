import { useState, useRef, useEffect, useCallback } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

const CANVAS_W = 460;
const CANVAS_H = 200;
const MATCH_THRESHOLD = 0.85;
const HOLD_DURATION = 1500; // ms

export function AjustarFrequenciaTask({ onComplete }: TaskComponentProps) {
  const [targetFreq] = useState(() => 1 + Math.random() * 4); // 1-5 Hz
  const [currentFreq, setCurrentFreq] = useState(1);
  const [matchTimer, setMatchTimer] = useState(0);
  const [completed, setCompleted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const matchStartRef = useRef(0);
  const completedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    function draw(timestamp: number) {
      phaseRef.current += 0.02;
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Grid
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 1;
      for (let x = 0; x < CANVAS_W; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(0, CANVAS_H / 2); ctx.lineTo(CANVAS_W, CANVAS_H / 2); ctx.stroke();

      // Target wave
      ctx.beginPath();
      for (let x = 0; x < CANVAS_W; x++) {
        const y = CANVAS_H / 2 + Math.sin((x / CANVAS_W) * targetFreq * Math.PI * 2 + phaseRef.current) * 60;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#4ade8066';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Current wave
      ctx.beginPath();
      for (let x = 0; x < CANVAS_W; x++) {
        const y = CANVAS_H / 2 + Math.sin((x / CANVAS_W) * currentFreq * Math.PI * 2 + phaseRef.current) * 60;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#44aaff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Check match
      const ratio = Math.min(currentFreq, targetFreq) / Math.max(currentFreq, targetFreq);
      if (ratio >= MATCH_THRESHOLD && !completedRef.current) {
        if (matchStartRef.current === 0) matchStartRef.current = timestamp;
        const elapsed = timestamp - matchStartRef.current;
        setMatchTimer(elapsed);
        if (elapsed >= HOLD_DURATION) {
          completedRef.current = true;
          setCompleted(true);
          setTimeout(onComplete, 500);
        }
      } else {
        matchStartRef.current = 0;
        setMatchTimer(0);
      }

      if (!completedRef.current) rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [targetFreq, currentFreq, onComplete]);

  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentFreq(parseFloat(e.target.value));
  }, []);

  const ratio = Math.min(currentFreq, targetFreq) / Math.max(currentFreq, targetFreq);
  const matchPct = Math.round(ratio * 100);
  const holdPct = Math.round((matchTimer / HOLD_DURATION) * 100);

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Tune Frequency</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 16 }}>
        Align the blue wave with the green wave and hold
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_W} height={CANVAS_H}
        style={{
          border: `1px solid ${completed ? '#4ade80' : '#2a2a45'}`,
          borderRadius: 12, width: '100%', maxWidth: CANVAS_W, marginBottom: 16,
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#6b6b8a' }}>1 Hz</div>
        <input
          type="range" min="1" max="5" step="0.05"
          value={currentFreq}
          onChange={handleSlider}
          disabled={completed}
          style={{ width: 300, accentColor: '#44aaff' }}
        />
        <div style={{ fontSize: 13, color: '#6b6b8a' }}>5 Hz</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 14, color: matchPct >= 85 ? '#4ade80' : '#6b6b8a', fontWeight: 600 }}>
          Sync: {matchPct}%
        </div>
        {matchPct >= 85 && !completed && (
          <div style={{ fontSize: 14, color: '#eab308', fontWeight: 600 }}>
            Holding... {holdPct}%
          </div>
        )}
      </div>

      {completed && (
        <div style={{ marginTop: 16, fontSize: 18, fontWeight: 700, color: '#4ade80' }}>
          Frequency synced!
        </div>
      )}
    </div>
  );
}
