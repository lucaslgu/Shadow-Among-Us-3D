import { useState, useEffect, useCallback, useRef } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

function generateSequence(): number[] {
  // Pick 3 unique random buttons from 0-5 (representing buttons 1-6)
  const indices: number[] = [];
  while (indices.length < 3) {
    const idx = Math.floor(Math.random() * 6);
    if (!indices.includes(idx)) indices.push(idx);
  }
  return indices;
}

export function GenericTask({ onComplete, onCancel }: TaskComponentProps) {
  const [sequence] = useState<number[]>(() => generateSequence());
  const [showingSequence, setShowingSequence] = useState(true);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [clickProgress, setClickProgress] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [wrongClick, setWrongClick] = useState(false);
  const completedRef = useRef(false);
  const showTimeoutRef = useRef<number | null>(null);

  // Show sequence animation
  const showSequenceAnimation = useCallback(
    (seq: number[]) => {
      setShowingSequence(true);
      setClickProgress(0);
      setHighlightIndex(-1);

      // Show each button in sequence with delays
      const delays = [400, 1000, 1600, 2200]; // start, btn1, btn2, btn3

      for (let i = 0; i < seq.length; i++) {
        showTimeoutRef.current = window.setTimeout(() => {
          setHighlightIndex(seq[i]);
        }, delays[i + 1]);
      }

      // End the showing phase
      showTimeoutRef.current = window.setTimeout(() => {
        setHighlightIndex(-1);
        setShowingSequence(false);
      }, delays[seq.length] + 600);
    },
    [],
  );

  // Initial sequence display
  useEffect(() => {
    showSequenceAnimation(sequence);

    return () => {
      if (showTimeoutRef.current !== null) {
        // Clear all pending timeouts
        const id = showTimeoutRef.current;
        for (let i = id - 10; i <= id; i++) {
          clearTimeout(i);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleButtonClick = useCallback(
    (btnIndex: number) => {
      if (showingSequence || completedRef.current) return;

      const expectedBtn = sequence[clickProgress];
      if (btnIndex === expectedBtn) {
        // Correct click
        const next = clickProgress + 1;
        setClickProgress(next);

        if (next >= sequence.length) {
          // All buttons clicked correctly
          completedRef.current = true;
          setCompleted(true);
          setTimeout(onComplete, 600);
        }
      } else {
        // Wrong click - reset and show sequence again
        setWrongClick(true);
        setClickProgress(0);
        setTimeout(() => {
          setWrongClick(false);
          showSequenceAnimation(sequence);
        }, 800);
      }
    },
    [clickProgress, onComplete, sequence, showSequenceAnimation, showingSequence],
  );

  const isInSequence = (btnIndex: number) => sequence.includes(btnIndex);
  const isCurrentTarget = (btnIndex: number) =>
    !showingSequence && !completed && btnIndex === sequence[clickProgress];
  const isAlreadyClicked = (btnIndex: number) => {
    const idx = sequence.indexOf(btnIndex);
    return idx >= 0 && idx < clickProgress;
  };

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      {/* Title */}
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
        Terminal de Manuten&ccedil;&atilde;o
      </div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 24 }}>
        Pressione os bot&otilde;es na ordem correta
      </div>

      {/* Status area */}
      <div
        style={{
          padding: '10px 16px',
          background: '#0a0a12',
          border: `1px solid ${
            wrongClick ? '#ef4444' : completed ? '#4ade80' : '#2a2a45'
          }`,
          borderRadius: 8,
          marginBottom: 24,
          fontSize: 13,
          fontWeight: 600,
          color: wrongClick
            ? '#ef4444'
            : completed
              ? '#4ade80'
              : showingSequence
                ? '#fbbf24'
                : '#44aaff',
          fontFamily: "'Courier New', monospace",
          transition: 'all 0.2s',
        }}
      >
        {wrongClick
          ? 'Ordem incorreta! Observe a sequ\u00eancia novamente...'
          : completed
            ? 'Sequ\u00eancia completa!'
            : showingSequence
              ? 'Memorize a sequ\u00eancia...'
              : `Pressione o bot\u00e3o ${clickProgress + 1} de ${sequence.length}`}
      </div>

      {/* Progress dots */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 24,
        }}
      >
        {sequence.map((_, i) => (
          <div
            key={`dot-${i}`}
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background:
                i < clickProgress || completed
                  ? '#4ade80'
                  : i === clickProgress && !showingSequence
                    ? '#44aaff'
                    : '#2a2a45',
              border: `1px solid ${
                i < clickProgress || completed
                  ? '#4ade80'
                  : i === clickProgress && !showingSequence
                    ? '#44aaff'
                    : '#2a2a45'
              }`,
              transition: 'all 0.3s',
            }}
          />
        ))}
      </div>

      {/* Button grid 2x3 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          maxWidth: 360,
          margin: '0 auto',
        }}
      >
        {Array.from({ length: 6 }, (_, i) => {
          const isHighlighted = highlightIndex === i;
          const alreadyDone = isAlreadyClicked(i);
          const isTarget = isCurrentTarget(i);

          let bgColor = 'rgba(10, 10, 18, 0.8)';
          let borderColor = '#2a2a45';
          let textColor = '#e2e2f0';

          if (isHighlighted && showingSequence) {
            bgColor = 'rgba(251, 191, 36, 0.25)';
            borderColor = '#fbbf24';
            textColor = '#fbbf24';
          } else if (alreadyDone) {
            bgColor = 'rgba(74, 222, 128, 0.15)';
            borderColor = '#4ade80';
            textColor = '#4ade80';
          } else if (completed && isInSequence(i)) {
            bgColor = 'rgba(74, 222, 128, 0.15)';
            borderColor = '#4ade80';
            textColor = '#4ade80';
          } else if (wrongClick) {
            bgColor = 'rgba(239, 68, 68, 0.08)';
            borderColor = '#3a1a1a';
            textColor = '#6b6b8a';
          }

          return (
            <button
              key={i}
              onClick={() => handleButtonClick(i)}
              disabled={showingSequence || completed}
              style={{
                width: '100%',
                height: 72,
                fontSize: 24,
                fontWeight: 700,
                fontFamily: "'Courier New', monospace",
                background: bgColor,
                border: `2px solid ${borderColor}`,
                borderRadius: 10,
                color: textColor,
                cursor: showingSequence || completed ? 'default' : 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isHighlighted ? '0 0 16px rgba(251, 191, 36, 0.3)' : 'none',
              }}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
