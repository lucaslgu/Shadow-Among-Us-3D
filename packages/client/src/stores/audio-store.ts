import { create } from 'zustand';
import { setSfxMasterGain } from '../audio/sound-manager.js';

const STORAGE_KEY = 'shadow_audio_settings';

interface AudioSettings {
  masterVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  setMasterVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  setAmbientVolume: (v: number) => void;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        masterVolume: typeof parsed.masterVolume === 'number' ? parsed.masterVolume : 0.8,
        sfxVolume: typeof parsed.sfxVolume === 'number' ? parsed.sfxVolume : 0.8,
        ambientVolume: typeof parsed.ambientVolume === 'number' ? parsed.ambientVolume : 0.6,
      };
    }
  } catch { /* ignore */ }
  return { masterVolume: 0.8, sfxVolume: 0.8, ambientVolume: 0.6 };
}

function saveSettings(s: { masterVolume: number; sfxVolume: number; ambientVolume: number }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

const defaults = loadSettings();

export const useAudioStore = create<AudioSettings>((set) => ({
  ...defaults,

  setMasterVolume: (v) => set((s) => {
    saveSettings({ masterVolume: v, sfxVolume: s.sfxVolume, ambientVolume: s.ambientVolume });
    return { masterVolume: v };
  }),

  setSfxVolume: (v) => set((s) => {
    saveSettings({ masterVolume: s.masterVolume, sfxVolume: v, ambientVolume: s.ambientVolume });
    return { sfxVolume: v };
  }),

  setAmbientVolume: (v) => set((s) => {
    saveSettings({ masterVolume: s.masterVolume, sfxVolume: s.sfxVolume, ambientVolume: v });
    return { ambientVolume: v };
  }),
}));

// Keep sound-manager SFX gain in sync with store
useAudioStore.subscribe((state) => {
  setSfxMasterGain(state.masterVolume * state.sfxVolume);
});

// Apply initial stored volume
setSfxMasterGain(defaults.masterVolume * defaults.sfxVolume);
