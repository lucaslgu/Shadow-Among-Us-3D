import { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Stars, Sparkles, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../stores/game-store.js';
import { inputState } from '../networking/mouse-state.js';
import { EnvironmentAudio } from './EnvironmentAudio.js';
import { seededRandom } from '@shadow/shared';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type AtmosphereEra = 'stable' | 'chaosInferno' | 'chaosIce' | 'chaosGravity';

export interface ThreeBodyEnvironmentProps {
  currentEra?: AtmosphereEra;
  simulationSpeed?: number;
  gravityEnabled?: boolean;
  cameraShakeEnabled?: boolean;
}

interface SunConfig {
  color: string;
  radius: number;
  lightIntensity: number;
  phaseOffset: number;
  pulseSpeed?: number;
  coronaColor?: string;
  dustCloudColor?: string;
  coronaIntensity?: number;
  dustCloudRadius?: number;
}

interface EraVisuals {
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  ambientIntensity: number;
  ambientColor: THREE.Color;
}

interface SimulationRef {
  bodies: [{ x: number; y: number; z: number; vx: number; vy: number; vz: number; mass: number },
           { x: number; y: number; z: number; vx: number; vy: number; vz: number; mass: number },
           { x: number; y: number; z: number; vx: number; vy: number; vz: number; mass: number }];
  time: number;
  sunPositions: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  sunVelocities: [number, number, number];
  prevPositions: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  tidalForce: number; // 0..1 — how strong the tidal stress is (suns clustered or aligned)
  isSyzygy: boolean;
  visibleSunCount: number;
  detectedEra: AtmosphereEra;
  // N-body events
  isBinary: boolean;
  binaryPair: [number, number] | null;
  isEjection: boolean;
  ejectedIndex: number | null;
  totalEnergy: number;
}

// ═══════════════════════════════════════════════════════════════
// Shared Mutable State (exported for other components)
// ═══════════════════════════════════════════════════════════════

/** Camera shake offsets — read by ThirdPersonCamera */
export const cameraShakeState = {
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
};

/** Gravity state — read by gravity useFrame hook */
export const gravityState = {
  multiplier: 1.0,
  yVelocity: 0,
  isFloating: false,
  groundY: 0,
};

/** Era physics state — read by movement code for ice sliding + gravity slowdown */
export const eraPhysicsState = {
  isIce: false,
  isInferno: false,
  isGravity: false,
  slideVelocityX: 0,
  slideVelocityZ: 0,
  gravitySpeedFactor: 1.0, // 1.0 = normal, <1.0 = slower (heavy gravity)
};

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const SUN_DISTANCE = 250;
const CLUSTER_THRESHOLD = 0.5; // radians
const SYZYGY_DOT_THRESHOLD = 0.95;

// Reusable temp vectors to avoid per-frame allocations
const _tmpDir0 = new THREE.Vector3();
const _tmpDir1 = new THREE.Vector3();
const _tmpDir2 = new THREE.Vector3();

// N-body gravitational constants (must match shared/sun-simulation.ts)
const N_G = 800;
const N_SOFTENING_SQ = 25 * 25;
const N_DAMPING = 0.99995;
const N_BOUNDARY_RADIUS = 600;
const N_BOUNDARY_K = 0.5;
const N_SIM_STEP = 0.001;
const N_MAX_STEPS = 60;
const N_BINARY_RATIO = 0.3;
const N_BINARY_TICKS = 40;
const N_EJECTION_RATIO = 2.5;

const SUN_CONFIGS: [SunConfig, SunConfig, SunConfig] = [
  { color: '#ff6600', radius: 35, lightIntensity: 0.4, phaseOffset: 0 },
  { color: '#4488ff', radius: 24, lightIntensity: 0.3, phaseOffset: 2.094 },
  { color: '#ffffee', radius: 30, lightIntensity: 0.35, phaseOffset: 4.189 },
];

const ERA_PRESETS: Record<AtmosphereEra, EraVisuals> = {
  stable: {
    fogColor: new THREE.Color('#0a0a15'),
    fogNear: 5,
    fogFar: 55,
    ambientIntensity: 0.05,
    ambientColor: new THREE.Color('#223355'),
  },
  chaosInferno: {
    fogColor: new THREE.Color('#663311'),
    fogNear: 1,
    fogFar: 18,
    ambientIntensity: 0.3,
    ambientColor: new THREE.Color('#ff6622'),
  },
  chaosIce: {
    fogColor: new THREE.Color('#0c1525'),
    fogNear: 1,
    fogFar: 15,
    ambientIntensity: 0.02,
    ambientColor: new THREE.Color('#334466'),
  },
  chaosGravity: {
    fogColor: new THREE.Color('#1a0020'),
    fogNear: 2,
    fogFar: 28,
    ambientIntensity: 0.2,
    ambientColor: new THREE.Color('#8844ff'),
  },
};

// ═══════════════════════════════════════════════════════════════
// N-body Gravitational Simulation (real Three-Body Problem)
// Mirrors packages/shared/src/environment/sun-simulation.ts
// ═══════════════════════════════════════════════════════════════

type NBodyVec = Float64Array; // length 18

function nBodyDerivative(s: NBodyVec, masses: [number, number, number]): NBodyVec {
  const dsdt = new Float64Array(18);
  for (let i = 0; i < 3; i++) {
    const ix = i * 6;
    dsdt[ix] = s[ix + 3]; dsdt[ix + 1] = s[ix + 4]; dsdt[ix + 2] = s[ix + 5];
    let ax = 0, ay = 0, az = 0;
    for (let j = 0; j < 3; j++) {
      if (i === j) continue;
      const jx = j * 6;
      const dx = s[jx] - s[ix], dy = s[jx + 1] - s[ix + 1], dz = s[jx + 2] - s[ix + 2];
      const r2 = dx * dx + dy * dy + dz * dz + N_SOFTENING_SQ;
      const r = Math.sqrt(r2);
      const f = N_G * masses[j] / (r2 * r);
      ax += f * dx; ay += f * dy; az += f * dz;
    }
    const px = s[ix], py = s[ix + 1], pz = s[ix + 2];
    const dist = Math.sqrt(px * px + py * py + pz * pz);
    if (dist > N_BOUNDARY_RADIUS) {
      const excess = (dist - N_BOUNDARY_RADIUS) / N_BOUNDARY_RADIUS;
      const restore = -N_BOUNDARY_K * excess * excess;
      ax += restore * px / dist; ay += restore * py / dist; az += restore * pz / dist;
    }
    dsdt[ix + 3] = ax; dsdt[ix + 4] = ay; dsdt[ix + 5] = az;
  }
  return dsdt;
}

function addScaledNBody(a: NBodyVec, b: NBodyVec, scale: number): NBodyVec {
  const r = new Float64Array(18);
  for (let i = 0; i < 18; i++) r[i] = a[i] + b[i] * scale;
  return r;
}

function integrateNBodyRK4(s: NBodyVec, masses: [number, number, number], dt: number): NBodyVec {
  const k1 = nBodyDerivative(s, masses);
  const k2 = nBodyDerivative(addScaledNBody(s, k1, dt * 0.5), masses);
  const k3 = nBodyDerivative(addScaledNBody(s, k2, dt * 0.5), masses);
  const k4 = nBodyDerivative(addScaledNBody(s, k3, dt), masses);
  const result = new Float64Array(18);
  for (let i = 0; i < 18; i++) {
    result[i] = s[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }
  for (let i = 0; i < 3; i++) {
    result[i * 6 + 3] *= N_DAMPING; result[i * 6 + 4] *= N_DAMPING; result[i * 6 + 5] *= N_DAMPING;
  }
  return result;
}

/** Project N-body position onto sky sphere at SUN_DISTANCE */
function projectToSkyVec3(body: { x: number; y: number; z: number }, target: THREE.Vector3): void {
  const dist = Math.sqrt(body.x * body.x + body.y * body.y + body.z * body.z);
  if (dist < 0.001) { target.set(SUN_DISTANCE, 0, 0); return; }
  const scale = SUN_DISTANCE / dist;
  target.set(body.x * scale, body.y * scale, body.z * scale);
}

/** Create initial N-body triangle configuration */
function createInitialBodies(masses: [number, number, number]): SimulationRef['bodies'] {
  const R = 300; // orbital radius
  const totalMass = masses[0] + masses[1] + masses[2];
  const v = Math.sqrt(N_G * totalMass / (R * 1.73));
  const tilt = Math.PI / 6;
  const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
  const angles = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
  const bodies: SimulationRef['bodies'][number][] = [];
  for (let i = 0; i < 3; i++) {
    const a = angles[i];
    const px = R * Math.cos(a), pyz = R * Math.sin(a);
    const py = pyz * sinT, pz = pyz * cosT;
    const vx = -v * Math.sin(a), vyz = v * Math.cos(a);
    const vy = vyz * sinT, vz = vyz * cosT;
    bodies.push({ x: px, y: py, z: pz, vx, vy, vz, mass: masses[i] });
  }
  // Shift to center of mass
  let tm = 0, cx = 0, cy = 0, cz = 0, cvx = 0, cvy = 0, cvz = 0;
  for (const b of bodies) { tm += b.mass; cx += b.x * b.mass; cy += b.y * b.mass; cz += b.z * b.mass; cvx += b.vx * b.mass; cvy += b.vy * b.mass; cvz += b.vz * b.mass; }
  cx /= tm; cy /= tm; cz /= tm; cvx /= tm; cvy /= tm; cvz /= tm;
  for (const b of bodies) { b.x -= cx; b.y -= cy; b.z -= cz; b.vx -= cvx; b.vy -= cvy; b.vz -= cvz; }
  return bodies as SimulationRef['bodies'];
}

// ═══════════════════════════════════════════════════════════════
// Helper: smoothstep
// ═══════════════════════════════════════════════════════════════

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ═══════════════════════════════════════════════════════════════
// Helper: exponential lerp
// ═══════════════════════════════════════════════════════════════

function expLerp(current: number, target: number, speed: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-speed * delta));
}

