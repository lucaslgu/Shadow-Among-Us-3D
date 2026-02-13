import { useState, useRef, useCallback } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

const TRACK_WIDTH = 440;
const CARD_WIDTH = 100;
const SUCCESS_THRESHOLD = 0.8; // must drag past 80% of track
const MIN_TIME = 300; // ms - too fast
const MAX_TIME = 3000; // ms - too slow

export function CardReaderTask({ onComplete, onCancel }: TaskComponentProps) {
  const [cardX, setCardX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'dragging' | 'success' | 'fail'>('idle');
  const [failMessage, setFailMessage] = useState('');
  const [completed, setCompleted] = useState(false);

  const dragStartXRef = useRef(0);
  const dragStartTimeRef = useRef(0);
  const cardStartXRef = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const maxCardX = TRACK_WIDTH - CARD_WIDTH;

  const resetCard = useCallback(() => {
    setCardX(0);
    setDragging(false);
    setStatus('idle');
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (completed || status === 'success') return;

      setDragging(true);
      setStatus('dragging');
      setFailMessage('');
      dragStartXRef.current = e.clientX;
      dragStartTimeRef.current = Date.now();
      cardStartXRef.current = cardX;

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - dragStartXRef.current;
        const newX = Math.max(0, Math.min(maxCardX, cardStartXRef.current + dx));
        setCardX(newX);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        setDragging(false);

        // Get final card position
        const trackEl = trackRef.current;
        if (!trackEl) {
          resetCard();
          return;
        }

        // Calculate final position ratio
        setCardX((currentX) => {
          const ratio = currentX / maxCardX;
          const elapsed = Date.now() - dragStartTimeRef.current;

          if (ratio >= SUCCESS_THRESHOLD) {
            // Check speed
            if (elapsed < MIN_TIME) {
              setStatus('fail');
              setFailMessage('Too fast! Drag slower.');
              setTimeout(resetCard, 1200);
            } else if (elapsed > MAX_TIME) {
              setStatus('fail');
              setFailMessage('Too slow! Drag faster.');
              setTimeout(resetCard, 1200);
            } else {
              // Success!
              setStatus('success');
              setCompleted(true);
              setTimeout(onComplete, 600);
            }
          } else {
            // Didn't drag far enough
            setStatus('fail');
            setFailMessage('Drag all the way to the end.');
            setTimeout(resetCard, 800);
          }

          return currentX;
        });
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [cardX, completed, maxCardX, onComplete, resetCard, status],
  );

  const progressPct = Math.round((cardX / maxCardX) * 100);
  const isInSuccessZone = cardX / maxCardX >= SUCCESS_THRESHOLD;

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      {/* Title */}
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
        Card Reader
      </div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 32 }}>
        Drag the card from left to right
      </div>

      {/* Card track */}
      <div
        ref={trackRef}
        style={{
          width: TRACK_WIDTH,
          height: 80,
          background: '#0a0a12',
          border: `1px solid ${status === 'success' ? '#4ade80' : status === 'fail' ? '#ef4444' : '#2a2a45'}`,
          borderRadius: 12,
          position: 'relative',
          margin: '0 auto 24px auto',
          overflow: 'hidden',
        }}
      >
        {/* Track groove */}
        <div
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            height: 6,
            background: '#1a1a2e',
            borderRadius: 3,
          }}
        />

        {/* Success zone indicator */}
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: `${(1 - SUCCESS_THRESHOLD) * 100}%`,
            background: status === 'success'
              ? 'rgba(74, 222, 128, 0.1)'
              : 'rgba(68, 170, 255, 0.05)',
            borderLeft: `1px dashed ${status === 'success' ? '#4ade80' : 'rgba(68, 170, 255, 0.2)'}`,
          }}
        />

        {/* Card */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            position: 'absolute',
            left: cardX,
            top: 8,
            bottom: 8,
            width: CARD_WIDTH,
            background: status === 'success'
              ? 'linear-gradient(135deg, #1a4a2a, #0d3a1d)'
              : status === 'fail'
                ? 'linear-gradient(135deg, #4a1a1a, #3a0d0d)'
                : dragging
                  ? 'linear-gradient(135deg, #1a2a4a, #0d1d3a)'
                  : 'linear-gradient(135deg, #1e1e35, #12122a)',
            border: `2px solid ${
              status === 'success'
                ? '#4ade80'
                : status === 'fail'
                  ? '#ef4444'
                  : dragging
                    ? '#44aaff'
                    : '#3a3a55'
            }`,
            borderRadius: 8,
            cursor: completed ? 'default' : 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            transition: dragging ? 'none' : 'left 0.3s ease',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 2,
              color: status === 'success'
                ? '#4ade80'
                : status === 'fail'
                  ? '#ef4444'
                  : '#e2e2f0',
              fontFamily: "'Courier New', monospace",
            }}
          >
            ACCESS
          </div>
          <div
            style={{
              width: 40,
              height: 3,
              background: status === 'success' ? '#4ade80' : '#44aaff',
              borderRadius: 2,
              marginTop: 6,
            }}
          />
        </div>
      </div>

      {/* Status message */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: status === 'success'
            ? '#4ade80'
            : status === 'fail'
              ? '#ef4444'
              : dragging
                ? '#44aaff'
                : '#6b6b8a',
          minHeight: 20,
          transition: 'color 0.2s',
        }}
      >
        {status === 'success'
          ? 'Card accepted!'
          : status === 'fail'
            ? failMessage
            : dragging
              ? `${progressPct}%${isInSuccessZone ? ' - Release now!' : ''}`
              : 'Click and drag the card'}
      </div>

      {/* Speed guide */}
      <div
        style={{
          fontSize: 11,
          color: '#3a3a55',
          marginTop: 12,
          fontFamily: "'Courier New', monospace",
        }}
      >
        Speed: not too fast, not too slow
      </div>
    </div>
  );
}
