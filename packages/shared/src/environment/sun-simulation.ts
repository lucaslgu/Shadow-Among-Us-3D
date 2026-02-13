// ═══════════════════════════════════════════════════════════════
// Sun Simulation — Lorenz attractor + spherical projection
// Shared between server (directional damage) and client (visuals)
// Deterministic given same initial state + elapsed time
// ═══════════════════════════════════════════════════════════════

// --- Lorenz attractor constants ---
const SIGMA = 10;
const RHO = 28;
const BETA = 8 / 3;
const SIM_STEP = 0.002; // small step for numerical stability
const MAX_STEPS_PER_TICK = 30;

// --- Sun orbit constants ---
const SUN_DISTANCE = 250;
const PHASE_OFFSETS: [number, number, number] = [0, 2.094, 4.189]; // ~120° apart

// --- Types ---
export interface LorenzState {
  x: number;
  y: number;
  z: number;
}

export type SunPosition = [number, number, number]; // world (x, y, z)

export interface SunSimulationState {
  lorenz: LorenzState;
  elapsedTime: number;
  sunPositions: [SunPosition, SunPosition, SunPosition];
}

// --- Lorenz integration (RK4) ---

function lorenzDeriv(s: LorenzState): LorenzState {
  return {
    x: SIGMA * (s.y - s.x),
    y: s.x * (RHO - s.z) - s.y,
    z: s.x * s.y - BETA * s.z,
  };
}

function addScaled(a: LorenzState, b: LorenzState, scale: number): LorenzState {
  return {
    x: a.x + b.x * scale,
    y: a.y + b.y * scale,
    z: a.z + b.z * scale,
  };
}

function integrateRK4(state: LorenzState, dt: number): LorenzState {
  const k1 = lorenzDeriv(state);
  const k2 = lorenzDeriv(addScaled(state, k1, dt * 0.5));
  const k3 = lorenzDeriv(addScaled(state, k2, dt * 0.5));
  const k4 = lorenzDeriv(addScaled(state, k3, dt));
  return {
    x: state.x + (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: state.y + (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    z: state.z + (dt / 6) * (k1.z + 2 * k2.z + 2 * k3.z + k4.z),
  };
}

// --- Derive sun position from Lorenz state + phase offset ---

function sunPositionFromLorenz(
  lorenz: LorenzState,
  time: number,
  phaseOffset: number,
): SunPosition {
  const t = time * 0.3 + phaseOffset;
  const lx = lorenz.x;
  const ly = lorenz.y;
  const lz = lorenz.z;

  // Map Lorenz state to spherical angles
  const theta = Math.atan2(
    ly * Math.cos(t) + lx * Math.sin(t),
    lx * Math.cos(t) - ly * Math.sin(t),
  );
  // phi ranges from -PI/3 to PI/3 (below to above horizon)
  const phi = ((lz - 25) / 25) * (Math.PI / 3);

  return [
    SUN_DISTANCE * Math.cos(phi) * Math.cos(theta),
    SUN_DISTANCE * Math.sin(phi),
    SUN_DISTANCE * Math.cos(phi) * Math.sin(theta),
  ];
}

// --- Public API ---

/** Create initial simulation state */
export function createSunSimulation(): SunSimulationState {
  return {
    lorenz: { x: 1, y: 1, z: 1 },
    elapsedTime: 0,
    sunPositions: [
      [SUN_DISTANCE, 0, 0],
      [0, 0, SUN_DISTANCE],
      [-SUN_DISTANCE, 0, 0],
    ],
  };
}

/** Advance the simulation by `dt` seconds and update sun positions */
export function advanceSunSimulation(state: SunSimulationState, dt: number): void {
  // Integrate Lorenz in small fixed steps for stability
  const steps = Math.min(Math.ceil(dt / SIM_STEP), MAX_STEPS_PER_TICK);
  for (let i = 0; i < steps; i++) {
    state.lorenz = integrateRK4(state.lorenz, SIM_STEP);
  }
  state.elapsedTime += dt;

  // Derive sun positions
  for (let i = 0; i < 3; i++) {
    state.sunPositions[i] = sunPositionFromLorenz(
      state.lorenz,
      state.elapsedTime,
      PHASE_OFFSETS[i],
    );
  }
}

/** Check if a sun is above the horizon (y > 0) */
export function isSunVisible(sunPos: SunPosition): boolean {
  return sunPos[1] > 0;
}

/** Get sun elevation angle in radians (0 = horizon, PI/2 = zenith) */
export function getSunElevation(sunPos: SunPosition): number {
  const horizDist = Math.sqrt(sunPos[0] * sunPos[0] + sunPos[2] * sunPos[2]);
  return Math.atan2(sunPos[1], horizDist);
}

/** Get the 2D direction (XZ plane) from a point toward a sun, normalized */
export function getSunDirection2D(
  fromX: number,
  fromZ: number,
  sunPos: SunPosition,
): [number, number] {
  const dx = sunPos[0] - fromX;
  const dz = sunPos[2] - fromZ;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.001) return [0, 1];
  return [dx / len, dz / len];
}

// Elevation threshold: above this, sun is "overhead" and only shelter protects
export const OVERHEAD_ELEVATION = Math.PI / 4; // 45 degrees
