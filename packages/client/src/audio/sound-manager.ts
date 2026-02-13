// ═══════════════════════════════════════════════════════════════
// Procedural Sound Manager — Web Audio API synthesized sounds
// No audio files needed — all sounds generated on-the-fly.
// ═══════════════════════════════════════════════════════════════

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let _sfxVolume = 0.5;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = _sfxVolume;
    masterGain.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

function getMaster(): GainNode {
  getCtx();
  return masterGain!;
}

/** Update the SFX master gain (called by audio-store subscription) */
export function setSfxMasterGain(volume: number): void {
  _sfxVolume = volume;
  if (masterGain) {
    masterGain.gain.value = volume;
  }
}

// Helper: create noise buffer
function createNoiseBuffer(duration: number, decayFactor = 0.3): AudioBuffer {
  const ac = getCtx();
  const length = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * decayFactor));
  }
  return buffer;
}

// ── Footstep ──
// Short percussive thud — low-frequency noise burst

let footstepAlt = false; // alternate L/R pitch

export function playFootstep(): void {
  const ac = getCtx();
  const now = ac.currentTime;

  const buffer = createNoiseBuffer(0.08, 0.25);
  const source = ac.createBufferSource();
  source.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = footstepAlt ? 250 : 300;
  filter.Q.value = 0.7;
  footstepAlt = !footstepAlt;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  source.connect(filter).connect(gain).connect(getMaster());
  source.start(now);
  source.stop(now + 0.12);
}

// ── Power Activate ──
// Ascending frequency sweep with harmonics

export function playPowerActivate(): void {
  const ac = getCtx();
  const now = ac.currentTime;
  const duration = 0.4;

  // Main sweep
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(1200, now + duration);

  // Sub oscillator
  const osc2 = ac.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(100, now);
  osc2.frequency.exponentialRampToValueAtTime(600, now + duration);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.setValueAtTime(0.15, now + duration * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  const gain2 = ac.createGain();
  gain2.gain.setValueAtTime(0.08, now);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + duration);

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, now);
  filter.frequency.linearRampToValueAtTime(4000, now + duration);

  osc.connect(gain).connect(filter).connect(getMaster());
  osc2.connect(gain2).connect(filter);

  osc.start(now);
  osc.stop(now + duration + 0.05);
  osc2.start(now);
  osc2.stop(now + duration + 0.05);
}

// ── Power Deactivate ──
// Descending sweep

export function playPowerDeactivate(): void {
  const ac = getCtx();
  const now = ac.currentTime;
  const duration = 0.3;

  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(150, now + duration);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain).connect(getMaster());
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

// ── Door Open ──
// Low rumble sweep up + mechanical slide noise