function expLerpColor(current: THREE.Color, target: THREE.Color, speed: number, delta: number): void {
  current.r = expLerp(current.r, target.r, speed, delta);
  current.g = expLerp(current.g, target.g, speed, delta);
  current.b = expLerp(current.b, target.b, speed, delta);
}

// ═══════════════════════════════════════════════════════════════
// Era detection
// ═══════════════════════════════════════════════════════════════

function computeEra(
  sunPositions: [THREE.Vector3, THREE.Vector3, THREE.Vector3],
  isBinary?: boolean,
): { era: AtmosphereEra; visibleCount: number; isSyzygy: boolean } {
  _tmpDir0.copy(sunPositions[0]).normalize();
  _tmpDir1.copy(sunPositions[1]).normalize();
  _tmpDir2.copy(sunPositions[2]).normalize();

  const visibleCount =
    (sunPositions[0].y > 0 ? 1 : 0) +
    (sunPositions[1].y > 0 ? 1 : 0) +
    (sunPositions[2].y > 0 ? 1 : 0);

  // Syzygy check: all three roughly collinear
  const dot01 = Math.abs(_tmpDir0.dot(_tmpDir1));
  const dot02 = Math.abs(_tmpDir0.dot(_tmpDir2));
  const dot12 = Math.abs(_tmpDir1.dot(_tmpDir2));
  const isSyzygy = dot01 > SYZYGY_DOT_THRESHOLD && dot02 > SYZYGY_DOT_THRESHOLD && dot12 > SYZYGY_DOT_THRESHOLD;

  if (visibleCount === 0) {
    return { era: 'chaosIce', visibleCount, isSyzygy };
  }

  // Check if visible suns are clustered
  if (visibleCount >= 2) {
    // Angular distance between visible suns
    const visibleIndices: number[] = [];
    for (let i = 0; i < 3; i++) {
      if (sunPositions[i].y > 0) visibleIndices.push(i);
    }
    let minAngularDist = Infinity;
    for (let i = 0; i < visibleIndices.length; i++) {
      for (let j = i + 1; j < visibleIndices.length; j++) {
        const dirs = [_tmpDir0, _tmpDir1, _tmpDir2];
        const dot = dirs[visibleIndices[i]].dot(dirs[visibleIndices[j]]);
        const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
        minAngularDist = Math.min(minAngularDist, angle);
      }
    }
    if (minAngularDist < CLUSTER_THRESHOLD) {
      return { era: 'chaosInferno', visibleCount, isSyzygy };
    }
  }

  // Binary formation → chaosGravity
  if (isBinary) {
    return { era: 'chaosGravity', visibleCount, isSyzygy };
  }

  return { era: 'stable', visibleCount, isSyzygy };
}

// ═══════════════════════════════════════════════════════════════
// Hook: useThreeBodySimulation
// ═══════════════════════════════════════════════════════════════

