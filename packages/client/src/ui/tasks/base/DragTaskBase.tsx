import { useState, useRef, useCallback } from 'react';

export interface DragTaskBaseProps {
  title: string;
  subtitle: string;
  trackWidth?: number;
  cardWidth?: number;
  successThreshold?: number; // 0-1
  minTime?: number; // ms
  maxTime?: number; // ms
  onComplete: () => void;
  onCancel: () => void;
}

export function DragTaskBase({
  title, subtitle, trackWidth = 440, cardWidth = 100,
  successThreshold = 0.8, minTime = 300, maxTime = 3000,
  onComplete,
}: DragTaskBaseProps) {
  const [cardX, setCardX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [feedback, setFeedback] = useState('');
  const dragStartRef = useRef(0);
  const dragStartXRef = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const maxTravel = trackWidth - cardWidth;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (completed) return;
    setDragging(true);
    dragStartRef.current = Date.now();
    dragStartXRef.current = e.clientX - cardX;
    setFeedback('');
  }, [cardX, completed]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || completed) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relativeX = e.clientX - dragStartXRef.current;
    setCardX(Math.max(0, Math.min(maxTravel, relativeX)));
  }, [dragging, completed, maxTravel]);

  const handleMouseUp = useCallback(() => {
    if (!dragging || completed) return;
    setDragging(false);

    const progress = cardX / maxTravel;
    const elapsed = Date.now() - dragStartRef.current;

    if (progress >= successThreshold) {
      if (elapsed < minTime) {
        setFeedback('Too fast! Drag slower.');
        setCardX(0);
      } else if (elapsed > maxTime) {
        setFeedback('Too slow! Drag faster.');
        setCardX(0);
      } else {
        setCompleted(true);
        setFeedback('');
        setTimeout(onComplete, 500);
      }
    } else {
      setCardX(0);
    }
  }, [dragging, completed, cardX, maxTravel, successThreshold, minTime, maxTime, onComplete]);

  const pct = Math.round((cardX / maxTravel) * 100);

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}
      onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
    >
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 24 }}>{subtitle}</div>

      {/* Track */}
      <div ref={trackRef} style={{
        width: trackWidth, height: 60, background: '#0a0a12',
        border: '1px solid #2a2a45', borderRadius: 12,
        position: 'relative', margin: '0 auto 16px', overflow: 'hidden',
      }}>
        {/* Success zone indicator */}
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: `${(1 - successThreshold) * 100}%`,
          background: completed ? 'rgba(74,222,128,0.15)' : 'rgba(68,170,255,0.08)',
          borderLeft: `1px dashed ${completed ? '#4ade80' : '#44aaff44'}`,
        }} />

        {/* Card */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            position: 'absolute', left: cardX, top: 6, bottom: 6,
            width: cardWidth, borderRadius: 8,
            background: completed ? '#4ade80' : dragging ? '#44aaff' : '#2a2a55',
            border: `2px solid ${completed ? '#4ade80' : '#44aaff'}`,
            cursor: completed ? 'default' : 'grab',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700,
            color: completed ? '#000' : '#e2e2f0',
            transition: dragging ? 'none' : 'left 0.3s ease',
          }}
        >
          {completed ? 'OK' : `${pct}%`}
        </div>
      </div>

      {feedback && (
        <div style={{ fontSize: 14, color: '#ef4444', fontWeight: 600, marginBottom: 12 }}>
          {feedback}
        </div>
      )}

      {completed ? (
        <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80' }}>Accepted!</div>
      ) : (
        <div style={{ fontSize: 13, color: '#6b6b8a' }}>
          Drag from left to right at the right speed
        </div>
      )}
    </div>
  );
}