export function playDoorOpen(): void {
  const ac = getCtx();
  const now = ac.currentTime;
  const duration = 0.5;

  // Low rumble oscillator
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(60, now);
  osc.frequency.linearRampToValueAtTime(180, now + duration);

  const oscGain = ac.createGain();
  oscGain.gain.setValueAtTime(0.15, now);
  oscGain.gain.linearRampToValueAtTime(0.08, now + duration * 0.5);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  // Slide noise
  const noiseBuffer = createNoiseBuffer(duration, 0.5);
  const noise = ac.createBufferSource();
  noise.buffer = noiseBuffer;

  const noiseFilter = ac.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(400, now);
  noiseFilter.frequency.linearRampToValueAtTime(800, now + duration);
  noiseFilter.Q.value = 2;

  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(0.1, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(oscGain).connect(getMaster());
  noise.connect(noiseFilter).connect(noiseGain).connect(getMaster());

  osc.start(now);
  osc.stop(now + duration + 0.05);
  noise.start(now);
  noise.stop(now + duration + 0.05);
}

// ── Door Close ──
// Heavy thud + impact noise

export function playDoorClose(): void {
  const ac = getCtx();
  const now = ac.currentTime;

  // Impact thud
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(100, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);

  const oscGain = ac.createGain();
  oscGain.gain.setValueAtTime(0.25, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  // Impact noise
  const noiseBuffer = createNoiseBuffer(0.06, 0.15);
  const noise = ac.createBufferSource();
  noise.buffer = noiseBuffer;

  const noiseFilter = ac.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.value = 600;

  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(0.15, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  osc.connect(oscGain).connect(getMaster());
  noise.connect(noiseFilter).connect(noiseGain).connect(getMaster());

  osc.start(now);
  osc.stop(now + 0.3);
  noise.start(now);
  noise.stop(now + 0.15);
}

// ── Light On ──
// Quick electric hum buzz + click

export function playLightOn(): void {
  const ac = getCtx();
  const now = ac.currentTime;

  // Electric buzz
  const osc = ac.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(120, now);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.setValueAtTime(0.06, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  // Click
  const click = ac.createOscillator();
  click.type = 'sine';
  click.frequency.value = 2500;

  const clickGain = ac.createGain();
  clickGain.gain.setValueAtTime(0.08, now);
  clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

  osc.connect(gain).connect(getMaster());
  click.connect(clickGain).connect(getMaster());

  osc.start(now);
  osc.stop(now + 0.15);
  click.start(now);
  click.stop(now + 0.05);
}

// ── Light Off ──
// Descending tone + pop

export function playLightOff(): void {
  const ac = getCtx();
  const now = ac.currentTime;

  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc.connect(gain).connect(getMaster());
  osc.start(now);
  osc.stop(now + 0.15);
}

// ── Flashlight Toggle ──
// Mechanical switch click

export function playFlashlightToggle(): void {
  const ac = getCtx();
  const now = ac.currentTime;

  // Sharp click
  const noiseBuffer = createNoiseBuffer(0.02, 0.1);
  const noise = ac.createBufferSource();
  noise.buffer = noiseBuffer;

  const filter = ac.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1500;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  // Secondary thunk
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 400;

  const oscGain = ac.createGain();
  oscGain.gain.setValueAtTime(0.06, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

  noise.connect(filter).connect(gain).connect(getMaster());
  osc.connect(oscGain).connect(getMaster());

  noise.start(now);
  noise.stop(now + 0.05);
  osc.start(now);
  osc.stop(now + 0.05);
}

// ── Door Locked (failed interaction) ──
// Metallic rattle

export function playDoorLocked(): void {
  const ac = getCtx();
  const now = ac.currentTime;

  for (let i = 0; i < 3; i++) {
    const t = now + i * 0.06;
    const osc = ac.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 300 + i * 50;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.07, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain).connect(getMaster());
    osc.start(t);
    osc.stop(t + 0.05);
  }
}

// ── Teleport ──
// Sci-fi whoosh + phase shift

export function playTeleport(): void {
  const ac = getCtx();
  const now = ac.currentTime;
  const duration = 0.5;

  // 1) Rising phase sweep — sine wave ascending rapidly
  const sweep = ac.createOscillator();
  sweep.type = 'sine';
  sweep.frequency.setValueAtTime(150, now);
  sweep.frequency.exponentialRampToValueAtTime(2000, now + duration * 0.4);
  sweep.frequency.exponentialRampToValueAtTime(800, now + duration);

  const sweepGain = ac.createGain();
  sweepGain.gain.setValueAtTime(0.12, now);
  sweepGain.gain.setValueAtTime(0.12, now + duration * 0.3);
  sweepGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  sweep.connect(sweepGain).connect(getMaster());
  sweep.start(now);
  sweep.stop(now + duration + 0.05);

  // 2) Spatial whoosh — filtered noise burst
  const whooshLen = Math.floor(ac.sampleRate * 0.3);
  const whooshBuf = ac.createBuffer(1, whooshLen, ac.sampleRate);
  const whooshData = whooshBuf.getChannelData(0);
  for (let i = 0; i < whooshLen; i++) {
    whooshData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (whooshLen * 0.2));
  }
  const whooshSrc = ac.createBufferSource();
  whooshSrc.buffer = whooshBuf;

  const whooshBand = ac.createBiquadFilter();
  whooshBand.type = 'bandpass';
  whooshBand.frequency.setValueAtTime(600, now);
  whooshBand.frequency.exponentialRampToValueAtTime(3000, now + 0.15);
  whooshBand.frequency.exponentialRampToValueAtTime(400, now + 0.3);
  whooshBand.Q.value = 1.5;

  const whooshGain = ac.createGain();
  whooshGain.gain.setValueAtTime(0.15, now);
  whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  whooshSrc.connect(whooshBand).connect(whooshGain).connect(getMaster());
  whooshSrc.start(now);
  whooshSrc.stop(now + 0.4);

  // 3) Arrival impact — low thud
  const thud = ac.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(80, now + 0.15);
  thud.frequency.exponentialRampToValueAtTime(30, now + 0.45);

  const thudGain = ac.createGain();
  thudGain.gain.setValueAtTime(0, now);
  thudGain.gain.linearRampToValueAtTime(0.18, now + 0.18);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  thud.connect(thudGain).connect(getMaster());
  thud.start(now + 0.15);
  thud.stop(now + 0.55);

  // 4) Shimmer — high-frequency sparkle
  const shimmer = ac.createOscillator();
  shimmer.type = 'triangle';
  shimmer.frequency.setValueAtTime(4000, now);
  shimmer.frequency.exponentialRampToValueAtTime(1500, now + 0.3);

  const shimmerGain = ac.createGain();
  shimmerGain.gain.setValueAtTime(0.04, now);
  shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  shimmer.connect(shimmerGain).connect(getMaster());
  shimmer.start(now);
  shimmer.stop(now + 0.3);
}

// ── Muralha Rise (earthquake rumble + stone rising) ──

export function playMuralhaRise(): void {
  const ac = getCtx();
  const now = ac.currentTime;
  const duration = 1.2;

  // 1) Deep rumble — low-frequency noise
  const rumbleLen = Math.floor(ac.sampleRate * duration);
  const rumbleBuf = ac.createBuffer(1, rumbleLen, ac.sampleRate);
  const rumbleData = rumbleBuf.getChannelData(0);
  for (let i = 0; i < rumbleLen; i++) {
    rumbleData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (rumbleLen * 0.6));
  }
  const rumbleSource = ac.createBufferSource();
  rumbleSource.buffer = rumbleBuf;

  const rumbleLowpass = ac.createBiquadFilter();
  rumbleLowpass.type = 'lowpass';
  rumbleLowpass.frequency.setValueAtTime(60, now);
  rumbleLowpass.frequency.linearRampToValueAtTime(120, now + 0.3);
  rumbleLowpass.frequency.linearRampToValueAtTime(80, now + duration);

  const rumbleGain = ac.createGain();
  rumbleGain.gain.setValueAtTime(0, now);
  rumbleGain.gain.linearRampToValueAtTime(0.35, now + 0.15);
  rumbleGain.gain.setValueAtTime(0.35, now + 0.4);
  rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

  rumbleSource.connect(rumbleLowpass).connect(rumbleGain).connect(getMaster());
  rumbleSource.start(now);
  rumbleSource.stop(now + duration);

  // 2) Stone grinding — mid-frequency textured noise
  const grindLen = Math.floor(ac.sampleRate * 0.8);
  const grindBuf = ac.createBuffer(1, grindLen, ac.sampleRate);
  const grindData = grindBuf.getChannelData(0);
  for (let i = 0; i < grindLen; i++) {
    grindData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (grindLen * 0.35));
  }
  const grindSource = ac.createBufferSource();
  grindSource.buffer = grindBuf;

  const grindBand = ac.createBiquadFilter();
  grindBand.type = 'bandpass';
  grindBand.frequency.value = 400;
  grindBand.Q.value = 2;

  const grindGain = ac.createGain();
  grindGain.gain.setValueAtTime(0, now);
  grindGain.gain.linearRampToValueAtTime(0.12, now + 0.1);
  grindGain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);

  grindSource.connect(grindBand).connect(grindGain).connect(getMaster());
  grindSource.start(now + 0.05);
  grindSource.stop(now + 0.85);

  // 3) Impact thud — very low sine pulse
  const thudOsc = ac.createOscillator();
  thudOsc.type = 'sine';
  thudOsc.frequency.setValueAtTime(45, now + 0.1);
  thudOsc.frequency.exponentialRampToValueAtTime(25, now + 0.5);

  const thudGain = ac.createGain();
  thudGain.gain.setValueAtTime(0, now + 0.1);
  thudGain.gain.linearRampToValueAtTime(0.25, now + 0.15);
  thudGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

  thudOsc.connect(thudGain).connect(getMaster());
  thudOsc.start(now + 0.1);
  thudOsc.stop(now + 0.7);

  // 4) Cracking — short sharp transients
  for (let i = 0; i < 4; i++) {
    const t = now + 0.05 + i * 0.12 + Math.random() * 0.05;
    const crackBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.03), ac.sampleRate);
    const crackData = crackBuf.getChannelData(0);
    for (let j = 0; j < crackData.length; j++) {
      crackData[j] = (Math.random() * 2 - 1) * Math.exp(-j / (crackData.length * 0.15));
    }
    const crackSrc = ac.createBufferSource();
    crackSrc.buffer = crackBuf;
    const crackHi = ac.createBiquadFilter();
    crackHi.type = 'highpass';
    crackHi.frequency.value = 800;
    const crackGain = ac.createGain();
    crackGain.gain.setValueAtTime(0.08 + Math.random() * 0.04, t);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    crackSrc.connect(crackHi).connect(crackGain).connect(getMaster());
    crackSrc.start(t);
    crackSrc.stop(t + 0.04);
  }
}

