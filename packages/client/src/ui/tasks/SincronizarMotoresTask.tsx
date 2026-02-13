import { useState, useRef, useEffect, useCallback } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

const DIAL_COUNT = 3;
const DIAL_SPEEDS = [120, 170, 230]; // degrees per second
const ZONE_SIZE = 25; // degrees
const REQUIRED_SYNCS = 2;
const DIAL_RADIUS = 50;
const CANVAS_SIZE = 140;

export function SincronizarMotoresTask({ onComplete }: TaskComponentProps) {
  const [syncs, setSyncs] = useState(0);
  const [lastResult, setLastResult] = useState<'none' | 'hit' | 'miss'>('none');
  const [completed, setCompleted] = useState(false);
  const anglesRef = useRef([0, 0, 0]);
  const zonesRef = useRef<number[]>([]);
  const canvasRefs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const completedRef = useRef(false);

  // Initialize zones
  useEffect(() => {
    zonesRef.current = Array.from({ length: DIAL_COUNT }, () => Math.random() * 360);
  }, []);

  // Animation
  useEffect(() => {
    function draw(timestamp: number) {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dt = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      for (let d = 0; d < DIAL_COUNT; d++) {
        anglesRef.current[d] = (anglesRef.current[d] + DIAL_SPEEDS[d] * dt) % 360;
        const canvas = canvasRefs[d].current;
        if (!canvas) continue;
        const ctx = canvas.getContext('2d')!;
        const cx = CANVAS_SIZE / 2;
        const cy = CANVAS_SIZE / 2;

        ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        // Dial circle
        ctx.beginPath();
        ctx.arc(cx, cy, DIAL_RADIUS, 0, Math.PI * 2);
        ctx.strokeStyle = '#2a2a45';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Zone arc
        const zoneStart = (zonesRef.current[d] * Math.PI) / 180 - Math.PI / 2;
        const zoneEnd = ((zonesRef.current[d] + ZONE_SIZE) * Math.PI) / 180 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, DIAL_RADIUS, zoneStart, zoneEnd);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 10;
        ctx.stroke();

        // Needle
        const angle = (anglesRef.current[d] * Math.PI) / 180 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * (DIAL_RADIUS - 10), cy + Math.sin(angle) * (DIAL_RADIUS - 10));
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Center
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();

        // Label
        ctx.fillStyle = '#6b6b8a';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`Engine ${d + 1}`, cx, CANVAS_SIZE - 8);
      }

      if (!completedRef.current) rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleSync = useCallback(() => {
    if (completedRef.current) return;

    // Check if all needles are in their zones
    let allInZone = true;
    for (let d = 0; d < DIAL_COUNT; d++) {
      const angle = anglesRef.current[d];
      const zoneStart = zonesRef.current[d];
      const zoneEnd = zoneStart + ZONE_SIZE;
      let inZone = false;
      if (zoneEnd <= 360) {
        inZone = angle >= zoneStart && angle <= zoneEnd;
      } else {
        inZone = angle >= zoneStart || angle <= zoneEnd % 360;
      }
      if (!inZone) { allInZone = false; break; }
    }

    if (allInZone) {
      setLastResult('hit');
      setSyncs(s => {
        const next = s + 1;
        if (next >= REQUIRED_SYNCS) {
          completedRef.current = true;
          setCompleted(true);
          setTimeout(onComplete, 500);
        }
        // Randomize zones for next sync
        zonesRef.current = Array.from({ length: DIAL_COUNT }, () => Math.random() * 360);
        return next;
      });
    } else {
      setLastResult('miss');
      setSyncs(0);
    }
    setTimeout(() => setLastResult('none'), 500);
  }, [onComplete]);

  // Space key to sync
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space') {
        e.preventDefault();
        handleSync();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSync]);

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Sync Engines</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 12 }}>
        Press SPACE when all needles are in the green zone
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#44aaff' }}>
          Syncs: {syncs}/{REQUIRED_SYNCS}
        </div>
        {lastResult === 'hit' && <span style={{ color: '#4ade80', fontWeight: 700 }}>Synced!</span>}
        {lastResult === 'miss' && <span style={{ color: '#ef4444', fontWeight: 700 }}>Out of sync!</span>}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 24 }}>
        {canvasRefs.map((ref, i) => (
          <canvas
            key={i}
            ref={ref}
            width={CANVAS_SIZE} height={CANVAS_SIZE}
            onClick={handleSync}
            style={{
              borderRadius: 12,
              border: `1px solid ${completed ? '#4ade80' : '#2a2a45'}`,
              cursor: 'pointer',
            }}
          />
        ))}
      </div>

      <button onClick={handleSync} disabled={completed}
        style={{
          padding: '14px 40px', fontSize: 16, fontWeight: 700,
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          border: '2px solid #44aaff', borderRadius: 12,
          background: 'rgba(68,170,255,0.12)', color: '#44aaff',
          cursor: completed ? 'default' : 'pointer',
        }}
      >
        {completed ? 'Engines synced!' : 'SPACE or click to sync'}
      </button>
    </div>
  );
}
