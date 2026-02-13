import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { AtmosphereEra } from './ThreeBodyEnvironment.js';
import { useAudioStore } from '../stores/audio-store.js';

// ═══════════════════════════════════════════════════════════════
// Procedural audio — celestial body sounds for the Three-Body Problem
// Each sun has a distinct harmonic voice. Their interaction creates
// interference patterns and tidal resonance. No external audio files.
// ═══════════════════════════════════════════════════════════════

function expLerp(current: number, target: number, speed: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-speed * delta));
}

interface SimulationData {
  tidalForce: number;
  isSyzygy: boolean;
  sunPositions: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }, { x: number; y: number; z: number }];
  sunVelocities: [number, number, number];
  isBinary: boolean;
  isEjection: boolean;
}

// Each sun has a harmonic stack (fundamental + overtones) + filtered noise (stellar radiation)
interface SunVoice {
  fundamental: OscillatorNode;
  overtone2: OscillatorNode;
  overtone3: OscillatorNode;
  radiationNoise: AudioBufferSourceNode;
  radiationFilter: BiquadFilterNode;
  voiceGain: GainNode;
}

interface AudioNodes {
  ctx: AudioContext;
  masterGain: GainNode;

  // 3 sun voices
  suns: [SunVoice, SunVoice, SunVoice];

  // Tidal resonance — low rumble from gravitational interaction
  tidalOsc: OscillatorNode;
  tidalSubOsc: OscillatorNode;
  tidalGain: GainNode;

  // Syzygy alarm — dissonant chord when suns align
  syzygyOsc1: OscillatorNode;
  syzygyOsc2: OscillatorNode;
  syzygyGain: GainNode;

  // Wind (ice era)
  windNoise: AudioBufferSourceNode;
  windFilter: BiquadFilterNode;
  windGain: GainNode;

  // Fire crackle (inferno era)
  fireNoise: AudioBufferSourceNode;
  fireFilter: BiquadFilterNode;
  fireLfo: OscillatorNode;
  fireLfoGain: GainNode;
  fireGain: GainNode;

  // Gravity chaos — sub-bass drone + harmonic
  gravitySubOsc: OscillatorNode;
  gravityHarmonicOsc: OscillatorNode;
  gravityGain: GainNode;

  // Binary chirp — rising frequency as binary tightens
  binaryChirpOsc: OscillatorNode;
  binaryChirpGain: GainNode;

  // Ejection whoosh — filtered noise burst
  ejectionNoise: AudioBufferSourceNode;
  ejectionFilter: BiquadFilterNode;
  ejectionGain: GainNode;
}

function createWhiteNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function createLoopingNoise(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.start();
  return src;
}

// Base frequencies for each sun — chosen to create interesting beat patterns
// Sun 0 (orange/hot): low rumbling star
// Sun 1 (blue): higher, crystalline
// Sun 2 (white): mid-range, warm
const SUN_BASE_FREQS = [55, 82.5, 65]; // A1, E2, C2 — forms a power chord

function createSunVoice(ctx: AudioContext, noiseBuffer: AudioBuffer, masterGain: GainNode, baseFreq: number): SunVoice {
  const voiceGain = ctx.createGain();
  voiceGain.gain.value = 0;
  voiceGain.connect(masterGain);

  // Fundamental — sine for deep body
  const fundamental = ctx.createOscillator();
  fundamental.type = 'sine';
  fundamental.frequency.value = baseFreq;
  fundamental.connect(voiceGain);
  fundamental.start();

  // 2nd overtone — triangle for warmth (octave up)
  const overtone2 = ctx.createOscillator();
  overtone2.type = 'triangle';
  overtone2.frequency.value = baseFreq * 2;
  const ot2Gain = ctx.createGain();
  ot2Gain.gain.value = 0.2;
  overtone2.connect(ot2Gain);
  ot2Gain.connect(voiceGain);
  overtone2.start();

  // 3rd overtone — sine, fifth above octave (ethereal)
  const overtone3 = ctx.createOscillator();
  overtone3.type = 'sine';
  overtone3.frequency.value = baseFreq * 3;
  const ot3Gain = ctx.createGain();
  ot3Gain.gain.value = 0.08;
  overtone3.connect(ot3Gain);
  ot3Gain.connect(voiceGain);
  overtone3.start();

  // Stellar radiation — very subtle filtered noise (solar wind hiss)
  const radiationFilter = ctx.createBiquadFilter();
  radiationFilter.type = 'bandpass';
  radiationFilter.frequency.value = baseFreq * 8;
  radiationFilter.Q.value = 4; // Narrower band = less hiss
  const radGain = ctx.createGain();
  radGain.gain.value = 0.015; // Subtle stellar hiss
  radiationFilter.connect(radGain);
  radGain.connect(voiceGain);

  const radiationNoise = createLoopingNoise(ctx, noiseBuffer);
  radiationNoise.connect(radiationFilter);

  return { fundamental, overtone2, overtone3, radiationNoise, radiationFilter, voiceGain };
}

