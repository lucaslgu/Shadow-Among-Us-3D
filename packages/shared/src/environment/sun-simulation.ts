// ═══════════════════════════════════════════════════════════════
// Sun Simulation — Gravitational N-body (real Three-Body Problem)
// Shared between server (directional damage) and client (visuals)
// Deterministic given same initial state + elapsed time
// ═══════════════════════════════════════════════════════════════

// --- N-body constants ---
const G = 800;                  // gravitational constant (tuned for game scale)
const SOFTENING = 25;           // prevents singularity at close approach (ε)
const SOFTENING_SQ = SOFTENING * SOFTENING;
const DAMPING = 0.99995;        // per-step energy damping (prevents long-term divergence)
const BOUNDARY_RADIUS = 600;    // soft boundary — restoring force beyond this
const BOUNDARY_K = 0.5;         // boundary restoring force strength
const SIM_STEP = 0.001;         // fixed integration step (smaller than Lorenz for stability)
const MAX_STEPS_PER_TICK = 60;  // cap for 20Hz tick rate

// --- Sky projection ---
const SUN_DISTANCE = 250;

// --- Event detection ---
const BINARY_RATIO = 0.3;        // binary if dist < 30% of average inter-body distance
const BINARY_TICKS = 40;         // sustained for 40 ticks (2 seconds at 20Hz)
const EJECTION_RATIO = 2.5;      // ejection if dist from CoM > 2.5× average

// --- Orbital scale for initial conditions ---
const ORBITAL_RADIUS = 300;      // base orbital radius for initial configurations

// --- Types ---

export interface BodyState {
  x: number; y: number; z: number;     // position
  vx: number; vy: number; vz: number;  // velocity
  mass: number;                          // relative mass
}

export type SunPosition = [number, number, number]; // projected sky position

export interface SimulationEvents {
  isBinary: boolean;
  binaryPair: [number, number] | null;
  isEjection: boolean;
  ejectedIndex: number | null;
  totalEnergy: number;
}

export interface SunSimulationState {
  bodies: [BodyState, BodyState, BodyState];
  elapsedTime: number;
  sunPositions: [SunPosition, SunPosition, SunPosition];
  // Event detection state
  binaryCounter: [number, number, number]; // counters for pairs (0-1, 0-2, 1-2)
  events: SimulationEvents;
}

// ═══════════════════════════════════════════════════════════════
// N-body state vector (flat array for RK4)
// Layout: [x0, y0, z0, vx0, vy0, vz0, x1, y1, z1, vx1, vy1, vz1, ...]
// Total: 18 floats (3 bodies × 6 DOF)
// ═══════════════════════════════════════════════════════════════

type StateVec = Float64Array; // length 18

function bodiesToStateVec(bodies: [BodyState, BodyState, BodyState]): StateVec {
  const s = new Float64Array(18);
  for (let i = 0; i < 3; i++) {
    const b = bodies[i];
    s[i * 6 + 0] = b.x;
    s[i * 6 + 1] = b.y;
    s[i * 6 + 2] = b.z;
    s[i * 6 + 3] = b.vx;
    s[i * 6 + 4] = b.vy;
    s[i * 6 + 5] = b.vz;
  }
  return s;
}

function stateVecToBodies(s: StateVec, masses: [number, number, number]): [BodyState, BodyState, BodyState] {
  const bodies: BodyState[] = [];
  for (let i = 0; i < 3; i++) {
    bodies.push({
      x: s[i * 6 + 0],
      y: s[i * 6 + 1],
      z: s[i * 6 + 2],
      vx: s[i * 6 + 3],
      vy: s[i * 6 + 4],
      vz: s[i * 6 + 5],
      mass: masses[i],
    });
  }
  return bodies as [BodyState, BodyState, BodyState];
}

// ═══════════════════════════════════════════════════════════════
// Gravitational derivative: ds/dt
// ═══════════════════════════════════════════════════════════════

