import { useState, useRef, useCallback, useEffect } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

const TRACE_COUNT = 4;
const TRACE_TOLERANCE = 12; // px corridor width
const CANVAS_W = 440;
const CANVAS_H = 280;

interface Trace {
  points: { x: number; y: number }[];
  completed: boolean;
}

function generateTraces(): Trace[] {
  const traces: Trace[] = [];
  for (let i = 0; i < TRACE_COUNT; i++) {
    const yBase = 40 + (i * (CANVAS_H - 80)) / (TRACE_COUNT - 1);
    const points: { x: number; y: number }[] = [];
    const segments = 6;
    for (let s = 0; s <= segments; s++) {
      points.push({
        x: 40 + (s * (CANVAS_W - 80)) / segments,
        y: yBase + (Math.random() - 0.5) * 30,
      });
    }
    traces.push({ points, completed: false });
  }
  return traces;
}

export function SoldarCircuitoTask({ onComplete }: TaskComponentProps) {
  const [traces] = useState<Trace[]>(() => generateTraces());
  const [activeTrace, setActiveTrace] = useState(0);
  const [soldering, setSoldering] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 along current trace
  const [completed, setCompleted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const completedRef = useRef(false);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    function draw() {
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Draw PCB grid pattern
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 1;
      for (let x = 0; x < CANVAS_W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke(); }
      for (let y = 0; y < CANVAS_H; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke(); }

      for (let t = 0; t < traces.length; t++) {
        const trace = traces[t];
        const pts = trace.points;
        const isActive = t === activeTrace && !trace.completed;
        const color = trace.completed ? '#4ade80' : isActive ? '#44aaff' : '#2a2a55';

        // Draw trace path
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = trace.completed ? 4 : 3;
        ctx.stroke();

        // Draw progress on active trace
        if (isActive && progress > 0) {
          const totalLen = getTotalLength(pts);
          const targetLen = progress * totalLen;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          let cumLen = 0;
          for (let i = 1; i < pts.length; i++) {
            const dx = pts[i].x - pts[i - 1].x;
            const dy = pts[i].y - pts[i - 1].y;
            const segLen = Math.sqrt(dx * dx + dy * dy);
            if (cumLen + segLen >= targetLen) {
              const frac = (targetLen - cumLen) / segLen;
              ctx.lineTo(pts[i - 1].x + dx * frac, pts[i - 1].y + dy * frac);
              break;
            }
            ctx.lineTo(pts[i].x, pts[i].y);
            cumLen += segLen;
          }
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 5;
          ctx.stroke();
        }

        // Break indicator (gap in the middle of each uncompleted trace)
        if (!trace.completed) {
          const midIdx = Math.floor(pts.length / 2);
          ctx.beginPath();
          ctx.arc(pts[midIdx].x, pts[midIdx].y, 6, 0, Math.PI * 2);
          ctx.fillStyle = isActive ? '#ef4444' : '#ef444466';
          ctx.fill();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    }
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [traces, activeTrace, progress]);

  function getTotalLength(pts: { x: number; y: number }[]): number {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
  }

  function getPointOnPath(pts: { x: number; y: number }[], t: number): { x: number; y: number } {
    const totalLen = getTotalLength(pts);
    const targetLen = t * totalLen;
    let cumLen = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      const segLen = Math.sqrt(dx * dx + dy * dy);
      if (cumLen + segLen >= targetLen) {
        const frac = (targetLen - cumLen) / segLen;
        return { x: pts[i - 1].x + dx * frac, y: pts[i - 1].y + dy * frac };
      }
      cumLen += segLen;
    }
    return pts[pts.length - 1];
  }

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!soldering || completedRef.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (CANVAS_W / rect.width);
    const my = (e.clientY - rect.top) * (CANVAS_H / rect.height);

    const trace = traces[activeTrace];
    const pts = trace.points;
    const expectedPt = getPointOnPath(pts, progress + 0.02);
    const dx = mx - expectedPt.x;
    const dy = my - expectedPt.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > TRACE_TOLERANCE) {
      // Deviated — reset this trace
      setSoldering(false);
      setProgress(0);
      return;
    }

    const newProgress = Math.min(1, progress + 0.015);
    setProgress(newProgress);

    if (newProgress >= 0.98) {
      trace.completed = true;
      setSoldering(false);
      setProgress(0);
      const nextTrace = traces.findIndex((t, i) => i > activeTrace && !t.completed);
      if (nextTrace >= 0) {
        setActiveTrace(nextTrace);
      } else if (traces.every(t => t.completed)) {
        completedRef.current = true;
        setCompleted(true);
        setTimeout(onComplete, 500);
      }
    }
  }, [soldering, traces, activeTrace, progress, onComplete]);

  const handleMouseDown = useCallback(() => {
    if (completedRef.current) return;
    setSoldering(true);
    setProgress(0);
  }, []);

  const handleMouseUp = useCallback(() => {
    setSoldering(false);
    if (progress < 0.98) setProgress(0);
  }, [progress]);

  const doneCount = traces.filter(t => t.completed).length;

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Solder Circuit</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 16 }}>
        Drag along each broken trace to solder it
      </div>

      <div style={{ fontSize: 14, color: '#44aaff', fontWeight: 600, marginBottom: 12 }}>
        Traces: {doneCount}/{TRACE_COUNT}
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_W} height={CANVAS_H}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          border: `1px solid ${completed ? '#4ade80' : '#2a2a45'}`,
          borderRadius: 12, cursor: completed ? 'default' : 'crosshair',
          width: '100%', maxWidth: CANVAS_W,
        }}
      />

      {completed && (
        <div style={{ marginTop: 16, fontSize: 18, fontWeight: 700, color: '#4ade80' }}>
          Circuit repaired!
        </div>
      )}
    </div>
  );
}
