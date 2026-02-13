import { useState, useEffect, useCallback, useRef } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

function generateTargetPattern(): boolean[] {
  // Generate random pattern with at least 2 and at most 4 switches on
  const pattern: boolean[] = [];
  for (let i = 0; i < 5; i++) {
    pattern.push(Math.random() > 0.5);
  }
  // Ensure at least 2 are on
  const onCount = pattern.filter(Boolean).length;
  if (onCount < 2) {
    const offIndices = pattern
      .map((v, i) => (!v ? i : -1))
      .filter((i) => i >= 0);
    for (let i = 0; i < 2 - onCount; i++) {
      pattern[offIndices[i]] = true;
    }
  }
  return pattern;
}

export function EnergyPanelTask({ onComplete, onCancel }: TaskComponentProps) {
  const [target] = useState<boolean[]>(() => generateTargetPattern());
  const [switches, setSwitches] = useState<boolean[]>([false, false, false, false, false]);
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);

  const toggleSwitch = useCallback(
    (index: number) => {
      if (completedRef.current) return;

      setSwitches((prev) => {
        const next = [...prev];
        next[index] = !next[index];
        return next;
      });
    },
    [],
  );

  // Check if switches match target pattern
  useEffect(() => {
    if (completedRef.current) return;

    const matches = switches.every((val, i) => val === target[i]);
    if (matches) {
      completedRef.current = true;
      setCompleted(true);
      setTimeout(onComplete, 600);
    }
  }, [switches, target, onComplete]);

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      {/* Title */}
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
        Energy Panel
      </div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 32 }}>
        Align the switches with the pattern
      </div>

      {/* Target pattern */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            fontSize: 12,
            color: '#6b6b8a',
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: 1,
            fontWeight: 600,
          }}
        >
          Target Pattern
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
          {target.map((on, i) => (
            <div
              key={`target-${i}`}
              style={{
                width: 48,
                height: 80,
                background: on ? 'rgba(74, 222, 128, 0.2)' : 'rgba(10, 10, 18, 0.8)',
                border: `2px solid ${on ? '#4ade80' : '#2a2a45'}`,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s',
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 40,
                  background: on ? '#4ade80' : '#1a1a2e',
                  borderRadius: 4,
                  transform: on ? 'rotate(0deg)' : 'rotate(180deg)',
                  transition: 'all 0.3s',
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: '#2a2a45',
          margin: '20px 0',
        }}
      />

      {/* Current switches (interactive) */}
      <div>
        <div
          style={{
            fontSize: 12,
            color: '#6b6b8a',
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: 1,
            fontWeight: 600,
          }}
        >
          Your Switches
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
          {switches.map((on, i) => {
            const matchesTarget = on === target[i];
            return (
              <button
                key={`switch-${i}`}
                onClick={() => toggleSwitch(i)}
                disabled={completed}
                style={{
                  width: 48,
                  height: 80,
                  background: on
                    ? completed && matchesTarget
                      ? 'rgba(74, 222, 128, 0.25)'
                      : 'rgba(68, 170, 255, 0.15)'
                    : 'rgba(10, 10, 18, 0.8)',
                  border: `2px solid ${
                    completed && matchesTarget
                      ? '#4ade80'
                      : on
                        ? '#44aaff'
                        : '#2a2a45'
                  }`,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: completed ? 'default' : 'pointer',
                  transition: 'all 0.2s',
                  padding: 0,
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 40,
                    background: on
                      ? completed
                        ? '#4ade80'
                        : '#44aaff'
                      : '#1a1a2e',
                    borderRadius: 4,
                    transform: on ? 'rotate(0deg)' : 'rotate(180deg)',
                    transition: 'all 0.2s',
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Status text */}
      <div
        style={{
          marginTop: 24,
          fontSize: 14,
          fontWeight: 600,
          color: completed ? '#4ade80' : '#6b6b8a',
          transition: 'color 0.3s',
        }}
      >
        {completed
          ? 'Panel aligned successfully!'
          : 'Click the switches to toggle'}
      </div>
    </div>
  );
}
