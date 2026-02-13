import type { CSSProperties } from 'react';
import { useAudioStore } from '../stores/audio-store.js';
import * as s from './styles.js';

// ── Volume slider row ──

function VolumeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={sliderRow}>
      <span style={sliderLabel}>{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={sliderInput}
      />
      <span style={sliderValue}>{Math.round(value * 100)}%</span>
    </div>
  );
}

// ── Component ──

export function SoundSettings() {
  const masterVolume = useAudioStore((st) => st.masterVolume);
  const sfxVolume = useAudioStore((st) => st.sfxVolume);
  const ambientVolume = useAudioStore((st) => st.ambientVolume);
  const setMasterVolume = useAudioStore((st) => st.setMasterVolume);
  const setSfxVolume = useAudioStore((st) => st.setSfxVolume);
  const setAmbientVolume = useAudioStore((st) => st.setAmbientVolume);

  return (
    <div style={container}>
      <div style={header}>Sound</div>
      <VolumeSlider label="Master" value={masterVolume} onChange={setMasterVolume} />
      <VolumeSlider label="Effects" value={sfxVolume} onChange={setSfxVolume} />
      <VolumeSlider label="Ambient" value={ambientVolume} onChange={setAmbientVolume} />
    </div>
  );
}

// ── Styles ──

const container: CSSProperties = {
  marginTop: 20,
  borderTop: `1px solid ${s.colors.border}`,
  paddingTop: 16,
};

const header: CSSProperties = {
  fontSize: 13,
  color: s.colors.textMuted,
  marginBottom: 12,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
};

const sliderRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  marginBottom: 8,
  gap: 10,
};

const sliderLabel: CSSProperties = {
  width: 58,
  fontSize: 12,
  color: s.colors.textMuted,
  flexShrink: 0,
};

const sliderInput: CSSProperties = {
  flex: 1,
  height: 4,
  accentColor: s.colors.primary,
  cursor: 'pointer',
};

const sliderValue: CSSProperties = {
  width: 34,
  fontSize: 11,
  color: s.colors.textMuted,
  textAlign: 'right',
  flexShrink: 0,
};