function useThreeBodySimulation(simulationSpeed: number): React.RefObject<SimulationRef> {
  const cosmicScenario = useGameStore((st) => st.cosmicScenario);
  const masses: [number, number, number] = useMemo(() => {
    if (!cosmicScenario) return [1.0, 1.0, 1.0];
    return cosmicScenario.suns.map(s => s.mass ?? 1.0) as [number, number, number];
  }, [cosmicScenario]);

  const simRef = useRef<SimulationRef>({
    bodies: createInitialBodies([1.0, 1.0, 1.0]),
    time: 0,
    sunPositions: [new THREE.Vector3(SUN_DISTANCE, 0, 0), new THREE.Vector3(0, 0, SUN_DISTANCE), new THREE.Vector3(-SUN_DISTANCE, 0, 0)],
    sunVelocities: [0, 0, 0],
    prevPositions: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    tidalForce: 0,
    isSyzygy: false,
    visibleSunCount: 1,
    detectedEra: 'stable',
    isBinary: false,
    binaryPair: null,
    isEjection: false,
    ejectedIndex: null,
    totalEnergy: 0,
  });

  // Binary detection counters (persistent across frames)
  const binaryCounterRef = useRef<[number, number, number]>([0, 0, 0]);
  const energyFrameRef = useRef(0);

  // Re-initialize bodies when masses change (new game / new scenario)
  const lastMassesRef = useRef<string>('');
  useEffect(() => {
    const key = masses.join(',');
    if (key !== lastMassesRef.current) {
      lastMassesRef.current = key;
      simRef.current.bodies = createInitialBodies(masses);
      binaryCounterRef.current = [0, 0, 0];
    }
  }, [masses]);

  useFrame((_, rawDelta) => {
    const sim = simRef.current;
    const delta = Math.max(0.001, Math.min(0.05, rawDelta));
    const dt = delta * simulationSpeed;

    // Store previous positions for velocity
    for (let i = 0; i < 3; i++) {
      sim.prevPositions[i].copy(sim.sunPositions[i]);
    }

    // ── Integrate N-body gravitational system (RK4) ──
    const m: [number, number, number] = [sim.bodies[0].mass, sim.bodies[1].mass, sim.bodies[2].mass];
    const steps = Math.min(Math.ceil(dt / N_SIM_STEP), N_MAX_STEPS);
    let sv: NBodyVec = new Float64Array(18);
    for (let i = 0; i < 3; i++) {
      const b = sim.bodies[i];
      sv[i * 6] = b.x; sv[i * 6 + 1] = b.y; sv[i * 6 + 2] = b.z;
      sv[i * 6 + 3] = b.vx; sv[i * 6 + 4] = b.vy; sv[i * 6 + 5] = b.vz;
    }
    for (let s = 0; s < steps; s++) {
      sv = integrateNBodyRK4(sv, m, N_SIM_STEP);
    }
    for (let i = 0; i < 3; i++) {
      sim.bodies[i].x = sv[i * 6]; sim.bodies[i].y = sv[i * 6 + 1]; sim.bodies[i].z = sv[i * 6 + 2];
      sim.bodies[i].vx = sv[i * 6 + 3]; sim.bodies[i].vy = sv[i * 6 + 4]; sim.bodies[i].vz = sv[i * 6 + 5];
    }
    sim.time += dt;

    // Project body positions to sky sphere
    for (let i = 0; i < 3; i++) {
      projectToSkyVec3(sim.bodies[i], sim.sunPositions[i]);
    }

    // Compute velocities (units per second)
    for (let i = 0; i < 3; i++) {
      sim.sunVelocities[i] = sim.sunPositions[i].distanceTo(sim.prevPositions[i]) / Math.max(delta, 0.001);
    }

    // ── Event detection: binary, ejection, energy ──
    const [b0, b1, b2] = sim.bodies;
    const d01 = Math.sqrt((b0.x - b1.x) ** 2 + (b0.y - b1.y) ** 2 + (b0.z - b1.z) ** 2);
    const d02 = Math.sqrt((b0.x - b2.x) ** 2 + (b0.y - b2.y) ** 2 + (b0.z - b2.z) ** 2);
    const d12 = Math.sqrt((b1.x - b2.x) ** 2 + (b1.y - b2.y) ** 2 + (b1.z - b2.z) ** 2);
    const avgDist = (d01 + d02 + d12) / 3;
    const binaryThreshold = avgDist * N_BINARY_RATIO;
    const pairs: [number, number, number][] = [[0, 1, d01], [0, 2, d02], [1, 2, d12]];
    let foundBinary = false;
    const bc = binaryCounterRef.current;
    for (let p = 0; p < 3; p++) {
      if (pairs[p][2] < binaryThreshold) {
        bc[p] = Math.min(bc[p] + 1, N_BINARY_TICKS + 10);
      } else {
        bc[p] = Math.max(bc[p] - 2, 0);
      }
      if (bc[p] >= N_BINARY_TICKS && !foundBinary) {
        sim.isBinary = true;
        sim.binaryPair = [pairs[p][0], pairs[p][1]];
        foundBinary = true;
      }
    }
    if (!foundBinary) { sim.isBinary = false; sim.binaryPair = null; }

    // Ejection detection
    const totalMass = b0.mass + b1.mass + b2.mass;
    const comX = (b0.x * b0.mass + b1.x * b1.mass + b2.x * b2.mass) / totalMass;
    const comY = (b0.y * b0.mass + b1.y * b1.mass + b2.y * b2.mass) / totalMass;
    const comZ = (b0.z * b0.mass + b1.z * b1.mass + b2.z * b2.mass) / totalMass;
    const ejThreshold = avgDist * N_EJECTION_RATIO;
    sim.isEjection = false; sim.ejectedIndex = null;
    for (let i = 0; i < 3; i++) {
      const b = sim.bodies[i];
      const dfc = Math.sqrt((b.x - comX) ** 2 + (b.y - comY) ** 2 + (b.z - comZ) ** 2);
      if (dfc > ejThreshold) { sim.isEjection = true; sim.ejectedIndex = i; break; }
    }

    // Total energy
    let ke = 0, pe = 0;
    for (let i = 0; i < 3; i++) {
      const b = sim.bodies[i];
      ke += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
      for (let j = i + 1; j < 3; j++) {
        const bj = sim.bodies[j];
        const r = Math.sqrt((b.x - bj.x) ** 2 + (b.y - bj.y) ** 2 + (b.z - bj.z) ** 2 + N_SOFTENING_SQ);
        pe -= N_G * b.mass * bj.mass / r;
      }
    }
    sim.totalEnergy = ke + pe;

    // Update store every ~60 frames (~1s) for HUD energy indicator
    if (++energyFrameRef.current >= 60) {
      energyFrameRef.current = 0;
      useGameStore.setState({ systemEnergy: sim.totalEnergy });
    }

    // Detect era (with binary override)
    const { era, visibleCount, isSyzygy } = computeEra(sim.sunPositions, sim.isBinary);
    sim.detectedEra = era;
    sim.visibleSunCount = visibleCount;
    sim.isSyzygy = isSyzygy;

    // Compute tidal force
    _tmpDir0.copy(sim.sunPositions[0]).normalize();
    _tmpDir1.copy(sim.sunPositions[1]).normalize();
    _tmpDir2.copy(sim.sunPositions[2]).normalize();
    const dot01 = Math.abs(_tmpDir0.dot(_tmpDir1));
    const dot02 = Math.abs(_tmpDir0.dot(_tmpDir2));
    const dot12 = Math.abs(_tmpDir1.dot(_tmpDir2));
    const maxDot = Math.max(dot01, dot02, dot12);
    sim.tidalForce = smoothstep(0.7, 0.98, maxDot);
    // Binary boosts tidal force
    if (sim.isBinary) sim.tidalForce = Math.max(sim.tidalForce, 0.8);
  });

  return simRef;
}

// ═══════════════════════════════════════════════════════════════
// Hook: useCameraShake
// ═══════════════════════════════════════════════════════════════

function useCameraShake(simRef: React.RefObject<SimulationRef>, enabled: boolean): void {
  const phaseRef = useRef({ x: Math.random() * 100, y: Math.random() * 100, z: Math.random() * 100 });

  useEffect(() => {
    return () => {
      cameraShakeState.offsetX = 0;
      cameraShakeState.offsetY = 0;
      cameraShakeState.offsetZ = 0;
    };
  }, []);

  useFrame((_, rawDelta) => {
    if (!enabled) {
      cameraShakeState.offsetX = 0;
      cameraShakeState.offsetY = 0;
      cameraShakeState.offsetZ = 0;
      return;
    }

    const delta = Math.min(rawDelta, 0.05);
    const sim = simRef.current;

    // Shelter check — reduce shake when player is inside a closed room
    const storeCS = useGameStore.getState();
    const localIdCS = storeCS.localPlayerId;
    const inShelterCS = localIdCS ? storeCS.players[localIdCS]?.inShelter ?? false : false;
    const shelterDamp = inShelterCS ? 0.1 : 1.0;

    // Tidal force drives shake intensity — gravitational stress from sun proximity/alignment
    // Max 0.015 radians (~0.86 degrees) — noticeable but not nauseating
    const intensity = sim.tidalForce * 0.015 * shelterDamp;

    // Advance phases at different frequencies
    phaseRef.current.x += delta * 17.3;
    phaseRef.current.y += delta * 13.7;
    phaseRef.current.z += delta * 11.1;

    const px = phaseRef.current.x;
    const py = phaseRef.current.y;
    const pz = phaseRef.current.z;

    // Multi-frequency sin composition for organic feel
    cameraShakeState.offsetX = intensity * (
      Math.sin(px) * 0.5 +
      Math.sin(px * 2.3) * 0.3 +
      Math.sin(px * 4.7) * 0.2
    );
    cameraShakeState.offsetY = intensity * (
      Math.sin(py) * 0.5 +
      Math.sin(py * 1.9) * 0.3 +
      Math.sin(py * 3.1) * 0.2
    );
    cameraShakeState.offsetZ = intensity * 0.3 * Math.sin(pz);
  });
}

// ═══════════════════════════════════════════════════════════════
// Hook: useGravityEvent
// ═══════════════════════════════════════════════════════════════

