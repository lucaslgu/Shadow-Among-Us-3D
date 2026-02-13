import { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Stars, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '../stores/game-store.js';
import { inputState } from '../networking/mouse-state.js';
import { EnvironmentAudio } from './EnvironmentAudio.js';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type AtmosphereEra = 'stable' | 'chaosInferno' | 'chaosIce';

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

interface LorenzState {
  x: number;
  y: number;
  z: number;
}

interface EraVisuals {
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  ambientIntensity: number;
  ambientColor: THREE.Color;
}

interface SimulationRef {
  lorenz: LorenzState;
  time: number;
  sunPositions: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  sunVelocities: [number, number, number];
  prevPositions: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  tidalForce: number; // 0..1 — how strong the tidal stress is (suns clustered or aligned)
  isSyzygy: boolean;
  visibleSunCount: number;
  detectedEra: AtmosphereEra;
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

/** Era physics state — read by movement code for ice sliding */
export const eraPhysicsState = {
  isIce: false,
  isInferno: false,
  slideVelocityX: 0,
  slideVelocityZ: 0,
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

const LORENZ_SIGMA = 10;
const LORENZ_RHO = 28;
const LORENZ_BETA = 8 / 3;
const TIME_SCALE = 0.04;

const SUN_CONFIGS: [SunConfig, SunConfig, SunConfig] = [
  { color: '#ff6600', radius: 35, lightIntensity: 0.4, phaseOffset: 0 },
  { color: '#4488ff', radius: 24, lightIntensity: 0.3, phaseOffset: 2.094 },
  { color: '#ffffee', radius: 30, lightIntensity: 0.35, phaseOffset: 4.189 },
];

const ERA_PRESETS: Record<AtmosphereEra, EraVisuals> = {
  stable: {
    fogColor: new THREE.Color('#0a0a15'),
    fogNear: 50,
    fogFar: 200,
    ambientIntensity: 0.05,
    ambientColor: new THREE.Color('#223355'),
  },
  chaosInferno: {
    fogColor: new THREE.Color('#331100'),
    fogNear: 10,
    fogFar: 80,
    ambientIntensity: 0.15,
    ambientColor: new THREE.Color('#ff4400'),
  },
  chaosIce: {
    fogColor: new THREE.Color('#0a1020'),
    fogNear: 2,
    fogFar: 35,
    ambientIntensity: 0.02,
    ambientColor: new THREE.Color('#334466'),
  },
};

// ═══════════════════════════════════════════════════════════════
// Lorenz Attractor Integration (RK4)
// ═══════════════════════════════════════════════════════════════

function lorenzDerivative(s: LorenzState): LorenzState {
  return {
    x: LORENZ_SIGMA * (s.y - s.x),
    y: s.x * (LORENZ_RHO - s.z) - s.y,
    z: s.x * s.y - LORENZ_BETA * s.z,
  };
}

function addScaled(a: LorenzState, b: LorenzState, scale: number): LorenzState {
  return { x: a.x + b.x * scale, y: a.y + b.y * scale, z: a.z + b.z * scale };
}

function integrateRK4(state: LorenzState, dt: number): LorenzState {
  const k1 = lorenzDerivative(state);
  const k2 = lorenzDerivative(addScaled(state, k1, dt * 0.5));
  const k3 = lorenzDerivative(addScaled(state, k2, dt * 0.5));
  const k4 = lorenzDerivative(addScaled(state, k3, dt));
  return {
    x: state.x + (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: state.y + (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    z: state.z + (dt / 6) * (k1.z + 2 * k2.z + 2 * k3.z + k4.z),
  };
}

// ═══════════════════════════════════════════════════════════════
// Helper: derive sun position from Lorenz state + phase offset
// ═══════════════════════════════════════════════════════════════

function sunPositionFromLorenz(
  lorenz: LorenzState,
  time: number,
  phaseOffset: number,
  target: THREE.Vector3,
): void {
  // Use different linear combinations of Lorenz variables per sun
  // to create distinct but coupled orbits
  const t = time * 0.3 + phaseOffset;
  const lx = lorenz.x;
  const ly = lorenz.y;
  const lz = lorenz.z;

  // Map Lorenz attractor (range roughly [-20,20] x [-30,30] x [0,50])
  // to spherical angles
  const theta = Math.atan2(
    ly * Math.cos(t) + lx * Math.sin(t),
    lx * Math.cos(t) - ly * Math.sin(t),
  );
  // phi ranges from -PI/2 to PI/2 (below to above horizon)
  // Use lz (which oscillates roughly 0-50) mapped to [-PI/3, PI/3]
  const phi = ((lz - 25) / 25) * (Math.PI / 3);

  target.set(
    SUN_DISTANCE * Math.cos(phi) * Math.cos(theta),
    SUN_DISTANCE * Math.sin(phi),
    SUN_DISTANCE * Math.cos(phi) * Math.sin(theta),
  );
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

  return { era: 'stable', visibleCount, isSyzygy };
}

// ═══════════════════════════════════════════════════════════════
// Hook: useThreeBodySimulation
// ═══════════════════════════════════════════════════════════════

function useThreeBodySimulation(simulationSpeed: number): React.RefObject<SimulationRef> {
  const simRef = useRef<SimulationRef>({
    lorenz: { x: 1, y: 1, z: 1 },
    time: 0,
    sunPositions: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    sunVelocities: [0, 0, 0],
    prevPositions: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    tidalForce: 0,
    isSyzygy: false,
    visibleSunCount: 1,
    detectedEra: 'stable',
  });

  useFrame((_, rawDelta) => {
    const sim = simRef.current;
    const delta = Math.max(0.001, Math.min(0.05, rawDelta));
    const dt = delta * TIME_SCALE * simulationSpeed;

    // Store previous positions for velocity
    for (let i = 0; i < 3; i++) {
      sim.prevPositions[i].copy(sim.sunPositions[i]);
    }

    // Integrate Lorenz system
    sim.lorenz = integrateRK4(sim.lorenz, dt);
    sim.time += dt;

    // Derive sun positions
    for (let i = 0; i < 3; i++) {
      sunPositionFromLorenz(sim.lorenz, sim.time, SUN_CONFIGS[i].phaseOffset, sim.sunPositions[i]);
    }

    // Compute velocities (units per second)
    for (let i = 0; i < 3; i++) {
      sim.sunVelocities[i] = sim.sunPositions[i].distanceTo(sim.prevPositions[i]) / Math.max(delta, 0.001);
    }

    // Detect era
    const { era, visibleCount, isSyzygy } = computeEra(sim.sunPositions);
    sim.detectedEra = era;
    sim.visibleSunCount = visibleCount;
    sim.isSyzygy = isSyzygy;

    // Compute tidal force: based on how close/aligned suns are (gravitational stress)
    // Uses angular proximity — the closer suns are to each other, the stronger the tidal effect
    _tmpDir0.copy(sim.sunPositions[0]).normalize();
    _tmpDir1.copy(sim.sunPositions[1]).normalize();
    _tmpDir2.copy(sim.sunPositions[2]).normalize();
    const dot01 = Math.abs(_tmpDir0.dot(_tmpDir1));
    const dot02 = Math.abs(_tmpDir0.dot(_tmpDir2));
    const dot12 = Math.abs(_tmpDir1.dot(_tmpDir2));
    // Max dot product among pairs — 1.0 means perfectly aligned (syzygy)
    const maxDot = Math.max(dot01, dot02, dot12);
    // Map from [0.7, 1.0] to [0, 1] — tidal stress only kicks in when suns are fairly close
    sim.tidalForce = smoothstep(0.7, 0.98, maxDot);
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

    // Tidal force drives shake intensity — gravitational stress from sun proximity/alignment
    // Max 0.015 radians (~0.86 degrees) — noticeable but not nauseating
    const intensity = sim.tidalForce * 0.015;

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

    // Update era physics state for movement code
    eraPhysicsState.isIce = activeEra === 'chaosIce';
    eraPhysicsState.isInferno = activeEra === 'chaosInferno';

    // Era-based gravity target (from AI scenario if available, otherwise hardcoded)
    const serverGravity = useGameStore.getState().eraGravity;
    let eraGravityTarget = serverGravity ?? 1.0;
    if (serverGravity == null) {
      if (activeEra === 'chaosIce') eraGravityTarget = 0.3;
      else if (activeEra === 'chaosInferno') eraGravityTarget = 2.0;
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
          count={50}
          scale={[coronaRadius * 0.7, coronaRadius * 0.7, coronaRadius * 0.7]}
          size={coronaSize * 2}
          speed={2}
          color={coronaColor}
          opacity={0.9 * coronaInt}
          noise={2}
        />

        {/* Outer corona particles (dim, spread) */}
        <Sparkles
          count={30}
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
      const daylightFogBoost = 1 + daylight * 1.5; // up to 2.5x fog distance at full day
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
// Component: ParticleEffects
// ═══════════════════════════════════════════════════════════════

function ParticleEffects({ activeEra }: { activeEra: AtmosphereEra }) {
  const infernoBlendRef = useRef(0);
  const iceBlendRef = useRef(0);
  const stableBlendRef = useRef(0);
  const [infernoOpacity, setInfernoOpacity] = useState(0);
  const [iceOpacity, setIceOpacity] = useState(0);
  const [stableOpacity, setStableOpacity] = useState(0);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const infernoTarget = activeEra === 'chaosInferno' ? 1 : 0;
    const iceTarget = activeEra === 'chaosIce' ? 1 : 0;
    const stableTarget = activeEra === 'stable' ? 1 : 0;

    infernoBlendRef.current = expLerp(infernoBlendRef.current, infernoTarget, 2, delta);
    iceBlendRef.current = expLerp(iceBlendRef.current, iceTarget, 2, delta);
    stableBlendRef.current = expLerp(stableBlendRef.current, stableTarget, 2, delta);

    const newInferno = Math.round(infernoBlendRef.current * 100) / 100;
    const newIce = Math.round(iceBlendRef.current * 100) / 100;
    const newStable = Math.round(stableBlendRef.current * 100) / 100;
    if (Math.abs(newInferno - infernoOpacity) > 0.02) setInfernoOpacity(newInferno);
    if (Math.abs(newIce - iceOpacity) > 0.02) setIceOpacity(newIce);
    if (Math.abs(newStable - stableOpacity) > 0.02) setStableOpacity(newStable);
  });

  return (
    <>
      {/* ── Chaos Inferno: multi-layer realistic fire ── */}
      {infernoOpacity > 0.01 && (
        <>
          {/* Deep red fire base (low, concentrated) */}
          <Sparkles count={100} scale={[100, 15, 100]} size={6} speed={3}
            color="#cc2200" opacity={infernoOpacity * 0.9} noise={1.5} />
          {/* Orange mid flames (rising) */}
          <Sparkles count={80} scale={[100, 30, 100]} size={5} speed={2.5}
            color="#ff6600" opacity={infernoOpacity * 0.7} noise={1.2} />
          {/* Yellow-white flame tips (high, fast) */}
          <Sparkles count={60} scale={[90, 50, 90]} size={3} speed={4}
            color="#ffcc44" opacity={infernoOpacity * 0.5} noise={2} />
          {/* White-hot core sparks */}
          <Sparkles count={30} scale={[80, 20, 80]} size={2} speed={5}
            color="#ffffee" opacity={infernoOpacity * 0.4} noise={3} />
          {/* Rising dark smoke (slow, large) */}
          <Sparkles count={40} scale={[100, 60, 100]} size={10} speed={0.5}
            color="#1a0800" opacity={infernoOpacity * 0.25} noise={0.3} />
          {/* Drifting embers (slow, scattered) */}
          <Sparkles count={50} scale={[120, 40, 120]} size={2.5} speed={0.3}
            color="#ff4400" opacity={infernoOpacity * 0.6} noise={0.8} />
          {/* Ground-level heat shimmer (fast flicker) */}
          <Sparkles count={70} scale={[100, 4, 100]} size={2} speed={6}
            color="#ffaa22" opacity={infernoOpacity * 0.3} noise={4} />
        </>
      )}

      {/* ── Chaos Ice: multi-layer volumetric blizzard ── */}
      {iceOpacity > 0.01 && (
        <>
          {/* Dense blizzard (main snowfall) */}
          <Sparkles count={250} scale={[100, 60, 100]} size={3} speed={1.2}
            color="#ddeeff" opacity={iceOpacity * 0.9} noise={0.6} />
          {/* Large heavy snowflakes (close-up visibility) */}
          <Sparkles count={100} scale={[60, 40, 60]} size={7} speed={0.4}
            color="#ffffff" opacity={iceOpacity * 0.7} noise={0.8} />
          {/* Ice crystal sparkle (tiny, glittering) */}
          <Sparkles count={150} scale={[100, 30, 100]} size={1} speed={0.2}
            color="#aaccff" opacity={iceOpacity * 0.6} noise={0.15} />
          {/* Wind-blown fine snow (fast horizontal) */}
          <Sparkles count={80} scale={[120, 10, 120]} size={2} speed={3}
            color="#bbddff" opacity={iceOpacity * 0.4} noise={1.5} />
          {/* Thick ground fog (low, very slow) */}
          <Sparkles count={80} scale={[100, 2, 100]} size={12} speed={0.05}
            color="#4466aa" opacity={iceOpacity * 0.35} noise={0.1} />
          {/* Frost crystals suspended in air */}
          <Sparkles count={60} scale={[80, 20, 80]} size={2} speed={0.05}
            color="#88bbff" opacity={iceOpacity * 0.3} noise={0.05} />
          {/* High altitude ice particles (very small, bright) */}
          <Sparkles count={50} scale={[100, 50, 100]} size={0.8} speed={0.8}
            color="#ffffff" opacity={iceOpacity * 0.5} noise={0.3} />
        </>
      )}

      {/* ── Stable: floating dust + occasional sparks ── */}
      {stableOpacity > 0.01 && (
        <>
          {/* Floating dust motes in light beams */}
          <Sparkles
            count={40}
            scale={[100, 30, 100]}
            size={1.5}
            speed={0.1}
            color="#aaaaaa"
            opacity={stableOpacity * 0.2}
            noise={0.3}
          />
          {/* Subtle electrical sparks near ceiling */}
          <Sparkles
            count={15}
            scale={[80, 4, 80]}
            size={2}
            speed={4}
            color="#88ccff"
            opacity={stableOpacity * 0.3}
            noise={3}
          />
        </>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Component: MiniFires (random fire spots during chaosInferno)
// ═══════════════════════════════════════════════════════════════

// Fire positions + seededRandom imported from shared (same positions used by server for damage)
import { FIRE_POSITIONS, seededRandom } from '@shadow/shared';

function MiniFires({ activeEra }: { activeEra: AtmosphereEra }) {
  const blendRef = useRef(0);
  const [visible, setVisible] = useState(false);
  const lightsRef = useRef<(THREE.PointLight | null)[]>([]);

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const target = activeEra === 'chaosInferno' ? 1 : 0;
    blendRef.current = expLerp(blendRef.current, target, 2, delta);

    const shouldBeVisible = blendRef.current > 0.05;
    if (shouldBeVisible !== visible) setVisible(shouldBeVisible);

    if (!shouldBeVisible) return;

    // Flicker each fire light
    const time = state.clock.elapsedTime;
    for (let i = 0; i < lightsRef.current.length; i++) {
      const light = lightsRef.current[i];
      if (!light) continue;
      // Each fire flickers at its own frequency
      const flicker = 0.6 + 0.4 * Math.sin(time * (8 + i * 2.3)) *
        Math.sin(time * (5.7 + i * 1.1));
      light.intensity = 3 * blendRef.current * flicker;
    }
  });

  if (!visible) return null;

  return (
    <group>
      {FIRE_POSITIONS.map((pos, i) => (
        <group key={i} position={pos}>
          {/* Fire glow light */}
          <pointLight
            ref={(el) => { lightsRef.current[i] = el; }}
            color="#ff4400"
            intensity={0}
            distance={12}
            decay={2}
          />
          {/* Deep red core */}
          <Sparkles count={8} scale={[0.8, 1.5, 0.8]} size={4} speed={4}
            color="#cc1100" opacity={blendRef.current * 0.9} noise={2} />
          {/* Orange mid-flame */}
          <Sparkles count={10} scale={[1.2, 2.5, 1.2]} size={3.5} speed={3}
            color="#ff6600" opacity={blendRef.current * 0.8} noise={1.5} />
          {/* Yellow tips */}
          <Sparkles count={6} scale={[1, 3.5, 1]} size={2.5} speed={5}
            color="#ffcc44" opacity={blendRef.current * 0.5} noise={2.5} />
          {/* Smoke plume */}
          <Sparkles count={8} scale={[2, 5, 2]} size={6} speed={0.4}
            color="#221100" opacity={blendRef.current * 0.2} noise={0.4} />
          {/* Sparks shooting up */}
          <Sparkles count={4} scale={[0.5, 6, 0.5]} size={1.5} speed={6}
            color="#ffff88" opacity={blendRef.current * 0.6} noise={4} />
        </group>
      ))}
    </group>
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
      fogNear: 50,
      fogFar: 200,
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
      {/* Three suns (AI-generated or default configs) */}
      {sunConfigs.map((config, i) => (
        <Sun
          key={`${config.color}-${i}`}
          config={config}
          simRef={simRef}
          index={i}
          eraBlendRef={eraBlendRef}
        />
      ))}

      {/* Atmosphere (fog + ambient light) */}
      <AtmosphereController activeEra={activeEra} eraBlendRef={eraBlendRef} simRef={simRef} />

      {/* Particles (fire/ash, snow, dust) */}
      <ParticleEffects activeEra={activeEra} />

      {/* Mini fire spots during inferno */}
      <MiniFires activeEra={activeEra} />

      {/* Background stars + nebula + cosmic dust */}
      <SkyEffects cosmicScenario={cosmicScenario} />

      {/* Procedural audio */}
      <EnvironmentAudio activeEra={activeEra} simRef={simRef} />
    </>
  );
}
