import { useState, useRef, useCallback } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

const TARGET_TOLERANCE = 15; // degrees

export function AlinharAntenaTask({ onComplete }: TaskComponentProps) {
  const [targetAngle] = useState(() => Math.floor(Math.random() * 360));
  const [currentAngle, setCurrentAngle] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dialRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);

  const handleMouseDown = useCallback(() => {
    if (completedRef.current) return;
    setDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || completedRef.current || !dialRef.current) return;
    const rect = dialRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI) + 90;
    const normalized = ((angle % 360) + 360) % 360;
    setCurrentAngle(normalized);
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    if (!dragging || completedRef.current) return;
    setDragging(false);

    // Check if within tolerance
    let diff = Math.abs(currentAngle - targetAngle);
    if (diff > 180) diff = 360 - diff;
    if (diff <= TARGET_TOLERANCE) {
      completedRef.current = true;
      setCompleted(true);
      setTimeout(onComplete, 500);
    }
  }, [dragging, currentAngle, targetAngle, onComplete]);

  let diff = Math.abs(currentAngle - targetAngle);
  if (diff > 180) diff = 360 - diff;
  const isClose = diff <= TARGET_TOLERANCE;

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}
      onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
    >
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Align Antenna</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 24 }}>
        Turn the dial to align with the target marker
      </div>

      <div ref={dialRef} style={{
        width: 220, height: 220, borderRadius: '50%',
        background: '#0a0a12', border: `3px solid ${completed ? '#4ade80' : '#2a2a45'}`,
        position: 'relative', margin: '0 auto 24px',
      }}>
        {/* Target marker */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          width: 4, height: 90, background: '#4ade80',
          transformOrigin: '50% 0%',
          transform: `translate(-50%, 0) rotate(${targetAngle}deg)`,
          borderRadius: 2, opacity: 0.6,
        }} />

        {/* Current needle (draggable) */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            position: 'absolute', left: '50%', top: '50%',
            width: 6, height: 85, background: isClose ? '#4ade80' : '#44aaff',
            transformOrigin: '50% 0%',
            transform: `translate(-50%, 0) rotate(${currentAngle}deg)`,
            borderRadius: 3, cursor: completed ? 'default' : 'grab',
            boxShadow: `0 0 8px ${isClose ? '#4ade80' : '#44aaff'}`,
          }}
        />

        {/* Center dot */}
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          width: 16, height: 16, borderRadius: '50%',
          background: '#44aaff', transform: 'translate(-50%, -50%)',
        }} />
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: completed ? '#4ade80' : '#6b6b8a' }}>
        {completed ? 'Antenna aligned!' : 'Drag the blue needle to the green marker'}
      </div>
    </div>
  );
}
