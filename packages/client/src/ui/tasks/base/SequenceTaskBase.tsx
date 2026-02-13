import { useState } from 'react';

export interface SequenceStep {
  label: string;
  icon: string;
  buttonText?: string;
}

export interface SequenceTaskBaseProps {
  title: string;
  subtitle: string;
  steps: SequenceStep[];
  autoCompleteLastStep?: number; // ms — auto-complete last step after delay
  onComplete: () => void;
  onCancel: () => void;
}

export function SequenceTaskBase({
  title, subtitle, steps, autoCompleteLastStep, onComplete,
}: SequenceTaskBaseProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(false);

  function advanceStep() {
    if (completed) return;
    const next = currentStep + 1;
    if (next >= steps.length) {
      if (autoCompleteLastStep && autoCompleteLastStep > 0) {
        setCurrentStep(next - 1); // stay on last step visually
        setTimeout(() => {
          setCompleted(true);
          setTimeout(onComplete, 400);
        }, autoCompleteLastStep);
      } else {
        setCompleted(true);
        setTimeout(onComplete, 400);
      }
    } else {
      setCurrentStep(next);
    }
  }

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 24 }}>{subtitle}</div>

      {/* Progress dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            width: 12, height: 12, borderRadius: '50%',
            background: i < currentStep ? '#4ade80' : i === currentStep ? '#44aaff' : '#2a2a45',
            border: `2px solid ${i < currentStep ? '#4ade80' : i === currentStep ? '#44aaff' : '#2a2a45'}`,
            transition: 'all 0.3s',
          }} />
        ))}
      </div>

      {/* Current step display */}
      {!completed && currentStep < steps.length && (
        <div style={{
          background: '#0a0a12', border: '1px solid #2a2a45', borderRadius: 12,
          padding: 24, marginBottom: 24,
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{steps[currentStep].icon}</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#e2e2f0' }}>
            {steps[currentStep].label}
          </div>
        </div>
      )}

      {completed ? (
        <div style={{ fontSize: 18, fontWeight: 700, color: '#4ade80' }}>
          Concluído!
        </div>
      ) : (
        <button onClick={advanceStep} style={{
          width: '100%', padding: '14px 32px', fontSize: 16, fontWeight: 700,
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          border: '2px solid #44aaff', borderRadius: 12,
          background: 'rgba(68,170,255,0.12)', color: '#44aaff',
          cursor: 'pointer', transition: 'all 0.2s',
        }}>
          {steps[currentStep]?.buttonText ?? steps[currentStep]?.label ?? 'Próximo'}
        </button>
      )}
    </div>
  );
}
