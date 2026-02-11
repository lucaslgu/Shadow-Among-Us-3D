import { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Stars, Clouds, Cloud, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useGameStore } from '../stores/game-store.js';

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
  bloomIntensity: number;
  bloomThreshold: number;
}

interface SimulationRef {
  lorenz: LorenzState;
  time: number;
  sunPositions: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  sunVelocities: [number, number, number];
  prevPositions: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
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

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const SUN_DISTANCE = 250;
const CLUSTER_THRESHOLD = 0.5; // radians
const SYZYGY_DOT_THRESHOLD = 0.95;

const LORENZ_SIGMA = 10;
const LORENZ_RHO = 28;
const LORENZ_BETA = 8 / 3;
const TIME_SCALE = 0.15;

const SUN_CONFIGS: [SunConfig, SunConfig, SunConfig] = [
  { color: '#ff6600', radius: 12, lightIntensity: 0.4, phaseOffset: 0 },
  { color: '#4488ff', radius: 8, lightIntensity: 0.3, phaseOffset: 2.094 },
  { color: '#ffffee', radius: 10, lightIntensity: 0.35, phaseOffset: 4.189 },
];

const ERA_PRESETS: Record<AtmosphereEra, EraVisuals> = {
  stable: {
    fogColor: new THREE.Color('#0a0a15'),
    fogNear: 50,
    fogFar: 200,
    ambientIntensity: 0.05,
    ambientColor: new THREE.Color('#223355'),
    bloomIntensity: 0.3,
    bloomThreshold: 0.8,
  },
  chaosInferno: {
    fogColor: new THREE.Color('#331100'),
    fogNear: 10,
    fogFar: 80,
    ambientIntensity: 0.15,
    ambientColor: new THREE.Color('#ff4400'),
    bloomIntensity: 1.5,
    bloomThreshold: 0.4,
  },
  chaosIce: {
    fogColor: new THREE.Color('#000818'),
    fogNear: 5,
    fogFar: 60,
    ambientIntensity: 0.005,
    ambientColor: new THREE.Color('#0011aa'),
    bloomIntensity: 0.1,
    bloomThreshold: 0.9,
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
  const _tmpDir0 = new THREE.Vector3();
  const _tmpDir1 = new THREE.Vector3();
  const _tmpDir2 = new THREE.Vector3();

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
    const maxVelocity = Math.max(...sim.sunVelocities);

    // Intensity ramps from 0 to 0.02 radians based on sun velocity
    const intensity = smoothstep(0.5, 5.0, maxVelocity) * 0.02;

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

function useGravityEvent(simRef: React.RefObject<SimulationRef>, enabled: boolean): void {
  const yOffsetRef = useRef(0);
  const yVelRef = useRef(0);
  const lastSyzygyRef = useRef(false);
  const eventTimerRef = useRef(15 + Math.random() * 15);

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

    // Syzygy transition detection
    if (sim.isSyzygy && !lastSyzygyRef.current) {
      gravityState.multiplier = 0.1;
      yVelRef.current = 3.0; // Upward impulse
      gravityState.isFloating = true;
    }
    lastSyzygyRef.current = sim.isSyzygy;

    // Random gravity fluctuations (non-syzygy)
    if (!sim.isSyzygy) {
      eventTimerRef.current -= delta;
      if (eventTimerRef.current <= 0) {
        eventTimerRef.current = 15 + Math.random() * 15;
        gravityState.multiplier = 0.5 + Math.random() * 1.5;
      }
      // Slowly return multiplier to 1.0
      gravityState.multiplier = expLerp(gravityState.multiplier, 1.0, 0.5, delta);
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
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);

  // Determine which sun index is "highest" (for shadow casting)
  useFrame(() => {
    const sim = simRef.current;
    const pos = sim.sunPositions[index];

    if (meshRef.current) {
      meshRef.current.position.copy(pos);
    }

    if (lightRef.current && targetRef.current) {
      lightRef.current.position.copy(pos);
      targetRef.current.position.set(0, 0, 0);
      lightRef.current.target = targetRef.current;

      // Fade intensity when below horizon
      const horizonFade = smoothstep(-20, 20, pos.y);
      const baseIntensity = config.lightIntensity;
      lightRef.current.intensity = baseIntensity * horizonFade;

      // Only the highest sun casts shadows
      const highestIdx = sim.sunPositions.reduce(
        (best, p, i) => (p.y > sim.sunPositions[best].y ? i : best),
        0,
      );
      lightRef.current.castShadow = index === highestIdx && pos.y > 0;
    }
  });

  return (
    <>
      {/* Sun sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[config.radius, 32, 32]} />
        <meshBasicMaterial color={config.color} toneMapped={false} />
      </mesh>

      {/* Directional light from this sun */}
      <directionalLight
        ref={lightRef}
        color={config.color}
        intensity={config.lightIntensity}
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={100}
        shadow-camera-far={400}
      />
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
}: {
  activeEra: AtmosphereEra;
  eraBlendRef: React.RefObject<{ current: EraVisuals }>;
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

    // Lerp all visual parameters
    expLerpColor(blend.current.fogColor, target.fogColor, speed, delta);
    blend.current.fogNear = expLerp(blend.current.fogNear, target.fogNear, speed, delta);
    blend.current.fogFar = expLerp(blend.current.fogFar, target.fogFar, speed, delta);
    blend.current.ambientIntensity = expLerp(blend.current.ambientIntensity, target.ambientIntensity, speed, delta);
    expLerpColor(blend.current.ambientColor, target.ambientColor, speed, delta);
    blend.current.bloomIntensity = expLerp(blend.current.bloomIntensity, target.bloomIntensity, speed, delta);
    blend.current.bloomThreshold = expLerp(blend.current.bloomThreshold, target.bloomThreshold, speed, delta);

    // Apply fog
    if (scene.fog && scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(blend.current.fogColor);
      scene.fog.near = blend.current.fogNear;
      scene.fog.far = blend.current.fogFar;
    }

    // Apply ambient light
    if (ambientRef.current) {
      ambientRef.current.intensity = blend.current.ambientIntensity;
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
  const [infernoOpacity, setInfernoOpacity] = useState(0);
  const [iceOpacity, setIceOpacity] = useState(0);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const infernoTarget = activeEra === 'chaosInferno' ? 1 : 0;
    const iceTarget = activeEra === 'chaosIce' ? 1 : 0;

    infernoBlendRef.current = expLerp(infernoBlendRef.current, infernoTarget, 2, delta);
    iceBlendRef.current = expLerp(iceBlendRef.current, iceTarget, 2, delta);

    // Update state only when crossing visibility threshold (avoid re-renders every frame)
    const newInferno = Math.round(infernoBlendRef.current * 100) / 100;
    const newIce = Math.round(iceBlendRef.current * 100) / 100;
    if (Math.abs(newInferno - infernoOpacity) > 0.02) setInfernoOpacity(newInferno);
    if (Math.abs(newIce - iceOpacity) > 0.02) setIceOpacity(newIce);
  });

  return (
    <>
      {/* Fire/ash particles (Chaos Inferno) */}
      {infernoOpacity > 0.01 && (
        <>
          <Sparkles
            count={200}
            scale={[100, 40, 100]}
            size={3}
            speed={2}
            color="#ff4400"
            opacity={infernoOpacity}
            noise={1}
          />
          {/* Ember layer — larger, slower, dimmer */}
          <Sparkles
            count={80}
            scale={[100, 60, 100]}
            size={6}
            speed={0.8}
            color="#ff8800"
            opacity={infernoOpacity * 0.6}
            noise={0.5}
          />
        </>
      )}

      {/* Snow/hail particles (Chaos Ice) */}
      {iceOpacity > 0.01 && (
        <Sparkles
          count={300}
          scale={[100, 50, 100]}
          size={2}
          speed={0.5}
          color="#aaccff"
          opacity={iceOpacity}
          noise={0.3}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Component: SkyEffects (Stars + Cloud)
// ═══════════════════════════════════════════════════════════════

function SkyEffects({ activeEra }: { activeEra: AtmosphereEra }) {
  const [infernoBlend, setInfernoBlend] = useState(0);
  const blendRef = useRef(0);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const target = activeEra === 'chaosInferno' ? 1 : 0;
    blendRef.current = expLerp(blendRef.current, target, 2, delta);
    const rounded = Math.round(blendRef.current * 100) / 100;
    if (Math.abs(rounded - infernoBlend) > 0.02) setInfernoBlend(rounded);
  });

  return (
    <>
      {/* Background stars — always visible */}
      <Stars
        radius={300}
        depth={100}
        count={5000}
        factor={4}
        saturation={0}
        fade
        speed={0.5}
      />

      {/* Hot haze clouds — visible during Chaos Inferno */}
      {infernoBlend > 0.01 && (
        <Clouds>
          <Cloud
            opacity={infernoBlend * 0.4}
            speed={0.4}
            color="#ff3300"
            bounds={[30, 5, 30]}
            volume={10}
            segments={20}
            position={[0, 30, 0]}
          />
        </Clouds>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Component: PostProcessingEffects (Bloom)
// ═══════════════════════════════════════════════════════════════

function PostProcessingEffects({
  eraBlendRef,
}: {
  eraBlendRef: React.RefObject<{ current: EraVisuals }>;
}) {
  const [bloomParams, setBloomParams] = useState({
    intensity: 0.3,
    threshold: 0.8,
  });

  useFrame(() => {
    const blend = eraBlendRef.current.current;
    const newIntensity = Math.round(blend.bloomIntensity * 100) / 100;
    const newThreshold = Math.round(blend.bloomThreshold * 100) / 100;
    if (
      Math.abs(newIntensity - bloomParams.intensity) > 0.02 ||
      Math.abs(newThreshold - bloomParams.threshold) > 0.02
    ) {
      setBloomParams({ intensity: newIntensity, threshold: newThreshold });
    }
  });

  return (
    <EffectComposer>
      <Bloom
        intensity={bloomParams.intensity}
        luminanceThreshold={bloomParams.threshold}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
    </EffectComposer>
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

  // Era blend state (mutable ref for per-frame lerping)
  const eraBlendRef = useRef({
    current: {
      fogColor: new THREE.Color('#0a0a15'),
      fogNear: 50,
      fogFar: 200,
      ambientIntensity: 0.05,
      ambientColor: new THREE.Color('#223355'),
      bloomIntensity: 0.3,
      bloomThreshold: 0.8,
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
  useGravityEvent(simRef, gravityEnabled);

  return (
    <>
      {/* Three suns */}
      {SUN_CONFIGS.map((config, i) => (
        <Sun
          key={i}
          config={config}
          simRef={simRef}
          index={i}
          eraBlendRef={eraBlendRef}
        />
      ))}

      {/* Atmosphere (fog + ambient light) */}
      <AtmosphereController activeEra={activeEra} eraBlendRef={eraBlendRef} />

      {/* Particles (fire/ash and snow/hail) */}
      <ParticleEffects activeEra={activeEra} />

      {/* Sky effects (stars, clouds) */}
      <SkyEffects activeEra={activeEra} />

      {/* Post-processing bloom */}
      <PostProcessingEffects eraBlendRef={eraBlendRef} />
    </>
  );
}