function nBodyDerivative(s: StateVec, masses: [number, number, number]): StateVec {
  const dsdt = new Float64Array(18);

  for (let i = 0; i < 3; i++) {
    const ix = i * 6;
    // Velocity → position derivative
    dsdt[ix + 0] = s[ix + 3]; // dx/dt = vx
    dsdt[ix + 1] = s[ix + 4]; // dy/dt = vy
    dsdt[ix + 2] = s[ix + 5]; // dz/dt = vz

    // Gravitational acceleration from other bodies
    let ax = 0, ay = 0, az = 0;
    for (let j = 0; j < 3; j++) {
      if (i === j) continue;
      const jx = j * 6;
      const dx = s[jx + 0] - s[ix + 0];
      const dy = s[jx + 1] - s[ix + 1];
      const dz = s[jx + 2] - s[ix + 2];
      const r2 = dx * dx + dy * dy + dz * dz + SOFTENING_SQ;
      const r = Math.sqrt(r2);
      const f = G * masses[j] / (r2 * r); // acceleration magnitude
      ax += f * dx;
      ay += f * dy;
      az += f * dz;
    }

    // Boundary containment: soft restoring force toward origin
    const px = s[ix + 0], py = s[ix + 1], pz = s[ix + 2];
    const dist = Math.sqrt(px * px + py * py + pz * pz);
    if (dist > BOUNDARY_RADIUS) {
      const excess = (dist - BOUNDARY_RADIUS) / BOUNDARY_RADIUS;
      const restore = -BOUNDARY_K * excess * excess; // quadratic restoring
      ax += restore * px / dist;
      ay += restore * py / dist;
      az += restore * pz / dist;
    }

    dsdt[ix + 3] = ax;
    dsdt[ix + 4] = ay;
    dsdt[ix + 5] = az;
  }

  return dsdt;
}

// ═══════════════════════════════════════════════════════════════
// RK4 integration for 18-dimensional state
// ═══════════════════════════════════════════════════════════════

function addScaledVec(a: StateVec, b: StateVec, scale: number): StateVec {
  const result = new Float64Array(18);
  for (let i = 0; i < 18; i++) {
    result[i] = a[i] + b[i] * scale;
  }
  return result;
}