// ── Muralha Destroy (crumble / collapse) ──

export function playMuralhaDestroy(): void {
  const ac = getCtx();
  const now = ac.currentTime;
  const duration = 1.0;

  // 1) Heavy impact thud
  const thudOsc = ac.createOscillator();
  thudOsc.type = 'sine';
  thudOsc.frequency.setValueAtTime(50, now);
  thudOsc.frequency.exponentialRampToValueAtTime(20, now + 0.4);

  const thudGain = ac.createGain();
  thudGain.gain.setValueAtTime(0.3, now);
  thudGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

  thudOsc.connect(thudGain).connect(getMaster());
  thudOsc.start(now);
  thudOsc.stop(now + 0.6);

  // 2) Debris cascade — multiple short noise bursts
  for (let i = 0; i < 6; i++) {
    const t = now + i * 0.1 + Math.random() * 0.08;
    const len = Math.floor(ac.sampleRate * (0.06 + Math.random() * 0.04));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < len; j++) {
      data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (len * 0.25));
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    const band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 200 + Math.random() * 600;
    band.Q.value = 1.5;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.06 + Math.random() * 0.04, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.connect(band).connect(g).connect(getMaster());
    src.start(t);
    src.stop(t + 0.1);
  }

  // 3) Low rumble tail
  const rumbleLen = Math.floor(ac.sampleRate * duration);
  const rumbleBuf = ac.createBuffer(1, rumbleLen, ac.sampleRate);
  const rumbleData = rumbleBuf.getChannelData(0);
  for (let i = 0; i < rumbleLen; i++) {
    rumbleData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (rumbleLen * 0.3));
  }
  const rumbleSrc = ac.createBufferSource();
  rumbleSrc.buffer = rumbleBuf;
  const lowpass = ac.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 100;
  const rumbleGain = ac.createGain();
  rumbleGain.gain.setValueAtTime(0.2, now);
  rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + duration);
  rumbleSrc.connect(lowpass).connect(rumbleGain).connect(getMaster());
  rumbleSrc.start(now);
  rumbleSrc.stop(now + duration);
}
