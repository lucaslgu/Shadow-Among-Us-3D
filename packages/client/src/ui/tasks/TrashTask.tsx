import { useState, useCallback } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

const STEPS = [
  { label: 'Pull the lever to the left', icon: '\u2190', buttonText: 'Left' },
  { label: 'Pull down', icon: '\u2193', buttonText: 'Down' },
  { label: 'Release', icon: '\u25CB', buttonText: 'Release' },
];

export function TrashTask({ onComplete, onCancel }: TaskComponentProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(false);

  const handleStepClick = useCallback(
    (stepIndex: number) => {
      if (completed || stepIndex !== currentStep) return;

      const nextStep = currentStep + 1;
      if (nextStep >= STEPS.length) {
        setCompleted(true);
        setTimeout(onComplete, 500);
      } else {
        setCurrentStep(nextStep);
      }
    },
    [currentStep, completed, onComplete],
  );

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      {/* Title */}
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
        Empty Trash
      </div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 32 }}>
        Follow the instructions in order
      </div>

      {/* Steps indicator */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 24,
        }}
      >
        {STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background:
                i < currentStep || completed
                  ? '#4ade80'
                  : i === currentStep
                    ? '#44aaff'
                    : '#2a2a45',
              border: `1px solid ${
                i < currentStep || completed
                  ? '#4ade80'
                  : i === currentStep
                    ? '#44aaff'
                    : '#2a2a45'
              }`,
              transition: 'all 0.3s',
            }}
          />
        ))}
      </div>

      {/* Visual container */}
      <div
        style={{
          width: '100%',
          height: 140,
          background: '#0a0a12',
          border: '1px solid #2a2a45',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        }}
      >
        {completed ? (
          <div style={{ fontSize: 20, fontWeight: 700, color: '#4ade80' }}>
            Trash emptied!
          </div>
        ) : (
          <div>
            <div
              style={{
                fontSize: 48,
                color: '#44aaff',
                marginBottom: 8,
              }}
            >
              {STEPS[currentStep].icon}
            </div>
            <div style={{ fontSize: 14, color: '#e2e2f0', fontWeight: 600 }}>
              Step {currentStep + 1} of {STEPS.length}
            </div>
            <div style={{ fontSize: 13, color: '#6b6b8a', marginTop: 4 }}>
              {STEPS[currentStep].label}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12 }}>
        {STEPS.map((step, i) => {
          const isCurrent = i === currentStep && !completed;
          const isDone = i < currentStep || completed;

          return (
            <button
              key={i}
              onClick={() => handleStepClick(i)}
              disabled={!isCurrent}
              style={{
                flex: 1,
                padding: '14px 8px',
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "'Segoe UI', system-ui, sans-serif",
                border: `2px solid ${
                  isDone ? '#4ade80' : isCurrent ? '#44aaff' : '#1a1a2e'
                }`,
                borderRadius: 10,
                background: isDone
                  ? 'rgba(74, 222, 128, 0.12)'
                  : isCurrent
                    ? 'rgba(68, 170, 255, 0.12)'
                    : 'rgba(10, 10, 18, 0.5)',
                color: isDone
                  ? '#4ade80'
                  : isCurrent
                    ? '#44aaff'
                    : '#3a3a55',
                cursor: isCurrent ? 'pointer' : 'default',
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 24 }}>{step.icon}</span>
              <span>{step.buttonText}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
