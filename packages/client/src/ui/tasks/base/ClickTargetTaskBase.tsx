import { useState, useRef, useEffect, useCallback } from 'react';

export interface ClickTargetTaskBaseProps {
  title: string;
  subtitle: string;
  targetCount: number;
  viewportW?: number;
  viewportH?: number;
  targetSpeed?: number;
  targetSize?: number;
  hasDecoys?: boolean;
  decoyPenalty?: number;
  stationaryTargets?: boolean;
  onComplete: () => void;
  onCancel: () => void;
}

interface Target {
  id: number;
  x: number; y: number;
  vx: number; vy: number;
  isDecoy: boolean;
  alive: boolean;
}

export function ClickTargetTaskBase({
  title, subtitle, targetCount, viewportW = 520, viewportH = 320,
  targetSpeed = 1.5, targetSize = 28, hasDecoys = false, decoyPenalty = 1,
  stationaryTargets = false, onComplete,
}: ClickTargetTaskBaseProps) {
  const [score, setScore] = useState(0);
  const [penalty, setPenalty] = useState(0);
  const [completed, setCompleted] = useState(false);
  const targetsRef = useRef<Target[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const completedRef = useRef(false);

  const netScore = score - penalty;

  // Initialize targets
  useEffect(() => {
    const targets: Target[] = [];
    const totalTargets = targetCount + (hasDecoys ? Math.floor(targetCount * 0.4) : 0);
    for (let i = 0; i < totalTargets; i++) {
      const isDecoy = i >= targetCount;
      targets.push({
        id: i,
        x: Math.random() * (viewportW - targetSize * 2) + targetSize,
        y: Math.random() * (viewportH - targetSize * 2) + targetSize,
        vx: stationaryTargets ? 0 : (Math.random() - 0.5) * targetSpeed * 2,
        vy: stationaryTargets ? 0 : (Math.random() - 0.5) * targetSpeed * 2,
        isDecoy,
        alive: true,
      });
    }
    targetsRef.current = targets;
  }, [targetCount, viewportW, viewportH, targetSpeed, targetSize, hasDecoys, stationaryTargets]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    function draw() {
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, viewportW, viewportH);

      // Stars background
      ctx.fillStyle = '#ffffff15';
      for (let i = 0; i < 40; i++) {
        const sx = (i * 137 + 42) % viewportW;
        const sy = (i * 97 + 13) % viewportH;
        ctx.fillRect(sx, sy, 1, 1);
      }

      for (const t of targetsRef.current) {
        if (!t.alive) continue;
        // Move
        t.x += t.vx;
        t.y += t.vy;
        if (t.x < targetSize || t.x > viewportW - targetSize) t.vx *= -1;
        if (t.y < targetSize || t.y > viewportH - targetSize) t.vy *= -1;
        t.x = Math.max(targetSize, Math.min(viewportW - targetSize, t.x));
        t.y = Math.max(targetSize, Math.min(viewportH - targetSize, t.y));

        // Draw
        ctx.beginPath();
        ctx.arc(t.x, t.y, targetSize, 0, Math.PI * 2);
        ctx.fillStyle = t.isDecoy ? 'rgba(239,68,68,0.7)' : 'rgba(68,170,255,0.7)';
        ctx.fill();
        ctx.strokeStyle = t.isDecoy ? '#ef4444' : '#44aaff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner dot
        ctx.beginPath();
        ctx.arc(t.x, t.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }

      if (!completedRef.current) rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [viewportW, viewportH, targetSize]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (completedRef.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (viewportW / rect.width);
    const my = (e.clientY - rect.top) * (viewportH / rect.height);

    for (const t of targetsRef.current) {
      if (!t.alive) continue;
      const dx = t.x - mx;
      const dy = t.y - my;
      if (dx * dx + dy * dy < targetSize * targetSize) {
        t.alive = false;
        if (t.isDecoy) {
          setPenalty(p => p + decoyPenalty);
        } else {
          setScore(s => {
            const next = s + 1;
            if (next - penalty >= targetCount && !completedRef.current) {
              completedRef.current = true;
              setCompleted(true);
              setTimeout(onComplete, 600);
            }
            return next;
          });
        }
        break;
      }
    }
  }, [targetCount, targetSize, viewportW, viewportH, decoyPenalty, penalty, onComplete]);

  // Check completion with penalty changes
  useEffect(() => {
    if (netScore >= targetCount && !completedRef.current) {
      completedRef.current = true;
      setCompleted(true);
      setTimeout(onComplete, 600);
    }
  }, [netScore, targetCount, onComplete]);

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 16 }}>{subtitle}</div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 14, color: '#44aaff', fontWeight: 600 }}>
          Targets: {Math.min(score, targetCount)}/{targetCount}
        </div>
        {hasDecoys && penalty > 0 && (
          <div style={{ fontSize: 14, color: '#ef4444', fontWeight: 600 }}>
            Penalty: -{penalty}
          </div>
        )}
      </div>

      <canvas
        ref={canvasRef}
        width={viewportW} height={viewportH}
        onClick={handleClick}
        style={{
          border: `1px solid ${completed ? '#4ade80' : '#2a2a45'}`,
          borderRadius: 12, cursor: completed ? 'default' : 'crosshair',
          width: '100%', maxWidth: viewportW, height: 'auto',
        }}
      />

      {completed && (
        <div style={{ marginTop: 16, fontSize: 18, fontWeight: 700, color: '#4ade80' }}>
          All targets neutralized!
        </div>
      )}
    </div>
  );
}