function integrateRK4(s: StateVec, masses: [number, number, number], dt: number): StateVec {
  const k1 = nBodyDerivative(s, masses);
  const k2 = nBodyDerivative(addScaledVec(s, k1, dt * 0.5), masses);
  const k3 = nBodyDerivative(addScaledVec(s, k2, dt * 0.5), masses);
  const k4 = nBodyDerivative(addScaledVec(s, k3, dt), masses);

  const result = new Float64Array(18);
  for (let i = 0; i < 18; i++) {
    result[i] = s[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }

  // Apply velocity damping (prevents long-term energy growth)
  for (let i = 0; i < 3; i++) {
    result[i * 6 + 3] *= DAMPING;
    result[i * 6 + 4] *= DAMPING;
    result[i * 6 + 5] *= DAMPING;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Sky projection: body position → SunPosition at SUN_DISTANCE
// Preserves angular relationships (visibility, elevation, direction)
// ═══════════════════════════════════════════════════════════════

function projectToSky(body: BodyState): SunPosition {
  const dist = Math.sqrt(body.x * body.x + body.y * body.y + body.z * body.z);
  if (dist < 0.001) return [SUN_DISTANCE, 0, 0];
  const scale = SUN_DISTANCE / dist;
  return [body.x * scale, body.y * scale, body.z * scale];
}

// ═══════════════════════════════════════════════════════════════
// Initial conditions presets
// ═══════════════════════════════════════════════════════════════

export type InitialConfig = 'triangle' | 'hierarchical' | 'figure8';

function createTriangleConfig(masses: [number, number, number]): [BodyState, BodyState, BodyState] {
  // Equilateral triangle in XZ plane with circular velocities
  // Lagrange's solution — unstable but long-lived (~30-60s before breakdown)
  const R = ORBITAL_RADIUS;
  const totalMass = masses[0] + masses[1] + masses[2];
  const v = Math.sqrt(G * totalMass / (R * 1.73)); // approximate circular velocity

  // Tilt the orbital plane ~30° to create interesting horizon crossings
  const tilt = Math.PI / 6;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);

  const angles = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
  const bodies: BodyState[] = [];

  for (let i = 0; i < 3; i++) {
    const a = angles[i];
    // Position in tilted plane
    const px = R * Math.cos(a);
    const pyz = R * Math.sin(a);
    const py = pyz * sinT;
    const pz = pyz * cosT;
    // Velocity perpendicular to position in tilted plane
    const vx = -v * Math.sin(a);
    const vyz = v * Math.cos(a);
    const vy = vyz * sinT;
    const vz = vyz * cosT;

    bodies.push({ x: px, y: py, z: pz, vx, vy, vz, mass: masses[i] });
  }

  // Shift to center of mass frame
  shiftToCenterOfMass(bodies as [BodyState, BodyState, BodyState]);
  return bodies as [BodyState, BodyState, BodyState];
}

function createHierarchicalConfig(masses: [number, number, number]): [BodyState, BodyState, BodyState] {
  // Tight binary (0,1) + distant satellite (2)
  // Binary separation ~100 units, satellite at ~400 units
  const binaryR = 80;
  const satelliteR = ORBITAL_RADIUS * 1.3;
  const binaryMass = masses[0] + masses[1];
  const vBinary = Math.sqrt(G * binaryMass / (binaryR * 2)) * 0.8;
  const vSatellite = Math.sqrt(G * (binaryMass + masses[2]) / satelliteR) * 0.7;

  // Tilt binary plane
  const tilt = Math.PI / 5;

  const bodies: [BodyState, BodyState, BodyState] = [
    { x: binaryR, y: 0, z: 0, vx: 0, vy: vBinary * Math.sin(tilt), vz: vBinary * Math.cos(tilt), mass: masses[0] },
    { x: -binaryR, y: 0, z: 0, vx: 0, vy: -vBinary * Math.sin(tilt), vz: -vBinary * Math.cos(tilt), mass: masses[1] },
    { x: 0, y: satelliteR * Math.sin(tilt * 0.5), z: satelliteR * Math.cos(tilt * 0.5), vx: -vSatellite, vy: 0, vz: 0, mass: masses[2] },
  ];

  shiftToCenterOfMass(bodies);
  return bodies;
}

function createFigure8Config(masses: [number, number, number]): [BodyState, BodyState, BodyState] {
  // Chenciner-Montgomery figure-8 orbit
  // Only stable for equal masses; use average mass for near-equal
  // These are the known initial conditions (scaled to game units)
  const S = ORBITAL_RADIUS * 0.8; // scale factor
  const avgMass = (masses[0] + masses[1] + masses[2]) / 3;
  const vScale = Math.sqrt(G * avgMass / S) * 0.35;

  // Standard figure-8 initial conditions (Suvakov & Dmitrasinovic normalization)
  const bodies: [BodyState, BodyState, BodyState] = [
    { x: -S * 0.97, y: S * 0.24, z: 0, vx: vScale * 0.466, vy: vScale * 0.432, vz: 0, mass: masses[0] },
    { x: S * 0.97, y: -S * 0.24, z: 0, vx: vScale * 0.466, vy: vScale * 0.432, vz: 0, mass: masses[1] },
    { x: 0, y: 0, z: 0, vx: -vScale * 0.932, vy: -vScale * 0.864, vz: 0, mass: masses[2] },
  ];

  // Tilt the figure-8 plane for visual variety
  const tilt = Math.PI / 8;
  for (const b of bodies) {
    const oy = b.y, oz = b.z;
    b.y = oy * Math.cos(tilt) - oz * Math.sin(tilt);
    b.z = oy * Math.sin(tilt) + oz * Math.cos(tilt);
    const ovy = b.vy, ovz = b.vz;
    b.vy = ovy * Math.cos(tilt) - ovz * Math.sin(tilt);
    b.vz = ovy * Math.sin(tilt) + ovz * Math.cos(tilt);
  }

  shiftToCenterOfMass(bodies);
  return bodies;
}

function shiftToCenterOfMass(bodies: [BodyState, BodyState, BodyState]): void {
  let totalMass = 0;
  let cx = 0, cy = 0, cz = 0, cvx = 0, cvy = 0, cvz = 0;
  for (const b of bodies) {
    totalMass += b.mass;
    cx += b.x * b.mass; cy += b.y * b.mass; cz += b.z * b.mass;
    cvx += b.vx * b.mass; cvy += b.vy * b.mass; cvz += b.vz * b.mass;
  }
  cx /= totalMass; cy /= totalMass; cz /= totalMass;
  cvx /= totalMass; cvy /= totalMass; cvz /= totalMass;
  for (const b of bodies) {
    b.x -= cx; b.y -= cy; b.z -= cz;
    b.vx -= cvx; b.vy -= cvy; b.vz -= cvz;
  }
}

// ═══════════════════════════════════════════════════════════════
// Event detection
// ═══════════════════════════════════════════════════════════════

function distBetween(a: BodyState, b: BodyState): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function detectEvents(state: SunSimulationState): void {
  const [b0, b1, b2] = state.bodies;

  // Inter-body distances
  const d01 = distBetween(b0, b1);
  const d02 = distBetween(b0, b2);
  const d12 = distBetween(b1, b2);
  const avgDist = (d01 + d02 + d12) / 3;

  // Binary detection: check each pair
  const binaryThreshold = avgDist * BINARY_RATIO;
  const pairs: Array<[number, number, number]> = [[0, 1, d01], [0, 2, d02], [1, 2, d12]];

  let foundBinary = false;
  for (let p = 0; p < 3; p++) {
    const [i, j, dist] = pairs[p];
    if (dist < binaryThreshold) {
      state.binaryCounter[p] = Math.min(state.binaryCounter[p] + 1, BINARY_TICKS + 10);
    } else {
      state.binaryCounter[p] = Math.max(state.binaryCounter[p] - 2, 0);
    }
    if (state.binaryCounter[p] >= BINARY_TICKS && !foundBinary) {
      state.events.isBinary = true;
      state.events.binaryPair = [i, j];
      foundBinary = true;
    }
  }
  if (!foundBinary) {
    state.events.isBinary = false;
    state.events.binaryPair = null;
  }

  // Ejection detection: center of mass distance
  const totalMass = b0.mass + b1.mass + b2.mass;
  const comX = (b0.x * b0.mass + b1.x * b1.mass + b2.x * b2.mass) / totalMass;
  const comY = (b0.y * b0.mass + b1.y * b1.mass + b2.y * b2.mass) / totalMass;
  const comZ = (b0.z * b0.mass + b1.z * b1.mass + b2.z * b2.mass) / totalMass;

  const ejectionThreshold = avgDist * EJECTION_RATIO;
  let ejected = false;
  for (let i = 0; i < 3; i++) {
    const b = state.bodies[i];
    const dx = b.x - comX, dy = b.y - comY, dz = b.z - comZ;
    const distFromCoM = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distFromCoM > ejectionThreshold) {
      state.events.isEjection = true;
      state.events.ejectedIndex = i;
      ejected = true;
      break;
    }
  }
  if (!ejected) {
    state.events.isEjection = false;
    state.events.ejectedIndex = null;
  }

  // Total energy (KE + PE) for conservation validation
  let ke = 0, pe = 0;
  for (let i = 0; i < 3; i++) {
    const b = state.bodies[i];
    ke += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    for (let j = i + 1; j < 3; j++) {
      const bj = state.bodies[j];
      const dx = b.x - bj.x, dy = b.y - bj.y, dz = b.z - bj.z;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz + SOFTENING_SQ);
      pe -= G * b.mass * bj.mass / r;
    }
  }
  state.events.totalEnergy = ke + pe;
}

