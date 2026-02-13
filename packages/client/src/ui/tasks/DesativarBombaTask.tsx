import { useState, useRef, useEffect, useCallback } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

const WIRE_COUNT = 4;
const COUNTDOWN_MS = 3000;
const WIRE_COLORS = ['#ef4444', '#3b82f6', '#eab308', '#22c55e'];

export function DesativarBombaTask({ onComplete }: TaskComponentProps) {
  const [sequence] = useState(() =>
    [...Array(WIRE_COUNT).keys()].sort(() => Math.random() - 0.5)
  );
  const [phase, setPhase] = useState<'showing' | 'cutting'>('showing');
  const [showStep, setShowStep] = useState(0);
  const [cutStep, setCutStep] = useState(0);
  const [countdown, setCountdown] = useState(COUNTDOWN_MS);
  const [error, setError] = useState(false);
  const [completed, setCompleted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  // Show sequence phase
  useEffect(() => {
    if (phase !== 'showing') return;
    if (showStep >= WIRE_COUNT) {
      setTimeout(() => {
        setPhase('cutting');
        setCountdown(COUNTDOWN_MS);
      }, 500);
      return;
    }
    const timer = setTimeout(() => setShowStep(s => s + 1), 800);
    return () => clearTimeout(timer);
  }, [phase, showStep]);

  // Countdown timer during cutting
  useEffect(() => {
    if (phase !== 'cutting' || completedRef.current) return;
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 100) {
          // Time's up — restart
          setError(true);
          setPhase('showing');
          setShowStep(0);
          setCutStep(0);
          setTimeout(() => setError(false), 600);
          return COUNTDOWN_MS;
        }
        return prev - 100;
      });
    }, 100);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  const handleCut = useCallback((wireIdx: number) => {
    if (completedRef.current || phase !== 'cutting') return;

    if (sequence[cutStep] !== wireIdx) {
      // Wrong wire — restart
      setError(true);
      setPhase('showing');
      setShowStep(0);
      setCutStep(0);
      setCountdown(COUNTDOWN_MS);
      setTimeout(() => setError(false), 600);
      return;
    }

    const newStep = cutStep + 1;
    setCutStep(newStep);
    setCountdown(COUNTDOWN_MS); // Reset countdown for next wire

    if (newStep >= WIRE_COUNT) {
      completedRef.current = true;
      setCompleted(true);
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeout(onComplete, 500);
    }
  }, [phase, cutStep, sequence, onComplete]);

  const countdownPct = Math.round((countdown / COUNTDOWN_MS) * 100);

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, color: '#ef4444' }}>Defuse Bomb</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 16 }}>
        {phase === 'showing' ? 'Memorize the wire order' : 'Cut the wires in the memorized order!'}
      </div>

      {error && (
        <div style={{ fontSize: 14, color: '#ef4444', fontWeight: 600, marginBottom: 8 }}>
          Wrong! Sequence restarted
        </div>
      )}

      {/* Progress */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
        {sequence.map((_, i) => (
          <div key={i} style={{
            width: 12, height: 12, borderRadius: '50%',
            background: phase === 'showing' && i < showStep ? '#eab308'
              : i < cutStep ? '#4ade80' : '#2a2a45',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>

      {/* Countdown bar */}
      {phase === 'cutting' && !completed && (
        <div style={{
          width: '100%', height: 8, background: '#0a0a12',
          border: '1px solid #2a2a45', borderRadius: 4, marginBottom: 16, overflow: 'hidden',
        }}>
          <div style={{
            width: `${countdownPct}%`, height: '100%',
            background: countdownPct > 30 ? '#eab308' : '#ef4444',
            transition: 'width 0.1s linear',
          }} />
        </div>
      )}

      {/* Wires */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 24 }}>
        {Array.from({ length: WIRE_COUNT }, (_, i) => {
          const isCut = phase === 'cutting' && sequence.indexOf(i) < cutStep;
          const isShowHighlight = phase === 'showing' && showStep > 0 && sequence[showStep - 1] === i;
          const showOrder = phase === 'showing' && sequence.indexOf(i) < showStep
            ? sequence.indexOf(i) + 1 : null;

          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => handleCut(i)}
                disabled={phase !== 'cutting' || completed || isCut}
                style={{
                  width: 72, height: 100, borderRadius: 12,
                  background: isCut ? '#1a1a2e' : isShowHighlight ? `${WIRE_COLORS[i]}66` : `${WIRE_COLORS[i]}33`,
                  border: `3px solid ${isCut ? '#2a2a45' : isShowHighlight ? '#fff' : WIRE_COLORS[i]}`,
                  cursor: phase === 'cutting' && !isCut && !completed ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', gap: 4,
                  transition: 'all 0.2s',
                  opacity: isCut ? 0.3 : 1,
                }}
              >
                <div style={{
                  width: 8, height: 60, borderRadius: 4,
                  background: isCut ? '#2a2a45' : WIRE_COLORS[i],
                }} />
                {showOrder !== null && (
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#eab308' }}>{showOrder}</div>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, color: completed ? '#4ade80' : '#6b6b8a' }}>
        {completed ? 'Bomb defused!' : phase === 'cutting' ? `${cutStep}/${WIRE_COUNT} cut` : ''}
      </div>
    </div>
  );
}