export interface EnvironmentAudioProps {
  activeEra: AtmosphereEra;
  simRef: React.RefObject<SimulationData>;
}

export function EnvironmentAudio({ activeEra, simRef }: EnvironmentAudioProps) {
  const nodesRef = useRef<AudioNodes | null>(null);

  const gainsRef = useRef({
    sun0: 0, sun1: 0, sun2: 0,
    tidal: 0,
    syzygy: 0,
    wind: 0,
    fire: 0,
    gravity: 0,
    binaryChirp: 0,
    ejection: 0,
  });

  useEffect(() => {
    const ctx = new AudioContext();
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.35; // Ambient level
    masterGain.connect(ctx.destination);

    const noiseBuffer = createWhiteNoiseBuffer(ctx, 4);

    // ── 3 Sun Voices ──
    const suns: [SunVoice, SunVoice, SunVoice] = [
      createSunVoice(ctx, noiseBuffer, masterGain, SUN_BASE_FREQS[0]),
      createSunVoice(ctx, noiseBuffer, masterGain, SUN_BASE_FREQS[1]),
      createSunVoice(ctx, noiseBuffer, masterGain, SUN_BASE_FREQS[2]),
    ];

    // ── Tidal resonance — low rumble from gravitational stress ──
    const tidalOsc = ctx.createOscillator();
    tidalOsc.type = 'sine';
    tidalOsc.frequency.value = 30;
    const tidalSubOsc = ctx.createOscillator();
    tidalSubOsc.type = 'sine';
    tidalSubOsc.frequency.value = 18; // Sub-bass
    const tidalGain = ctx.createGain();
    tidalGain.gain.value = 0;
    tidalOsc.connect(tidalGain);
    tidalSubOsc.connect(tidalGain);
    tidalGain.connect(masterGain);
    tidalOsc.start();
    tidalSubOsc.start();

    // ── Syzygy alarm — dissonant interval when suns align ──
    const syzygyOsc1 = ctx.createOscillator();
    syzygyOsc1.type = 'sawtooth';
    syzygyOsc1.frequency.value = 110;
    const syzygyOsc2 = ctx.createOscillator();
    syzygyOsc2.type = 'sawtooth';
    syzygyOsc2.frequency.value = 116.5; // Tritone — unsettling
    const syzygyFilter = ctx.createBiquadFilter();
    syzygyFilter.type = 'lowpass';
    syzygyFilter.frequency.value = 400;
    syzygyFilter.Q.value = 3;
    const syzygyGain = ctx.createGain();
    syzygyGain.gain.value = 0;
    syzygyOsc1.connect(syzygyFilter);
    syzygyOsc2.connect(syzygyFilter);
    syzygyFilter.connect(syzygyGain);
    syzygyGain.connect(masterGain);
    syzygyOsc1.start();
    syzygyOsc2.start();

    // ── Wind (ice era) ──
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.8;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windFilter.connect(windGain);
    windGain.connect(masterGain);
    const windNoise = createLoopingNoise(ctx, noiseBuffer);
    windNoise.connect(windFilter);

    // ── Fire crackle (inferno) ──
    const fireFilter = ctx.createBiquadFilter();
    fireFilter.type = 'lowpass';
    fireFilter.frequency.value = 800;
    fireFilter.Q.value = 1.0;
    const fireGain = ctx.createGain();
    fireGain.gain.value = 0;
    const fireLfo = ctx.createOscillator();
    fireLfo.type = 'sawtooth';
    fireLfo.frequency.value = 12;
    const fireLfoGain = ctx.createGain();
    fireLfoGain.gain.value = 0.15;
    fireLfo.connect(fireLfoGain);
    fireLfoGain.connect(fireGain.gain);
    fireLfo.start();
    fireFilter.connect(fireGain);
    fireGain.connect(masterGain);
    const fireNoise = createLoopingNoise(ctx, noiseBuffer);
    fireNoise.connect(fireFilter);

    // ── Gravity chaos — deep sub-bass drone ──
    const gravitySubOsc = ctx.createOscillator();
    gravitySubOsc.type = 'sine';
    gravitySubOsc.frequency.value = 25; // Sub-bass fundamental
    const gravityHarmonicOsc = ctx.createOscillator();
    gravityHarmonicOsc.type = 'sine';
    gravityHarmonicOsc.frequency.value = 50; // 2nd harmonic
    const gravityHarmonicGain = ctx.createGain();
    gravityHarmonicGain.gain.value = 0.4; // Harmonic softer than fundamental
    gravityHarmonicOsc.connect(gravityHarmonicGain);
    const gravityGain = ctx.createGain();
    gravityGain.gain.value = 0;
    gravitySubOsc.connect(gravityGain);
    gravityHarmonicGain.connect(gravityGain);
    gravityGain.connect(masterGain);
    gravitySubOsc.start();
    gravityHarmonicOsc.start();

    // ── Binary chirp — rising sine when binary forms ──
    const binaryChirpOsc = ctx.createOscillator();
    binaryChirpOsc.type = 'sine';
    binaryChirpOsc.frequency.value = 80;
    const binaryChirpFilter = ctx.createBiquadFilter();
    binaryChirpFilter.type = 'bandpass';
    binaryChirpFilter.frequency.value = 200;
    binaryChirpFilter.Q.value = 5;
    const binaryChirpGain = ctx.createGain();
    binaryChirpGain.gain.value = 0;
    binaryChirpOsc.connect(binaryChirpFilter);
    binaryChirpFilter.connect(binaryChirpGain);
    binaryChirpGain.connect(masterGain);
    binaryChirpOsc.start();

    // ── Ejection whoosh — filtered noise burst ──
    const ejectionFilter = ctx.createBiquadFilter();
    ejectionFilter.type = 'bandpass';
    ejectionFilter.frequency.value = 1200;
    ejectionFilter.Q.value = 0.5; // Wide band for whoosh
    const ejectionGain = ctx.createGain();
    ejectionGain.gain.value = 0;
    ejectionFilter.connect(ejectionGain);
    ejectionGain.connect(masterGain);
    const ejectionNoise = createLoopingNoise(ctx, noiseBuffer);
    ejectionNoise.connect(ejectionFilter);

    nodesRef.current = {
      ctx, masterGain,
      suns,
      tidalOsc, tidalSubOsc, tidalGain,
      syzygyOsc1, syzygyOsc2, syzygyGain,
      windNoise, windFilter, windGain,
      fireNoise, fireFilter, fireLfo, fireLfoGain, fireGain,
      gravitySubOsc, gravityHarmonicOsc, gravityGain,
      binaryChirpOsc, binaryChirpGain,
      ejectionNoise, ejectionFilter, ejectionGain,
    };

    // Resume on first user interaction
    const resumeAudio = () => {
      if (ctx.state === 'suspended') ctx.resume();
    };
    window.addEventListener('click', resumeAudio, { once: true });
    window.addEventListener('keydown', resumeAudio, { once: true });

    return () => {
      window.removeEventListener('click', resumeAudio);
      window.removeEventListener('keydown', resumeAudio);
      // Stop all oscillators
      suns.forEach((s) => {
        s.fundamental.stop();
        s.overtone2.stop();
        s.overtone3.stop();
        s.radiationNoise.stop();
      });
      tidalOsc.stop();
      tidalSubOsc.stop();
      syzygyOsc1.stop();
      syzygyOsc2.stop();
      fireLfo.stop();
      windNoise.stop();
      fireNoise.stop();
      gravitySubOsc.stop();
      gravityHarmonicOsc.stop();
      binaryChirpOsc.stop();
      ejectionNoise.stop();
      ctx.close();
      nodesRef.current = null;
    };
  }, []);

  useFrame((_, rawDelta) => {
    const nodes = nodesRef.current;
    if (!nodes || nodes.ctx.state !== 'running') return;

    const delta = Math.min(rawDelta, 0.05);
    const sim = simRef.current;
    const gains = gainsRef.current;
    const speed = 2;

    // Sync ambient volume from audio store
    const { masterVolume, ambientVolume } = useAudioStore.getState();
    nodes.masterGain.gain.value = 0.35 * masterVolume * ambientVolume;

    // ── Sun voices — each sun's volume and pitch based on elevation + velocity ──
    for (let i = 0; i < 3; i++) {
      const sunPos = sim.sunPositions[i];
      const sunVel = sim.sunVelocities[i];
      const aboveHorizon = sunPos.y > 0;
      const elevationFactor = Math.max(0, Math.min(1, sunPos.y / 250));

      // Volume: silent below horizon, audible hum when visible
      const sunGainTarget = aboveHorizon ? 0.05 + elevationFactor * 0.1 : 0;
      const key = `sun${i}` as 'sun0' | 'sun1' | 'sun2';
      gains[key] = expLerp(gains[key], sunGainTarget, speed, delta);
      nodes.suns[i].voiceGain.gain.value = gains[key];

      // Pitch shift: faster-moving suns have higher pitch (Doppler-like)
      const velocityFactor = Math.min(sunVel / 200, 1);
      const baseFreq = SUN_BASE_FREQS[i];
      const freqShift = 1 + elevationFactor * 0.3 + velocityFactor * 0.15;
      const targetFreq = baseFreq * freqShift;

      nodes.suns[i].fundamental.frequency.value = expLerp(
        nodes.suns[i].fundamental.frequency.value, targetFreq, speed, delta,
      );
      nodes.suns[i].overtone2.frequency.value = expLerp(
        nodes.suns[i].overtone2.frequency.value, targetFreq * 2, speed, delta,
      );
      nodes.suns[i].overtone3.frequency.value = expLerp(
        nodes.suns[i].overtone3.frequency.value, targetFreq * 3, speed, delta,
      );

      // Radiation noise filter follows pitch
      nodes.suns[i].radiationFilter.frequency.value = expLerp(
        nodes.suns[i].radiationFilter.frequency.value, targetFreq * 8, speed, delta,
      );
    }

    // ── Tidal resonance — barely audible rumble only at high tidal force ──
    const tidalTarget = sim.tidalForce > 0.5 ? (sim.tidalForce - 0.5) * 0.08 : 0;
    gains.tidal = expLerp(gains.tidal, tidalTarget, speed, delta);
    nodes.tidalGain.gain.value = gains.tidal;
    // Pitch drops as tidal force increases (more ominous)
    nodes.tidalOsc.frequency.value = expLerp(
      nodes.tidalOsc.frequency.value, 35 - sim.tidalForce * 15, speed, delta,
    );
    nodes.tidalSubOsc.frequency.value = expLerp(
      nodes.tidalSubOsc.frequency.value, 20 - sim.tidalForce * 8, speed, delta,
    );

    // ── Syzygy alarm — fades in during alignment ──
    const syzygyTarget = sim.isSyzygy ? 0.05 : 0;
    gains.syzygy = expLerp(gains.syzygy, syzygyTarget, sim.isSyzygy ? 3 : 1, delta);
    nodes.syzygyGain.gain.value = gains.syzygy;

    // ── Wind (ice) ──
    const windTarget = activeEra === 'chaosIce' ? 0.06 : 0;
    gains.wind = expLerp(gains.wind, windTarget, speed, delta);
    nodes.windGain.gain.value = gains.wind;

    // ── Fire crackle (inferno) ──
    const fireTarget = activeEra === 'chaosInferno' ? 0.04 : 0;
    gains.fire = expLerp(gains.fire, fireTarget, speed, delta);
    nodes.fireGain.gain.value = gains.fire;
    nodes.fireLfo.frequency.value = expLerp(
      nodes.fireLfo.frequency.value, activeEra === 'chaosInferno' ? 15 : 5, speed, delta,
    );

    // ── Gravity chaos drone — sub-bass rumble during chaosGravity ──
    const gravityTarget = activeEra === 'chaosGravity'
      ? 0.08 + sim.tidalForce * 0.06  // Volume proportional to tidal stress
      : 0;
    gains.gravity = expLerp(gains.gravity, gravityTarget, speed, delta);
    nodes.gravityGain.gain.value = gains.gravity;
    // Pitch drops slightly under extreme tidal force
    nodes.gravitySubOsc.frequency.value = expLerp(
      nodes.gravitySubOsc.frequency.value, 25 - sim.tidalForce * 5, speed, delta,
    );
    nodes.gravityHarmonicOsc.frequency.value = expLerp(
      nodes.gravityHarmonicOsc.frequency.value, 50 - sim.tidalForce * 10, speed, delta,
    );

    // ── Binary chirp — rising pitch when binary detected ──
    const chirpTarget = sim.isBinary ? 0.04 : 0;
    gains.binaryChirp = expLerp(gains.binaryChirp, chirpTarget, sim.isBinary ? 3 : 1, delta);
    nodes.binaryChirpGain.gain.value = gains.binaryChirp;
    // Frequency sweeps up when binary is active (gravitational wave chirp)
    const chirpFreq = sim.isBinary ? 80 + sim.tidalForce * 120 : 80;
    nodes.binaryChirpOsc.frequency.value = expLerp(
      nodes.binaryChirpOsc.frequency.value, chirpFreq, 2, delta,
    );

    // ── Ejection whoosh — noise burst during ejection ──
    const ejectionTarget = sim.isEjection ? 0.07 : 0;
    gains.ejection = expLerp(gains.ejection, ejectionTarget, sim.isEjection ? 5 : 2, delta);
    nodes.ejectionGain.gain.value = gains.ejection;
    // Sweep filter frequency up during ejection (whoosh effect)
    const ejectionFreq = sim.isEjection ? 2500 : 800;
    nodes.ejectionFilter.frequency.value = expLerp(
      nodes.ejectionFilter.frequency.value, ejectionFreq, 3, delta,
    );
  });

  return null;
}