// ═══════════════════════════════════════════════════════════════
// Public API (backward-compatible signatures)
// ═══════════════════════════════════════════════════════════════

/** Create initial simulation state */
export function createSunSimulation(
  masses?: [number, number, number],
  initialConfig?: InitialConfig,
): SunSimulationState {
  const m: [number, number, number] = masses ?? [1.0, 1.0, 1.0];
  const config = initialConfig ?? 'triangle';

  let bodies: [BodyState, BodyState, BodyState];
  switch (config) {
    case 'hierarchical':
      bodies = createHierarchicalConfig(m);
      break;
    case 'figure8':
      bodies = createFigure8Config(m);
      break;
    case 'triangle':
    default:
      bodies = createTriangleConfig(m);
      break;
  }

  return {
    bodies,
    elapsedTime: 0,
    sunPositions: [
      projectToSky(bodies[0]),
      projectToSky(bodies[1]),
      projectToSky(bodies[2]),
    ],
    binaryCounter: [0, 0, 0],
    events: {
      isBinary: false,
      binaryPair: null,
      isEjection: false,
      ejectedIndex: null,
      totalEnergy: 0,
    },
  };
}

/** Advance the simulation by `dt` seconds and update sun positions */
export function advanceSunSimulation(state: SunSimulationState, dt: number): void {
  const masses: [number, number, number] = [
    state.bodies[0].mass,
    state.bodies[1].mass,
    state.bodies[2].mass,
  ];

  // Integrate in small fixed steps for numerical stability
  const steps = Math.min(Math.ceil(dt / SIM_STEP), MAX_STEPS_PER_TICK);
  let sv = bodiesToStateVec(state.bodies);
  for (let i = 0; i < steps; i++) {
    sv = integrateRK4(sv, masses, SIM_STEP);
  }

  // Update bodies from state vector
  state.bodies = stateVecToBodies(sv, masses);
  state.elapsedTime += dt;

  // Project to sky positions
  for (let i = 0; i < 3; i++) {
    state.sunPositions[i] = projectToSky(state.bodies[i]);
  }

  // Detect events
  detectEvents(state);
}

/** Get current simulation events */
export function getSimulationEvents(state: SunSimulationState): SimulationEvents {
  return state.events;
}

/** Get raw body states (for client-side visual effects) */
export function getBodyStates(state: SunSimulationState): [BodyState, BodyState, BodyState] {
  return state.bodies;
}

// ═══════════════════════════════════════════════════════════════
// Unchanged helper API (backward-compatible)
// ═══════════════════════════════════════════════════════════════

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