function useGravityEvent(simRef: React.RefObject<SimulationRef>, enabled: boolean, activeEra: AtmosphereEra): void {
  const yOffsetRef = useRef(0);
  const yVelRef = useRef(0);
  const lastSyzygyRef = useRef(false);
  const eventTimerRef = useRef(15 + Math.random() * 15);
  const microImpulseTimer = useRef(3 + Math.random() * 4);

  useEffect(() => {
    return () => {
      gravityState.multiplier = 1.0;
      gravityState.yVelocity = 0;
      gravityState.isFloating = false;
      // Reset player Y to ground
      const store = useGameStore.getState();
      const [px, , pz] = store.localPosition;
      store.updateLocalPosition([px, 0, pz], store.localRotation);
    };
  }, []);

  useFrame((_, rawDelta) => {
    if (!enabled) {
      yOffsetRef.current = 0;
      yVelRef.current = 0;
      gravityState.multiplier = 1.0;
      gravityState.isFloating = false;
      return;
    }

    const delta = Math.min(rawDelta, 0.05);
    const sim = simRef.current;

    // Shelter check — player inside a closed room is protected from environmental effects
    const storeGE = useGameStore.getState();
    const localIdGE = storeGE.localPlayerId;
    const inShelter = localIdGE ? storeGE.players[localIdGE]?.inShelter ?? false : false;

    if (inShelter) {
      // Inside shelter: normal physics, no era effects
      eraPhysicsState.isIce = false;
      eraPhysicsState.isInferno = false;
      eraPhysicsState.isGravity = false;
      eraPhysicsState.gravitySpeedFactor = 1.0;
      gravityState.multiplier = expLerp(gravityState.multiplier, 1.0, 2.0, delta);
      lastSyzygyRef.current = sim.isSyzygy;
    } else {
      // Update era physics state for movement code
      eraPhysicsState.isIce = activeEra === 'chaosIce';
      eraPhysicsState.isInferno = activeEra === 'chaosInferno' || activeEra === 'chaosGravity';
      eraPhysicsState.isGravity = activeEra === 'chaosGravity';

      // Era-based gravity target (from AI scenario if available, otherwise hardcoded)
      const serverGravity = useGameStore.getState().eraGravity;
      let eraGravityTarget = serverGravity ?? 1.0;
      if (serverGravity == null) {
        if (activeEra === 'chaosIce') eraGravityTarget = 0.3;
        else if (activeEra === 'chaosInferno') eraGravityTarget = 2.0;
        else if (activeEra === 'chaosGravity') eraGravityTarget = 3.0;
      }

      // Gravity-based movement slowdown: high gravity → slower movement
      // At gravity 1.0 → factor 1.0, at 3.0 → ~0.58, at 4.0 → 0.5, min 0.4
      if (activeEra === 'chaosGravity' && eraGravityTarget > 1.0) {
        eraPhysicsState.gravitySpeedFactor = Math.max(0.4, 1.0 / Math.sqrt(eraGravityTarget));
      } else {
        eraPhysicsState.gravitySpeedFactor = 1.0;
      }

      // ── Syzygy event: all 3 suns aligned → massive gravitational anomaly ──
      // Launches everyone into the air with near-zero gravity for several seconds
      if (sim.isSyzygy && !lastSyzygyRef.current) {
        gravityState.multiplier = 0.02; // almost zero gravity
        yVelRef.current = 8.0 + Math.random() * 4.0; // strong upward launch
        gravityState.isFloating = true;
      }
      lastSyzygyRef.current = sim.isSyzygy;

      // During syzygy: keep gravity extremely low so players float for a long time
      if (sim.isSyzygy) {
        gravityState.multiplier = expLerp(gravityState.multiplier, 0.02, 1.0, delta);
      } else {
        // Random gravity fluctuations outside syzygy
        eventTimerRef.current -= delta;
        if (eventTimerRef.current <= 0) {
          eventTimerRef.current = 8 + Math.random() * 10;
          gravityState.multiplier = 0.2 + Math.random() * 2.0;
        }
        gravityState.multiplier = expLerp(gravityState.multiplier, eraGravityTarget, 0.5, delta);
      }

      // ── Tidal lift: high tidal force lifts players off the ground ──
      // tidalForce > 0.4 → upward force proportional to tidal stress
      if (sim.tidalForce > 0.4 && yOffsetRef.current < 3.0) {
        const liftStrength = (sim.tidalForce - 0.4) * 12.0; // 0..7.2 upward accel
        yVelRef.current += liftStrength * delta;
        if (yVelRef.current > 0) gravityState.isFloating = true;
      }

      // Ice era: micro-impulses (upward nudges — player floats in low gravity)
      if (activeEra === 'chaosIce' && yOffsetRef.current < 1.0) {
        microImpulseTimer.current -= delta;
        if (microImpulseTimer.current <= 0) {
          microImpulseTimer.current = 2 + Math.random() * 3;
          yVelRef.current += 2.5 + Math.random() * 2.0;
          gravityState.isFloating = true;
        }
      }

      // ChaosGravity: extreme gravity fluctuations + strong tidal drag
      if (activeEra === 'chaosGravity' && yOffsetRef.current < 2.0) {
        microImpulseTimer.current -= delta;
        if (microImpulseTimer.current <= 0) {
          microImpulseTimer.current = 1 + Math.random() * 2;
          // Random gravity spike or drop
          if (Math.random() > 0.5) {
            yVelRef.current += 4.0 + Math.random() * 3.0; // launch up
            gravityState.isFloating = true;
          } else {
            gravityState.multiplier = 4.0 + Math.random() * 2.0; // slam down
          }
        }
      }

      // Ejection event: brief anti-gravity pulse
      if (sim.isEjection && !sim.isSyzygy) {
        gravityState.multiplier = expLerp(gravityState.multiplier, 0.1, 2.0, delta);
        if (yOffsetRef.current < 0.5) {
          yVelRef.current += 3.0 * delta;
          gravityState.isFloating = true;
        }
      }

      // ── Tidal lateral drag: pull/slide player toward nearest sun ──
      // The effect is strong enough to visibly drag players across the floor
      if (sim.tidalForce > 0.3) {
        const store = useGameStore.getState();
        const [px, , pz] = store.localPosition;
        // Find nearest sun in XZ plane
        let nearestDist = Infinity;
        let pullX = 0;
        let pullZ = 0;
        for (let i = 0; i < 3; i++) {
          const sp = sim.sunPositions[i];
          const dx = sp.x - px;
          const dz = sp.z - pz;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < nearestDist) {
            nearestDist = dist;
            pullX = dx / (dist + 1);
            pullZ = dz / (dist + 1);
          }
        }
        // Scale: at tidalForce=1.0, drag is ~8 units/s (very noticeable)
        const dragStrength = (sim.tidalForce - 0.3) * 12.0 * delta;
        const newPx = px + pullX * dragStrength;
        const newPz = pz + pullZ * dragStrength;
        store.updateLocalPosition([newPx, store.localPosition[1], newPz], store.localRotation);
      }
    }

    // Jump — consume input request when on ground
    if (inputState.jumpRequested && yOffsetRef.current <= 0.01) {
      yVelRef.current = 5.0;
      gravityState.isFloating = true;
      inputState.jumpRequested = false;
    } else if (inputState.jumpRequested && yOffsetRef.current > 0.01) {
      // Can't jump mid-air — discard
      inputState.jumpRequested = false;
    }

    // Apply Y-axis physics
    const gravity = -9.8 * gravityState.multiplier;
    yVelRef.current += gravity * delta;
    yOffsetRef.current += yVelRef.current * delta;

    // Ground collision
    if (yOffsetRef.current <= 0) {
      yOffsetRef.current = 0;
      yVelRef.current = 0;
      gravityState.isFloating = false;
    }

    gravityState.yVelocity = yVelRef.current;

    // Apply Y offset to local position
    const store = useGameStore.getState();
    const [px, , pz] = store.localPosition;
    const newY = gravityState.groundY + yOffsetRef.current;
    store.updateLocalPosition([px, newY, pz], store.localRotation);
  });
}

// ═══════════════════════════════════════════════════════════════
// Component: Sun (sphere + directional light)
// ═══════════════════════════════════════════════════════════════

