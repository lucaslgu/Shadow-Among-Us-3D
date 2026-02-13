import type { PlayerSnapshot, StateSnapshot } from '@shadow/shared';

const INTERPOLATION_DELAY = 100; // ms

export interface InterpolatedPlayer {
  position: [number, number, number];
  rotation: [number, number, number, number];
  isAlive: boolean;
  isHidden: boolean;
  isInvisible: boolean;
  isImpermeable: boolean;
  isGhost: boolean;
  speedMultiplier: number;
}

// ── Per-player cache to avoid allocating new objects every frame ──
const interpCache = new Map<string, InterpolatedPlayer>();

function getOrCreateInterp(playerId: string): InterpolatedPlayer {
  let cached = interpCache.get(playerId);
  if (!cached) {
    cached = {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      isAlive: true,
      isHidden: false,
      isInvisible: false,
      isImpermeable: false,
      isGhost: false,
      speedMultiplier: 1,
    };
    interpCache.set(playerId, cached);
  }
  return cached;
}

export function interpolatePlayer(
  playerId: string,
  buffer: StateSnapshot[],
  renderTime: number,
): InterpolatedPlayer | null {
  if (buffer.length < 2) {
    const latest = buffer[buffer.length - 1];
    if (!latest) return null;
    const snap = latest.players[playerId];
    if (!snap) return null;
    return fillInterpolated(getOrCreateInterp(playerId), snap);
  }

  // Find two snapshots bracketing renderTime
  let from: StateSnapshot | null = null;
  let to: StateSnapshot | null = null;

  for (let i = 0; i < buffer.length - 1; i++) {
    if (buffer[i].timestamp <= renderTime && buffer[i + 1].timestamp >= renderTime) {
      from = buffer[i];
      to = buffer[i + 1];
      break;
    }
  }

  if (!from || !to) {
    const latest = buffer[buffer.length - 1];
    const snap = latest.players[playerId];
    if (!snap) return null;
    return fillInterpolated(getOrCreateInterp(playerId), snap);
  }

  const fromSnap = from.players[playerId];
  const toSnap = to.players[playerId];
  if (!fromSnap || !toSnap) return null;

  const t = Math.max(0, Math.min(1, (renderTime - from.timestamp) / (to.timestamp - from.timestamp)));

  const out = getOrCreateInterp(playerId);
  lerpVec3Into(out.position, fromSnap.position, toSnap.position, t);
  slerpQuatInto(out.rotation, fromSnap.rotation, toSnap.rotation, t);
  out.isAlive = toSnap.isAlive;
  out.isHidden = toSnap.isHidden;
  out.isInvisible = toSnap.isInvisible;
  out.isImpermeable = toSnap.isImpermeable;
  out.isGhost = toSnap.isGhost;
  out.speedMultiplier = toSnap.speedMultiplier;
  return out;
}

export function getInterpolationRenderTime(): number {
  return Date.now() - INTERPOLATION_DELAY;
}

/** Copy snapshot data into a reusable InterpolatedPlayer (no new arrays) */
function fillInterpolated(out: InterpolatedPlayer, snap: PlayerSnapshot): InterpolatedPlayer {
  out.position[0] = snap.position[0];
  out.position[1] = snap.position[1];
  out.position[2] = snap.position[2];
  out.rotation[0] = snap.rotation[0];
  out.rotation[1] = snap.rotation[1];
  out.rotation[2] = snap.rotation[2];
  out.rotation[3] = snap.rotation[3];
  out.isAlive = snap.isAlive;
  out.isHidden = snap.isHidden;
  out.isInvisible = snap.isInvisible;
  out.isImpermeable = snap.isImpermeable;
  out.isGhost = snap.isGhost;
  out.speedMultiplier = snap.speedMultiplier;
  return out;
}

function lerpVec3Into(
  out: [number, number, number],
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): void {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

function slerpQuatInto(
  out: [number, number, number, number],
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number,
): void {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

  let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  if (dot < 0) {
    b0 = -b0; b1 = -b1; b2 = -b2; b3 = -b3;
    dot = -dot;
  }

  if (dot > 0.9999) {
    out[0] = a[0] + (b0 - a[0]) * t;
    out[1] = a[1] + (b1 - a[1]) * t;
    out[2] = a[2] + (b2 - a[2]) * t;
    out[3] = a[3] + (b3 - a[3]) * t;
    return;
  }

  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const w1 = Math.sin((1 - t) * theta) / sinTheta;
  const w2 = Math.sin(t * theta) / sinTheta;
  out[0] = a[0] * w1 + b0 * w2;
  out[1] = a[1] * w1 + b1 * w2;
  out[2] = a[2] * w1 + b2 * w2;
  out[3] = a[3] * w1 + b3 * w2;
}
