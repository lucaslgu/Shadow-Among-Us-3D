import { useState, useRef, useEffect, useCallback } from 'react';

export interface TimingTaskBaseProps {
  title: string;
  subtitle: string;
  speed: number; // degrees per second
  zoneSize: number; // degrees
  requiredHits: number;
  onComplete: () => void;
  onCancel: () => void;
}

export function TimingTaskBase({
  title, subtitle, speed, zoneSize, requiredHits, onComplete,
}: TimingTaskBaseProps) {
  const [hits, setHits] = useState(0);
  const [lastResult, setLastResult] = useState<'none' | 'hit' | 'miss'>('none');
  const [completed, setCompleted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angleRef = useRef(0);
  const zoneStartRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const completedRef = useRef(false);

  // Randomize zone position on mount
  useEffect(() => {
    zoneStartRef.current = Math.random() * 360;
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const size = 260;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 100;

    function draw(timestamp: number) {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const dt = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      angleRef.current = (angleRef.current + speed * dt) % 360;

      ctx.clearRect(0, 0, size, size);

      // Dial circle
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#2a2a45';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Target zone (arc)
      const zoneStart = (zoneStartRef.current * Math.PI) / 180;
      const zoneEnd = ((zoneStartRef.current + zoneSize) * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, zoneStart - Math.PI / 2, zoneEnd - Math.PI / 2);
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 12;
      ctx.stroke();

      // Tick marks
      for (let a = 0; a < 360; a += 30) {
        const rad = (a * Math.PI) / 180 - Math.PI / 2;
        const x1 = cx + Math.cos(rad) * (radius - 8);
        const y1 = cy + Math.sin(rad) * (radius - 8);
        const x2 = cx + Math.cos(rad) * (radius + 2);
        const y2 = cy + Math.sin(rad) * (radius + 2);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#4a4a6a';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Needle
      const needleRad = (angleRef.current * Math.PI) / 180 - Math.PI / 2;
      const nx = cx + Math.cos(needleRad) * (radius - 15);
      const ny = cy + Math.sin(needleRad) * (radius - 15);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Center dot
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();

      if (!completedRef.current) rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [speed, zoneSize]);

  const handleClick = useCallback(() => {
    if (completedRef.current) return;
    const angle = angleRef.current;
    const zoneStart = zoneStartRef.current;
    const zoneEnd = zoneStart + zoneSize;

    // Check if needle is in zone (handle wrap-around)
    let inZone = false;
    if (zoneEnd <= 360) {
      inZone = angle >= zoneStart && angle <= zoneEnd;
    } else {
      inZone = angle >= zoneStart || angle <= zoneEnd % 360;
    }

    if (inZone) {
      setLastResult('hit');
      setHits(h => {
        const next = h + 1;
        if (next >= requiredHits && !completedRef.current) {
          completedRef.current = true;
          setCompleted(true);
          setTimeout(onComplete, 500);
        }
        // Move zone to new random position after hit
        zoneStartRef.current = Math.random() * 360;
        return next;
      });
    } else {
      setLastResult('miss');
      setHits(0); // Reset on miss
    }
    setTimeout(() => setLastResult('none'), 400);
  }, [zoneSize, requiredHits, onComplete]);

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 16 }}>{subtitle}</div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#44aaff' }}>
          Acertos: {hits}/{requiredHits}
        </div>
        {lastResult === 'hit' && <span style={{ color: '#4ade80', fontWeight: 700 }}>Acertou!</span>}
        {lastResult === 'miss' && <span style={{ color: '#ef4444', fontWeight: 700 }}>Errou! Reset</span>}
      </div>

      <canvas
        ref={canvasRef}
        width={260} height={260}
        onClick={handleClick}
        style={{
          borderRadius: 12, cursor: completed ? 'default' : 'pointer',
          border: `1px solid ${completed ? '#4ade80' : '#2a2a45'}`,
          marginBottom: 16,
        }}
      />

      {completed && (
        <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80' }}>Calibração perfeita!</div>
      )}
      {!completed && (
        <div style={{ fontSize: 13, color: '#6b6b8a' }}>
          Clique quando a agulha estiver na zona verde
        </div>
      )}
    </div>
  );
}
