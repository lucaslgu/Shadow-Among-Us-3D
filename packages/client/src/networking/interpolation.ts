import type { PlayerSnapshot, StateSnapshot } from '@shadow/shared';

const INTERPOLATION_DELAY = 100; // ms

export interface InterpolatedPlayer {
  position: [number, number, number];
  rotation: [number, number, number, number];
  isAlive: boolean;
  isHidden: boolean;
  isInvisible: boolean;
  speedMultiplier: number;
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
    return toInterpolated(snap);
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
    return toInterpolated(snap);
  }

  const fromSnap = from.players[playerId];
  const toSnap = to.players[playerId];
  if (!fromSnap || !toSnap) return null;

  const t = Math.max(0, Math.min(1, (renderTime - from.timestamp) / (to.timestamp - from.timestamp)));

  return {
    position: lerpVec3(fromSnap.position, toSnap.position, t),
    rotation: slerpQuat(fromSnap.rotation, toSnap.rotation, t),
    isAlive: toSnap.isAlive,
    isHidden: toSnap.isHidden,
    isInvisible: toSnap.isInvisible,
    speedMultiplier: toSnap.speedMultiplier,
  };
}

export function getInterpolationRenderTime(): number {
  return Date.now() - INTERPOLATION_DELAY;
}

function toInterpolated(snap: PlayerSnapshot): InterpolatedPlayer {
  return {
    position: [...snap.position],
    rotation: [...snap.rotation],
    isAlive: snap.isAlive,
    isHidden: snap.isHidden,
    isInvisible: snap.isInvisible,
    speedMultiplier: snap.speedMultiplier,
  };
}

function lerpVec3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function slerpQuat(
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number,
): [number, number, number, number] {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const target: [number, number, number, number] =
    dot < 0 ? [-b[0], -b[1], -b[2], -b[3]] : [...b];
  if (dot < 0) dot = -dot;

  if (dot > 0.9999) {
    return [
      a[0] + (target[0] - a[0]) * t,
      a[1] + (target[1] - a[1]) * t,
      a[2] + (target[2] - a[2]) * t,
      a[3] + (target[3] - a[3]) * t,
    ];
  }

  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const w1 = Math.sin((1 - t) * theta) / sinTheta;
  const w2 = Math.sin(t * theta) / sinTheta;
  return [
    a[0] * w1 + target[0] * w2,
    a[1] * w1 + target[1] * w2,
    a[2] * w1 + target[2] * w2,
    a[3] * w1 + target[3] * w2,
  ];
}