function Sun({
  config,
  simRef,
  index,
  eraBlendRef,
}: {
  config: SunConfig;
  simRef: React.RefObject<SimulationRef>;
  index: number;
  eraBlendRef: React.RefObject<{ current: EraVisuals }>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const sphereRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const diskRef = useRef<THREE.Points>(null);

  const coronaColor = config.coronaColor ?? config.color;
  const dustColor = config.dustCloudColor ?? config.color;
  const coronaRadius = config.radius * 2.5;
  const coronaSize = config.radius * 0.15;
  const diskRadius = config.dustCloudRadius ?? config.radius * 2;
  const coronaInt = config.coronaIntensity ?? 1.0;

  const pulseFreq = useMemo(() => config.pulseSpeed ?? (0.8 + index * 0.3), [config.pulseSpeed, index]);

  // Pre-compute accretion disk geometry (ring of particles)
  const diskGeometry = useMemo(() => {
    const count = 200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const dustCol = new THREE.Color(dustColor);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = diskRadius * (0.6 + Math.random() * 0.4);
      const tilt = (Math.random() - 0.5) * diskRadius * 0.08;
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = tilt;
      positions[i * 3 + 2] = Math.sin(angle) * r;

      const variation = 0.8 + Math.random() * 0.4;
      colors[i * 3] = dustCol.r * variation;
      colors[i * 3 + 1] = dustCol.g * variation;
      colors[i * 3 + 2] = dustCol.b * variation;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [dustColor, diskRadius]);

  useFrame((state) => {
    const sim = simRef.current;
    const pos = sim.sunPositions[index];
    const time = state.clock.elapsedTime;

    if (groupRef.current) {
      groupRef.current.position.copy(pos);
    }

    // Sun pulsation — scale oscillates ~5%
    const pulse = 1 + Math.sin(time * pulseFreq) * 0.05;
    if (sphereRef.current) {
      sphereRef.current.scale.setScalar(pulse);
    }

    // Glow pulsation (inverse — larger glow when sun contracts)
    if (glowRef.current) {
      glowRef.current.scale.setScalar(1.8 + Math.sin(time * pulseFreq * 0.7) * 0.15);
    }

    // Rotate accretion disk slowly
    if (diskRef.current) {
      diskRef.current.rotation.y += 0.002 * (1 + index * 0.3);
      diskRef.current.rotation.x = 0.3 + index * 0.2;
    }

    if (lightRef.current && targetRef.current) {
      lightRef.current.position.copy(pos);
      targetRef.current.position.set(0, 0, 0);
      lightRef.current.target = targetRef.current;

      const horizonFade = smoothstep(-20, 20, pos.y);
      const elevation = smoothstep(0, SUN_DISTANCE * 0.7, pos.y);
      const daylightScale = 1 + elevation * 2;
      lightRef.current.intensity = config.lightIntensity * horizonFade * daylightScale;
      lightRef.current.castShadow = false;
    }
  });

  return (
    <>
      <group ref={groupRef}>
        {/* Sun sphere (emissive for bloom) */}
        <mesh ref={sphereRef}>
          <sphereGeometry args={[config.radius, 16, 16]} />
          <meshBasicMaterial color={config.color} toneMapped={false} />
        </mesh>

        {/* Inner glow halo (additive transparent sphere) */}
        <mesh ref={glowRef}>
          <sphereGeometry args={[config.radius * 1.6, 16, 16]} />
          <meshBasicMaterial
            color={coronaColor}
            transparent
            opacity={0.15 * coronaInt}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>

        {/* Inner corona particles (bright, close) */}
        <Sparkles
          count={30}
          scale={[coronaRadius * 0.7, coronaRadius * 0.7, coronaRadius * 0.7]}
          size={coronaSize * 2}
          speed={2}
          color={coronaColor}
          opacity={0.9 * coronaInt}
          noise={2}
        />

        {/* Outer corona particles (dim, spread) */}
        <Sparkles
          count={18}
          scale={[coronaRadius * 1.2, coronaRadius * 1.2, coronaRadius * 1.2]}
          size={coronaSize}
          speed={0.8}
          color={config.color}
          opacity={0.4 * coronaInt}
          noise={1.5}
        />

        {/* Accretion disk / dust cloud (orbiting particles) */}
        <points ref={diskRef} geometry={diskGeometry}>
          <pointsMaterial
            vertexColors
            size={2.5}
            sizeAttenuation
            transparent
            opacity={0.6}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </points>
      </group>

      <directionalLight ref={lightRef} color={config.color} intensity={config.lightIntensity} />
      <object3D ref={targetRef} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Component: GLBSun (realistic 3D model-based celestial body)
// ═══════════════════════════════════════════════════════════════

const BROWN_DWARF_PATH = '/models/type_l_brown_dwarf__substellar_object.glb';

// Per-sun rotation axis tilt (radians) for visual variety
const SUN_AXIS_TILTS: [number, number, number][] = [
  [0.15, 0, 0.1],    // slight tilt
  [-0.2, 0, 0.25],   // more tilted
  [0.05, 0, -0.15],  // subtle
];

// Per-sun rotation speed (radians/frame)
const SUN_ROTATION_SPEEDS = [0.003, 0.0045, 0.002];

function GLBSun({
  config,
  simRef,
  index,
}: {
  config: SunConfig;
  simRef: React.RefObject<SimulationRef>;
  index: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  const modelRef = useRef<THREE.Group>(null);
  const glowInnerRef = useRef<THREE.Mesh>(null);
  const glowOuterRef = useRef<THREE.Mesh>(null);
  const diskRef = useRef<THREE.Points>(null);

  const { scene } = useGLTF(BROWN_DWARF_PATH);

  const coronaColor = config.coronaColor ?? config.color;
  const dustColor = config.dustCloudColor ?? config.color;
  const diskRadius = config.dustCloudRadius ?? config.radius * 2;
  const coronaInt = config.coronaIntensity ?? 1.0;
  const coronaRadius = config.radius * 2.5;
  const coronaSize = config.radius * 0.15;

  // Clone scene and preserve original materials with subtle emissive tint
  // Keep textures visible (craters, atmosphere detail) while adding bloom glow
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    const tint = new THREE.Color(config.color);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const origMat = mesh.material;
        if (origMat instanceof THREE.MeshStandardMaterial) {
          const mat = origMat.clone();
          // Preserve original diffuse map, normalMap, roughnessMap, etc.
          // Add subtle emissive so bloom picks it up without washing out texture
          mat.emissive = tint;
          mat.emissiveIntensity = 0.4;
          if (origMat.map) {
            mat.emissiveMap = origMat.map;
          }
          // Slightly brighten the base color so texture detail is visible at distance
          mat.color.lerp(tint, 0.3);
          mat.toneMapped = false;
          mat.needsUpdate = true;
          mesh.material = mat;
        } else {
          // Fallback: basic emissive material
          mesh.material = new THREE.MeshBasicMaterial({
            color: tint,
            toneMapped: false,
          });
        }
      }
    });
    return clone;
  }, [scene, config.color]);

  const pulseFreq = useMemo(() => config.pulseSpeed ?? (0.8 + index * 0.3), [config.pulseSpeed, index]);

  // Pre-compute accretion disk geometry (ring of orbiting particles)
  const diskGeometry = useMemo(() => {
    const count = 200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const dustCol = new THREE.Color(dustColor);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = diskRadius * (0.6 + Math.random() * 0.4);
      const tilt = (Math.random() - 0.5) * diskRadius * 0.08;
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = tilt;
      positions[i * 3 + 2] = Math.sin(angle) * r;

      const variation = 0.8 + Math.random() * 0.4;
      colors[i * 3] = dustCol.r * variation;
      colors[i * 3 + 1] = dustCol.g * variation;
      colors[i * 3 + 2] = dustCol.b * variation;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [dustColor, diskRadius]);

  const modelScale = config.radius * 0.6;
  const axisTilt = SUN_AXIS_TILTS[index] ?? SUN_AXIS_TILTS[0];
  const rotSpeed = SUN_ROTATION_SPEEDS[index] ?? 0.003;

  useFrame((state) => {
    const sim = simRef.current;
    const pos = sim.sunPositions[index];
    const time = state.clock.elapsedTime;

    if (groupRef.current) {
      groupRef.current.position.copy(pos);
    }

    // Model rotation: steady spin with axis tilt + pulsation
    if (modelRef.current) {
      modelRef.current.rotation.y += rotSpeed;
      modelRef.current.rotation.x = axisTilt[0] + Math.sin(time * 0.1 + index) * 0.03;
      modelRef.current.rotation.z = axisTilt[2];
      const pulse = 1 + Math.sin(time * pulseFreq) * 0.04 + Math.sin(time * pulseFreq * 1.7) * 0.02;
      modelRef.current.scale.setScalar(modelScale * pulse);
    }

    // Inner glow pulsation (inverse phase — expands when model contracts)
    if (glowInnerRef.current) {
      const glowPulse = 1.0 + Math.sin(time * pulseFreq * 0.7 + Math.PI) * 0.08;
      glowInnerRef.current.scale.setScalar(glowPulse);
    }

    // Outer atmosphere: slow breathing
    if (glowOuterRef.current) {
      const atmPulse = 1.0 + Math.sin(time * 0.3 + index * 2) * 0.05;
      glowOuterRef.current.scale.setScalar(atmPulse);
    }

    // Rotate accretion disk slowly
    if (diskRef.current) {
      diskRef.current.rotation.y += 0.002 * (1 + index * 0.3);
    }

    if (lightRef.current && targetRef.current) {
      lightRef.current.position.copy(pos);
      targetRef.current.position.set(0, 0, 0);
      lightRef.current.target = targetRef.current;

      const horizonFade = smoothstep(-20, 20, pos.y);
      const elevation = smoothstep(0, SUN_DISTANCE * 0.7, pos.y);
      const daylightScale = 1 + elevation * 2;
      lightRef.current.intensity = config.lightIntensity * horizonFade * daylightScale;
      lightRef.current.castShadow = false;
    }
  });

  return (
    <>
      <group ref={groupRef}>
        {/* 3D model celestial body (preserves original textures) */}
        <group ref={modelRef} scale={modelScale}>
          <primitive object={clonedScene} />
        </group>

        {/* Inner glow halo (subtle photosphere edge — doesn't obscure model detail) */}
        <mesh ref={glowInnerRef}>
          <sphereGeometry args={[config.radius * 1.5, 20, 20]} />
          <meshBasicMaterial
            color={config.color}
            transparent
            opacity={0.08 * coronaInt}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>

        {/* Outer atmospheric shell (diffuse, large — chromosphere) */}
        <mesh ref={glowOuterRef}>
          <sphereGeometry args={[config.radius * 2.5, 16, 16]} />
          <meshBasicMaterial
            color={coronaColor}
            transparent
            opacity={0.04 * coronaInt}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>

        {/* Inner corona particles (bright, close to surface) */}
        <Sparkles
          count={30}
          scale={[coronaRadius * 0.7, coronaRadius * 0.7, coronaRadius * 0.7]}
          size={coronaSize * 2}
          speed={2}
          color={coronaColor}
          opacity={0.9 * coronaInt}
          noise={2}
        />

        {/* Outer corona particles (dim, spread — stellar wind) */}
        <Sparkles
          count={18}
          scale={[coronaRadius * 1.2, coronaRadius * 1.2, coronaRadius * 1.2]}
          size={coronaSize}
          speed={0.8}
          color={config.color}
          opacity={0.4 * coronaInt}
          noise={1.5}
        />

        {/* Accretion disk / dust cloud (orbiting particles) */}
        <points ref={diskRef} geometry={diskGeometry} rotation={[0.3 + index * 0.2, 0, 0]}>
          <pointsMaterial
            vertexColors
            size={2.5}
            sizeAttenuation
            transparent
            opacity={0.6}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </points>
      </group>

      <directionalLight ref={lightRef} color={config.color} intensity={config.lightIntensity} />
      <object3D ref={targetRef} />
    </>
  );
}

useGLTF.preload(BROWN_DWARF_PATH);

// ═══════════════════════════════════════════════════════════════
// Component: AtmosphereController (fog + ambient light)
// ═══════════════════════════════════════════════════════════════

function AtmosphereController({
  activeEra,
  eraBlendRef,
  simRef,
}: {
  activeEra: AtmosphereEra;
  eraBlendRef: React.RefObject<{ current: EraVisuals }>;
  simRef: React.RefObject<SimulationRef>;
}) {
  const { scene } = useThree();
  const ambientRef = useRef<THREE.AmbientLight>(null);

  // Initialize fog
  useEffect(() => {
    scene.fog = new THREE.Fog('#0a0a15', 50, 200);
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const target = ERA_PRESETS[activeEra];
    const blend = eraBlendRef.current;
    const speed = 2;

    // Compute daylight factor from sun elevations:
    // Highest sun Y normalized to [0, 1] — 0 = all below horizon, 1 = a sun is at zenith
    const sim = simRef.current;
    const maxSunY = Math.max(
      sim.sunPositions[0].y,
      sim.sunPositions[1].y,
      sim.sunPositions[2].y,
    );
    // smoothstep from horizon (0) to high in sky (SUN_DISTANCE * 0.7)
    const daylight = smoothstep(0, SUN_DISTANCE * 0.7, maxSunY);

    // Lerp all visual parameters toward era targets
    expLerpColor(blend.current.fogColor, target.fogColor, speed, delta);
    blend.current.fogNear = expLerp(blend.current.fogNear, target.fogNear, speed, delta);
    blend.current.fogFar = expLerp(blend.current.fogFar, target.fogFar, speed, delta);
    blend.current.ambientIntensity = expLerp(blend.current.ambientIntensity, target.ambientIntensity, speed, delta);
    expLerpColor(blend.current.ambientColor, target.ambientColor, speed, delta);

    // Apply fog — push fog further away during daylight (better visibility)
    if (scene.fog && scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(blend.current.fogColor);
      const daylightFogBoost = 1 + daylight * 0.5; // up to 1.5x fog distance at full day
      scene.fog.near = blend.current.fogNear * daylightFogBoost;
      scene.fog.far = blend.current.fogFar * daylightFogBoost;
    }

    // Apply ambient light — boost intensity with sun elevation
    if (ambientRef.current) {
      // Daylight multiplier: from 1x (night) to 4x (bright day)
      const daylightBoost = 1 + daylight * 3;
      ambientRef.current.intensity = blend.current.ambientIntensity * daylightBoost;
      ambientRef.current.color.copy(blend.current.ambientColor);
    }
  });

  return <ambientLight ref={ambientRef} intensity={0.05} color="#223355" />;
}

// ═══════════════════════════════════════════════════════════════
// Component: SolarRays — blinding heat glare during chaosInferno
// ═══════════════════════════════════════════════════════════════

const SOLAR_RAY_MAT = new THREE.MeshBasicMaterial({
  color: '#ffaa44',
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const SOLAR_GLARE_MAT = new THREE.MeshBasicMaterial({
  color: '#ff8833',
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.BackSide,
});

const SOLAR_RAY_GEO = new THREE.PlaneGeometry(2.5, 35);
const SOLAR_GLARE_GEO = new THREE.SphereGeometry(18, 12, 8);
const RAY_COUNT = 8;

// Pre-compute ray positions and rotations
const RAY_TRANSFORMS = Array.from({ length: RAY_COUNT }, (_, i) => {
  const angle = (i / RAY_COUNT) * Math.PI * 2;
  return {
    position: [Math.sin(angle) * 8, 12, Math.cos(angle) * 8] as [number, number, number],
    rotation: [0.4 + (i % 3) * 0.1, angle, 0.15 * (i % 2 === 0 ? 1 : -1)] as [number, number, number],
  };
});

function SolarRays({ opacity }: { opacity: number }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ camera, clock }) => {
    const group = groupRef.current;
    if (!group) return;
    // Follow camera position so glare always surrounds player
    group.position.set(camera.position.x, 0, camera.position.z);
    // Slow rotation for dynamic feel
    group.rotation.y = clock.elapsedTime * 0.03;
    // Update material opacity
    SOLAR_RAY_MAT.opacity = opacity * 0.2;
    SOLAR_GLARE_MAT.opacity = opacity * 0.12;
  });

  if (opacity < 0.01) return null;

  return (
    <group ref={groupRef}>
      {/* Heat glare dome — warm additive haze around the player */}
      <mesh geometry={SOLAR_GLARE_GEO} material={SOLAR_GLARE_MAT} position={[0, 5, 0]} />

      {/* God rays — tall bright planes angled from above */}
      {RAY_TRANSFORMS.map((t, i) => (
        <mesh
          key={i}
          geometry={SOLAR_RAY_GEO}
          material={SOLAR_RAY_MAT}
          position={t.position}
          rotation={t.rotation}
        />
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════
// Component: ParticleEffects
// ═══════════════════════════════════════════════════════════════

function ParticleEffects({ activeEra }: { activeEra: AtmosphereEra }) {
  const infernoBlendRef = useRef(0);
  const iceBlendRef = useRef(0);
  const stableBlendRef = useRef(0);
  const gravityBlendRef = useRef(0);
  const [infernoOpacity, setInfernoOpacity] = useState(0);
  const [iceOpacity, setIceOpacity] = useState(0);
  const [stableOpacity, setStableOpacity] = useState(0);
  const [gravityOpacity, setGravityOpacity] = useState(0);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const infernoTarget = activeEra === 'chaosInferno' ? 1 : 0;
    const iceTarget = activeEra === 'chaosIce' ? 1 : 0;
    const stableTarget = activeEra === 'stable' ? 1 : 0;
    const gravityTarget = activeEra === 'chaosGravity' ? 1 : 0;

    infernoBlendRef.current = expLerp(infernoBlendRef.current, infernoTarget, 2, delta);
    iceBlendRef.current = expLerp(iceBlendRef.current, iceTarget, 2, delta);
    stableBlendRef.current = expLerp(stableBlendRef.current, stableTarget, 2, delta);
    gravityBlendRef.current = expLerp(gravityBlendRef.current, gravityTarget, 2, delta);

    const newInferno = Math.round(infernoBlendRef.current * 100) / 100;
    const newIce = Math.round(iceBlendRef.current * 100) / 100;
    const newStable = Math.round(stableBlendRef.current * 100) / 100;
    const newGravity = Math.round(gravityBlendRef.current * 100) / 100;
    if (Math.abs(newInferno - infernoOpacity) > 0.02) setInfernoOpacity(newInferno);
    if (Math.abs(newIce - iceOpacity) > 0.02) setIceOpacity(newIce);
    if (Math.abs(newStable - stableOpacity) > 0.02) setStableOpacity(newStable);
    if (Math.abs(newGravity - gravityOpacity) > 0.02) setGravityOpacity(newGravity);
  });

  return (
    <>
      {/* ── Chaos Inferno: fire particles + solar rays ── */}
      {infernoOpacity > 0.01 && (
        <>
          {/* Fire + embers (merged) */}
          <Sparkles count={35} scale={[100, 30, 100]} size={4} speed={2.5}
            color="#ee4400" opacity={infernoOpacity * 0.7} noise={1.4} />
          {/* Flame tips + sparks */}
          <Sparkles count={15} scale={[90, 40, 90]} size={2.5} speed={4}
            color="#ffcc44" opacity={infernoOpacity * 0.4} noise={2} />
          {/* Blinding solar rays + heat glare dome */}
          <SolarRays opacity={infernoOpacity} />
        </>
      )}

      {/* ── Chaos Ice: blizzard + fog (optimized — 3 layers) ── */}
      {iceOpacity > 0.01 && (
        <>
          {/* Fog bank */}
          <Sparkles count={45} scale={[90, 8, 90]} size={20} speed={0.05}
            color="#1a2a44" opacity={iceOpacity * 0.5} noise={0.1} />
          {/* Blizzard snowflakes */}
          <Sparkles count={55} scale={[100, 50, 100]} size={3.5} speed={1.0}
            color="#ddeeff" opacity={iceOpacity * 0.8} noise={0.7} />
          {/* Ice crystals + ground snow */}
          <Sparkles count={28} scale={[100, 15, 100]} size={2} speed={0.3}
            color="#aaccff" opacity={iceOpacity * 0.4} noise={0.3} />
        </>
      )}

      {/* ── Stable: floating dust + occasional sparks ── */}
      {stableOpacity > 0.01 && (
        <>
          {/* Floating dust motes in light beams */}
          <Sparkles
            count={25}
            scale={[100, 30, 100]}
            size={1.5}
            speed={0.1}
            color="#aaaaaa"
            opacity={stableOpacity * 0.2}
            noise={0.3}
          />
          {/* Subtle electrical sparks near ceiling */}
          <Sparkles
            count={10}
            scale={[80, 4, 80]}
            size={2}
            speed={4}
            color="#88ccff"
            opacity={stableOpacity * 0.3}
            noise={3}
          />
        </>
      )}

      {/* ── Chaos Gravity: distortion particles (purple, fast) ── */}
      {gravityOpacity > 0.01 && (
        <>
          {/* Gravitational distortion waves */}
          <Sparkles count={28} scale={[100, 40, 100]} size={3} speed={4}
            color="#8844ff" opacity={gravityOpacity * 0.6} noise={2.5} />
          {/* Deep purple haze */}
          <Sparkles count={18} scale={[90, 20, 90]} size={6} speed={0.5}
            color="#440088" opacity={gravityOpacity * 0.3} noise={0.5} />
          {/* Bright gravitational sparks */}
          <Sparkles count={12} scale={[80, 50, 80]} size={2} speed={6}
            color="#cc88ff" opacity={gravityOpacity * 0.5} noise={3} />
        </>
      )}
    </>
  );
}


// ═══════════════════════════════════════════════════════════════
// Nebula shader (procedural FBM noise cloud)
// ═══════════════════════════════════════════════════════════════

const NEBULA_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NEBULA_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.0 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv - 0.5;
    float dist = length(uv);
    float falloff = 1.0 - smoothstep(0.15, 0.5, dist);
    float n = fbm(vUv * 3.0 + uTime * 0.02);
    float cloud = n * falloff;
    gl_FragColor = vec4(uColor, cloud * uOpacity);
  }
`;

// ═══════════════════════════════════════════════════════════════
// Default starfield config (used when AI doesn't provide one)
// ═══════════════════════════════════════════════════════════════

const DEFAULT_STARFIELD = {
  starCount: 4000,
  starSaturation: 0.3,
  nebulaColor: '#1a0033',
  nebulaIntensity: 0.4,
  cosmicDustDensity: 0.5,
  cosmicDustColor: '#222244',
};

// ═══════════════════════════════════════════════════════════════
// Component: SkyEffects (Stars + Nebula + Cosmic Dust)
// ═══════════════════════════════════════════════════════════════

function SkyEffects({ cosmicScenario }: { cosmicScenario: import('@shadow/shared').CosmicScenario | null }) {
  const sf = cosmicScenario?.starfield ?? DEFAULT_STARFIELD;

  // Pre-compute nebula cloud positions (5 large billboards)
  const nebulaClouds = useMemo(() => {
    const nebulaCol = new THREE.Color(sf.nebulaColor);
    const clouds: Array<{ position: [number, number, number]; scale: number; rotation: number; color: THREE.Color }> = [];
    const rng = seededRandom(137);
    for (let i = 0; i < 5; i++) {
      const theta = rng() * Math.PI * 2;
      const phi = (rng() - 0.5) * Math.PI * 0.6;
      const dist = 250 + rng() * 80;
      clouds.push({
        position: [
          dist * Math.cos(phi) * Math.cos(theta),
          dist * Math.sin(phi) + 50,
          dist * Math.cos(phi) * Math.sin(theta),
        ],
        scale: 60 + rng() * 80,
        rotation: rng() * Math.PI * 2,
        color: new THREE.Color().copy(nebulaCol).multiplyScalar(0.6 + rng() * 0.8),
      });
    }
    return clouds;
  }, [sf.nebulaColor]);

  // Nebula shader materials (one per cloud, each with its own uniform refs)
  const nebulaMaterials = useMemo(() => {
    return nebulaClouds.map((cloud) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: NEBULA_VERTEX,
        fragmentShader: NEBULA_FRAGMENT,
        uniforms: {
          uColor: { value: cloud.color },
          uOpacity: { value: sf.nebulaIntensity * 0.4 },
          uTime: { value: 0 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      return mat;
    });
  }, [nebulaClouds, sf.nebulaIntensity]);

  // Cosmic dust particle geometry
  const cosmicDustGeo = useMemo(() => {
    const count = Math.floor(300 * sf.cosmicDustDensity);
    const positions = new Float32Array(count * 3);
    const dustCol = new THREE.Color(sf.cosmicDustColor);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 150 + Math.random() * 150;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      const v = 0.5 + Math.random() * 0.5;
      colors[i * 3] = dustCol.r * v;
      colors[i * 3 + 1] = dustCol.g * v;
      colors[i * 3 + 2] = dustCol.b * v;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [sf.cosmicDustDensity, sf.cosmicDustColor]);

  const cosmicDustRef = useRef<THREE.Points>(null);

  // Animate nebula + cosmic dust
  useFrame((state, delta) => {
    // Update nebula shader time
    for (const mat of nebulaMaterials) {
      mat.uniforms.uTime.value = state.clock.elapsedTime;
    }
    // Slowly rotate cosmic dust
    if (cosmicDustRef.current) {
      cosmicDustRef.current.rotation.y += delta * 0.003;
      cosmicDustRef.current.rotation.x += delta * 0.001;
    }
  });

  return (
    <>
      {/* Layer 1: Main starfield (colored, high count) */}
      <Stars
        radius={350}
        depth={150}
        count={sf.starCount}
        factor={5}
        saturation={sf.starSaturation}
        fade
        speed={0.3}
      />

      {/* Layer 2: Dim background stars (depth) */}
      <Stars
        radius={400}
        depth={200}
        count={1000}
        factor={2}
        saturation={0}
        fade
        speed={0.1}
      />

      {/* Layer 3: Nebula clouds (procedural FBM shader) */}
      {nebulaClouds.map((cloud, i) => (
        <mesh
          key={`nebula-${i}`}
          position={cloud.position}
          rotation={[0, 0, cloud.rotation]}
          material={nebulaMaterials[i]}
        >
          <planeGeometry args={[cloud.scale, cloud.scale]} />
        </mesh>
      ))}

      {/* Layer 4: Cosmic dust (slowly drifting ambient particles) */}
      <points ref={cosmicDustRef} geometry={cosmicDustGeo}>
        <pointsMaterial
          vertexColors
          size={1.5}
          sizeAttenuation
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Component: BinaryBridge (glowing connection between binary suns)
// ═══════════════════════════════════════════════════════════════

function BinaryBridge({ simRef }: { simRef: React.RefObject<SimulationRef> }) {
  const lineRef = useRef<THREE.Line>(null);
  const [visible, setVisible] = useState(false);
  const blendRef = useRef(0);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(6); // 2 points × 3 components
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  const material = useMemo(() => new THREE.LineBasicMaterial({
    color: '#aa66ff',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    linewidth: 2,
  }), []);

  const lineObject = useMemo(() => new THREE.Line(geometry, material), [geometry, material]);

  useFrame((_, rawDelta) => {
    const sim = simRef.current;
    const delta = Math.min(rawDelta, 0.05);
    const target = sim.isBinary ? 1 : 0;
    blendRef.current = expLerp(blendRef.current, target, 3, delta);

    const shouldShow = blendRef.current > 0.05;
    if (shouldShow !== visible) setVisible(shouldShow);

    if (!shouldShow || !sim.binaryPair) return;

    const [i, j] = sim.binaryPair;
    const posArr = geometry.attributes.position.array as Float32Array;
    const p0 = sim.sunPositions[i];
    const p1 = sim.sunPositions[j];
    posArr[0] = p0.x; posArr[1] = p0.y; posArr[2] = p0.z;
    posArr[3] = p1.x; posArr[4] = p1.y; posArr[5] = p1.z;
    geometry.attributes.position.needsUpdate = true;
    material.opacity = blendRef.current * 0.6;
  });

  if (!visible) return null;

  return (
    <>
      <primitive ref={lineRef} object={lineObject} />
      {/* Sparkles between binary pair */}
      {simRef.current.binaryPair && (
        <Sparkles
          count={18}
          scale={[80, 80, 80]}
          size={4}
          speed={3}
          color="#aa66ff"
          opacity={blendRef.current * 0.5}
          noise={2}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Component: EjectionTrail (particle trail behind ejected sun)
// ═══════════════════════════════════════════════════════════════

function EjectionTrail({ simRef }: { simRef: React.RefObject<SimulationRef> }) {
  const [visible, setVisible] = useState(false);
  const blendRef = useRef(0);

  useFrame((_, rawDelta) => {
    const sim = simRef.current;
    const delta = Math.min(rawDelta, 0.05);
    const target = sim.isEjection ? 1 : 0;
    blendRef.current = expLerp(blendRef.current, target, 2, delta);
    const shouldShow = blendRef.current > 0.05;
    if (shouldShow !== visible) setVisible(shouldShow);
  });

  if (!visible) return null;

  return (
    <Sparkles
      count={25}
      scale={[200, 200, 200]}
      size={3}
      speed={5}
      color="#ff4488"
      opacity={blendRef.current * 0.4}
      noise={3}
    />
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Component: ThreeBodyEnvironment
// ═══════════════════════════════════════════════════════════════

export function ThreeBodyEnvironment({
  currentEra,
  simulationSpeed = 1.0,
  gravityEnabled = true,
  cameraShakeEnabled = true,
}: ThreeBodyEnvironmentProps) {
  // Run the 3-body simulation
  const simRef = useThreeBodySimulation(simulationSpeed);

  // Build sun configs from AI scenario or fall back to defaults
  const cosmicScenario = useGameStore((st) => st.cosmicScenario);
  const sunConfigs = useMemo((): [SunConfig, SunConfig, SunConfig] => {
    if (!cosmicScenario) return SUN_CONFIGS;
    return cosmicScenario.suns.map((sun, i) => ({
      color: sun.color,
      radius: sun.radius,
      lightIntensity: sun.intensity,
      phaseOffset: i * (Math.PI * 2 / 3),
      pulseSpeed: sun.pulseSpeed,
      coronaColor: sun.coronaColor,
      dustCloudColor: sun.dustCloudColor,
      coronaIntensity: sun.coronaIntensity,
      dustCloudRadius: sun.dustCloudRadius,
    })) as [SunConfig, SunConfig, SunConfig];
  }, [cosmicScenario]);

  // Era blend state (mutable ref for per-frame lerping)
  const eraBlendRef = useRef({
    current: {
      fogColor: new THREE.Color('#0a0a15'),
      fogNear: 5,
      fogFar: 55,
      ambientIntensity: 0.05,
      ambientColor: new THREE.Color('#223355'),
    },
  });

  // Determine active era: prop override or auto-detect
  const [activeEra, setActiveEra] = useState<AtmosphereEra>('stable');

  useFrame(() => {
    const era = currentEra ?? simRef.current.detectedEra;
    if (era !== activeEra) {
      setActiveEra(era);
    }
  });

  // Hooks
  useCameraShake(simRef, cameraShakeEnabled);
  useGravityEvent(simRef, gravityEnabled, activeEra);

  return (
    <>
      {/* Three suns (all using 3D model) */}
      {sunConfigs.map((config, i) => (
        <GLBSun
          key={`glb-${config.color}-${i}`}
          config={config}
          simRef={simRef}
          index={i}
        />
      ))}

      {/* Atmosphere (fog + ambient light) */}
      <AtmosphereController activeEra={activeEra} eraBlendRef={eraBlendRef} simRef={simRef} />

      {/* Particles (fire/ash, snow, dust) */}
      <ParticleEffects activeEra={activeEra} />

      {/* N-body event visuals */}
      <BinaryBridge simRef={simRef} />
      <EjectionTrail simRef={simRef} />

      {/* Background stars + nebula + cosmic dust */}
      <SkyEffects cosmicScenario={cosmicScenario} />

      {/* Procedural audio */}
      <EnvironmentAudio activeEra={activeEra} simRef={simRef} />
    </>
  );
}
