import { useState, useEffect, useCallback, useRef } from 'react';

export interface SimonTaskBaseProps {
  title: string;
  subtitle: string;
  sequenceLength: number;
  gridCols?: number;
  gridRows?: number;
  showDurationMs?: number;
  onComplete: () => void;
  onCancel: () => void;
}

const BUTTON_COLORS = ['#ef4444', '#3b82f6', '#eab308', '#22c55e', '#a855f7', '#f97316'];

export function SimonTaskBase({
  title, subtitle, sequenceLength, gridCols = 3, gridRows = 2,
  showDurationMs = 600, onComplete,
}: SimonTaskBaseProps) {
  const totalButtons = gridCols * gridRows;
  const [sequence, setSequence] = useState<number[]>([]);
  const [phase, setPhase] = useState<'showing' | 'playing'>('showing');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [playerInput, setPlayerInput] = useState<number[]>([]);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState(false);
  const completedRef = useRef(false);

  // Generate sequence on mount
  useEffect(() => {
    const seq: number[] = [];
    for (let i = 0; i < sequenceLength; i++) {
      seq.push(Math.floor(Math.random() * totalButtons));
    }
    setSequence(seq);
  }, [sequenceLength, totalButtons]);

  // Show sequence animation
  useEffect(() => {
    if (phase !== 'showing' || sequence.length === 0) return;
    let step = 0;
    const interval = setInterval(() => {
      if (step < sequence.length) {
        setHighlightIdx(sequence[step]);
        setTimeout(() => setHighlightIdx(-1), showDurationMs * 0.7);
        step++;
      } else {
        clearInterval(interval);
        setPhase('playing');
        setPlayerInput([]);
      }
    }, showDurationMs);
    return () => clearInterval(interval);
  }, [phase, sequence, showDurationMs]);

  const handleButtonClick = useCallback((btnIdx: number) => {
    if (completedRef.current || phase !== 'playing') return;

    const nextInput = [...playerInput, btnIdx];
    const stepIdx = nextInput.length - 1;

    if (sequence[stepIdx] !== btnIdx) {
      // Wrong — show error, replay sequence
      setError(true);
      setTimeout(() => {
        setError(false);
        setPlayerInput([]);
        setPhase('showing');
      }, 800);
      return;
    }

    setPlayerInput(nextInput);

    if (nextInput.length === sequence.length) {
      completedRef.current = true;
      setCompleted(true);
      setTimeout(onComplete, 500);
    }
  }, [phase, playerInput, sequence, onComplete]);

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 16 }}>{subtitle}</div>

      {/* Progress dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
        {sequence.map((_, i) => (
          <div key={i} style={{
            width: 10, height: 10, borderRadius: '50%',
            background: i < playerInput.length ? '#4ade80' : '#2a2a45',
            transition: 'background 0.2s',
          }} />
        ))}
      </div>

      {/* Status */}
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, height: 20 }}>
        {completed
          ? <span style={{ color: '#4ade80' }}>Sequência correta!</span>
          : error
            ? <span style={{ color: '#ef4444' }}>Ordem incorreta! Tente novamente</span>
            : phase === 'showing'
              ? <span style={{ color: '#eab308' }}>Memorize a sequência...</span>
              : <span style={{ color: '#44aaff' }}>Repita a sequência</span>
        }
      </div>

      {/* Button grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gap: 12,
        maxWidth: gridCols * 80,
        margin: '0 auto',
      }}>
        {Array.from({ length: totalButtons }, (_, i) => {
          const isHighlighted = highlightIdx === i;
          const color = BUTTON_COLORS[i % BUTTON_COLORS.length];
          return (
            <button
              key={i}
              onClick={() => handleButtonClick(i)}
              disabled={phase !== 'playing' || completed}
              style={{
                width: 64, height: 64, borderRadius: 12,
                border: `2px solid ${isHighlighted ? color : '#2a2a45'}`,
                background: isHighlighted ? `${color}44` : '#0a0a12',
                cursor: phase === 'playing' && !completed ? 'pointer' : 'default',
                transition: 'all 0.15s',
                boxShadow: isHighlighted ? `0 0 16px ${color}88` : 'none',
              }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: '50%', margin: '0 auto',
                background: isHighlighted ? color : `${color}44`,
                transition: 'all 0.15s',
              }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
