import { useRef, useMemo, useEffect, useState, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { TaskStationInfo, TaskVisualCategory } from '@shadow/shared';
import { TASK_REGISTRY } from '@shadow/shared';
import { useGameStore } from '../stores/game-store.js';

// ── Shared temp objects ──
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _c = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);

// ── Color palette ──
const COL_PENDING = new THREE.Color('#2266bb');
const COL_PROGRESS_A = new THREE.Color('#fbbf24');
const COL_PROGRESS_B = new THREE.Color('#ff6600');
const COL_DONE = new THREE.Color('#22cc55');
const COL_GLOW_PENDING = new THREE.Color('#3388ff');
const COL_GLOW_DONE = new THREE.Color('#44ee66');

// ── Material cache (module-level singletons — NOT recreated per mount) ──
const MAT = {
  darkMetal: new THREE.MeshStandardMaterial({ color: '#1a1e28', roughness: 0.2, metalness: 0.9 }),
  midMetal: new THREE.MeshStandardMaterial({ color: '#2a303e', roughness: 0.25, metalness: 0.85 }),
  lightMetal: new THREE.MeshStandardMaterial({ color: '#3a424e', roughness: 0.3, metalness: 0.8 }),
  panel: new THREE.MeshStandardMaterial({ color: '#101520', roughness: 0.15, metalness: 0.7 }),
  accent: new THREE.MeshStandardMaterial({ color: '#1a3050', roughness: 0.3, metalness: 0.6 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#0c0c0c', roughness: 0.8, metalness: 0.1 }),
  warn: new THREE.MeshStandardMaterial({ color: '#ccaa00', roughness: 0.5, metalness: 0.3 }),
  // Scanner
  glassTube: new THREE.MeshStandardMaterial({ color: '#1a3044', transparent: true, opacity: 0.15, roughness: 0.05, metalness: 0.3, side: THREE.DoubleSide }),
  scanBeam: new THREE.MeshStandardMaterial({ color: '#00ffcc', emissive: new THREE.Color('#00ffcc'), emissiveIntensity: 1.5, transparent: true, opacity: 0.4, toneMapped: false }),
  scanPadScreen: new THREE.MeshStandardMaterial({ color: '#003322', emissive: new THREE.Color('#00ff88'), emissiveIntensity: 0.4, toneMapped: false }),
  scanLed: new THREE.MeshStandardMaterial({ color: '#00ffaa', emissive: new THREE.Color('#00ffaa'), emissiveIntensity: 1, toneMapped: false }),
  scanScreen: new THREE.MeshStandardMaterial({ color: '#001122', emissive: new THREE.Color('#0088ff'), emissiveIntensity: 0.8, toneMapped: false }),
  // Trash
  greenBin: new THREE.MeshStandardMaterial({ color: '#1a3022', roughness: 0.3, metalness: 0.7 }),
  greenBinRim: new THREE.MeshStandardMaterial({ color: '#224030', roughness: 0.25, metalness: 0.7 }),
  // Energy panel
  switchGreen: new THREE.MeshStandardMaterial({ color: '#44ff44', emissive: new THREE.Color('#44ff44'), emissiveIntensity: 0.5, toneMapped: false }),
  switchRed: new THREE.MeshStandardMaterial({ color: '#ff4444', emissive: new THREE.Color('#ff4444'), emissiveIntensity: 0.5, toneMapped: false }),
  gaugeFace: new THREE.MeshStandardMaterial({ color: '#0a0a0a', roughness: 0.1, metalness: 0.5 }),
  gaugeNeedle: new THREE.MeshStandardMaterial({ color: '#ff3333', emissive: new THREE.Color('#ff3333'), emissiveIntensity: 0.6, toneMapped: false }),
  warnLight: new THREE.MeshStandardMaterial({ color: '#ff2200', emissive: new THREE.Color('#ff2200'), emissiveIntensity: 1, toneMapped: false }),
  // Cannon
  barrelTip: new THREE.MeshStandardMaterial({ color: '#ff4400', emissive: new THREE.Color('#ff4400'), emissiveIntensity: 0.6, toneMapped: false }),
  scopeGlow: new THREE.MeshStandardMaterial({ color: '#ff3300', emissive: new THREE.Color('#ff3300'), emissiveIntensity: 1, toneMapped: false }),
  targetScreen: new THREE.MeshStandardMaterial({ color: '#001100', emissive: new THREE.Color('#ff8800'), emissiveIntensity: 0.6, toneMapped: false }),
  // Card reader
  cardScreen: new THREE.MeshStandardMaterial({ color: '#001133', emissive: new THREE.Color('#2266ff'), emissiveIntensity: 0.7, toneMapped: false }),
  cardSlot: new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.9, metalness: 0.1 }),
  slotGuide: new THREE.MeshStandardMaterial({ color: '#33aaff', emissive: new THREE.Color('#33aaff'), emissiveIntensity: 0.5, toneMapped: false }),
  keypad: new THREE.MeshStandardMaterial({ color: '#1a2030', roughness: 0.4, metalness: 0.5 }),
  ledGreen: new THREE.MeshStandardMaterial({ color: '#00ff44', emissive: new THREE.Color('#00ff44'), emissiveIntensity: 1, toneMapped: false }),
  // Engine
  fan: new THREE.MeshStandardMaterial({ color: '#445566', roughness: 0.15, metalness: 0.9 }),
  btnGreen: new THREE.MeshStandardMaterial({ color: '#44ff44', emissive: new THREE.Color('#44ff44'), emissiveIntensity: 0.6, toneMapped: false }),
  btnRed: new THREE.MeshStandardMaterial({ color: '#ff4444', emissive: new THREE.Color('#ff4444'), emissiveIntensity: 0.6, toneMapped: false }),
  btnAmber: new THREE.MeshStandardMaterial({ color: '#ffaa00', emissive: new THREE.Color('#ffaa00'), emissiveIntensity: 0.6, toneMapped: false }),
  // Terminal
  monitorBezel: new THREE.MeshStandardMaterial({ color: '#0a0a0a', roughness: 0.15, metalness: 0.8 }),
  monitorScreen: new THREE.MeshStandardMaterial({ color: '#000d1a', emissive: new THREE.Color('#1155cc'), emissiveIntensity: 0.7, toneMapped: false }),
  keyboard: new THREE.MeshStandardMaterial({ color: '#0c0c0c', roughness: 0.7, metalness: 0.3 }),
  cpuLed: new THREE.MeshStandardMaterial({ color: '#00ff44', emissive: new THREE.Color('#00ff44'), emissiveIntensity: 1.5, toneMapped: false }),
};

const BTN_MATS = [MAT.btnGreen, MAT.btnRed, MAT.btnAmber];

// ══════════════════════════════════════════════════════════════
// Per-type detailed visuals
// ══════════════════════════════════════════════════════════════

const ScannerVisual = memo(function ScannerVisual({ pos }: { pos: [number, number, number] }) {
  const beamRef = useRef<THREE.Mesh>(null);
  const [x, , z] = pos;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (beamRef.current) beamRef.current.position.y = 0.8 + Math.sin(t * 2) * 0.4;
    MAT.scanLed.emissiveIntensity = 0.5 + Math.sin(t * 3) * 0.5;
  });

  return (
    <group position={[x, 0, z]}>
      {/* Base platform */}
      <mesh position={[0, 0.05, 0]} material={MAT.darkMetal}>
        <cylinderGeometry args={[0.6, 0.65, 0.1, 8]} />
      </mesh>
      {/* Vertical column */}
      <mesh position={[0, 0.8, -0.25]} material={MAT.midMetal}>
        <boxGeometry args={[0.12, 1.5, 0.12]} />
      </mesh>
      {/* Support arm (horizontal) */}
      <mesh position={[0, 1.2, -0.1]} material={MAT.lightMetal}>
        <boxGeometry args={[0.08, 0.08, 0.4]} />
      </mesh>
      {/* Scanning pod (glass tube) */}
      <mesh position={[0, 0.8, 0]} material={MAT.glassTube}>
        <cylinderGeometry args={[0.35, 0.35, 1.2, 16, 1, true]} />
      </mesh>
      {/* Scanning beam (animated) */}
      <mesh ref={beamRef} position={[0, 0.8, 0]} material={MAT.scanBeam}>
        <cylinderGeometry args={[0.3, 0.3, 0.02, 16]} />
      </mesh>
      {/* Hand scanner pad */}
      <mesh position={[0.35, 0.7, 0.1]} rotation={[0.3, 0, 0.2]} material={MAT.panel}>
        <boxGeometry args={[0.2, 0.04, 0.3]} />
      </mesh>
      <mesh position={[0.35, 0.725, 0.1]} rotation={[0.3, 0, 0.2]} material={MAT.scanPadScreen}>
        <boxGeometry args={[0.15, 0.005, 0.2]} />
      </mesh>
      {/* Top cap */}
      <mesh position={[0, 1.42, 0]} material={MAT.darkMetal}>
        <cylinderGeometry args={[0.38, 0.35, 0.06, 16]} />
      </mesh>
      {/* LED indicator */}
      <mesh position={[0, 1.56, -0.25]} material={MAT.scanLed}>
        <sphereGeometry args={[0.04, 8, 8]} />
      </mesh>
      {/* Screen on column */}
      <mesh position={[0, 1.3, -0.19]} material={MAT.scanScreen}>
        <boxGeometry args={[0.18, 0.12, 0.02]} />
      </mesh>
    </group>
  );
});

const TrashVisual = memo(function TrashVisual({ pos }: { pos: [number, number, number] }) {
  const [x, , z] = pos;
  return (
    <group position={[x, 0, z]}>
      {/* Main bin */}
      <mesh position={[0, 0.4, 0]} material={MAT.midMetal}>
        <cylinderGeometry args={[0.28, 0.32, 0.8, 10]} />
      </mesh>
      {/* Bin rim */}
      <mesh position={[0, 0.82, 0]} material={MAT.lightMetal}>
        <cylinderGeometry args={[0.32, 0.3, 0.04, 10]} />
      </mesh>
      {/* Recycling bin (smaller, green-tinted) */}
      <mesh position={[0.45, 0.3, 0]} material={MAT.greenBin}>
        <cylinderGeometry args={[0.2, 0.22, 0.6, 8]} />
      </mesh>
      <mesh position={[0.45, 0.62, 0]} material={MAT.greenBinRim}>
        <cylinderGeometry args={[0.23, 0.21, 0.04, 8]} />
      </mesh>
      {/* Chute/funnel above */}
      <mesh position={[0, 1.3, 0]} material={MAT.darkMetal}>
        <cylinderGeometry args={[0.15, 0.35, 0.5, 8]} />
      </mesh>
      {/* Chute pipe */}
      <mesh position={[0, 1.8, 0]} material={MAT.darkMetal}>
        <cylinderGeometry args={[0.12, 0.12, 0.6, 8]} />
      </mesh>
      {/* Foot pedal */}
      <mesh position={[0.15, 0.04, 0.32]} material={MAT.rubber}>
        <boxGeometry args={[0.12, 0.04, 0.15]} />
      </mesh>
      {/* Pedal arm */}
      <mesh position={[0.15, 0.08, 0.24]} rotation={[0.3, 0, 0]} material={MAT.lightMetal}>
        <cylinderGeometry args={[0.015, 0.015, 0.2, 4]} />
      </mesh>
      {/* Warning stripe */}
      <mesh position={[0, 0.45, 0.29]} material={MAT.warn}>
        <boxGeometry args={[0.2, 0.06, 0.005]} />
      </mesh>
    </group>
  );
});

const EnergyPanelVisual = memo(function EnergyPanelVisual({ pos }: { pos: [number, number, number] }) {
  const [x, , z] = pos;

  useFrame(({ clock }) => {
    MAT.warnLight.emissiveIntensity = Math.sin(clock.getElapsedTime() * 5) > 0 ? 2.0 : 0.2;
  });

  return (
    <group position={[x, 0, z]}>
      {/* Floor transformer box */}
      <mesh position={[0.3, 0.2, 0]} material={MAT.darkMetal}>
        <boxGeometry args={[0.3, 0.4, 0.25]} />
      </mesh>
      {/* Cable conduit */}
      <mesh position={[0.15, 0.6, 0]} material={MAT.lightMetal}>
        <cylinderGeometry args={[0.03, 0.03, 0.9, 6]} />
      </mesh>
      {/* Main panel body */}
      <mesh position={[0, 1.15, 0]} material={MAT.midMetal}>
        <boxGeometry args={[0.9, 1.1, 0.12]} />
      </mesh>
      {/* Panel door */}
      <mesh position={[-0.02, 1.15, 0.07]} material={MAT.lightMetal}>
        <boxGeometry args={[0.82, 1.0, 0.03]} />
      </mesh>
      {/* Switch row (5 switches) */}
      {[-0.25, -0.12, 0, 0.12, 0.25].map((ox, i) => (
        <mesh key={`sw${i}`} position={[ox, 1.3, 0.1]} material={i % 2 === 0 ? MAT.switchGreen : MAT.switchRed}>
          <boxGeometry args={[0.06, 0.1, 0.04]} />
        </mesh>
      ))}
      {/* Voltage meter */}
      <mesh position={[0, 0.9, 0.1]} material={MAT.gaugeFace}>
        <cylinderGeometry args={[0.1, 0.1, 0.03, 16]} />
      </mesh>
      <mesh position={[0, 0.9, 0.12]} material={MAT.gaugeNeedle}>
        <boxGeometry args={[0.005, 0.08, 0.01]} />
      </mesh>
      {/* Warning light */}
      <mesh position={[0.35, 1.6, 0.06]} material={MAT.warnLight}>
        <sphereGeometry args={[0.05, 8, 8]} />
      </mesh>
      {/* Danger label */}
      <mesh position={[0, 0.7, 0.1]} material={MAT.warn}>
        <boxGeometry args={[0.3, 0.06, 0.005]} />
      </mesh>
      {/* Panel mounting brackets */}
      <mesh position={[-0.48, 1.15, 0.04]} material={MAT.darkMetal}>
        <boxGeometry args={[0.04, 0.6, 0.1]} />
      </mesh>
      <mesh position={[0.48, 1.15, 0.04]} material={MAT.darkMetal}>
        <boxGeometry args={[0.04, 0.6, 0.1]} />
      </mesh>
    </group>
  );
});

const AsteroidCannonVisual = memo(function AsteroidCannonVisual({ pos }: { pos: [number, number, number] }) {
  const [x, , z] = pos;

  useFrame(({ clock }) => {
    MAT.scopeGlow.emissiveIntensity = 0.8 + Math.sin(clock.getElapsedTime() * 2) * 0.4;
  });

  return (
    <group position={[x, 0, z]}>
      {/* Heavy base platform */}
      <mesh position={[0, 0.08, 0]} material={MAT.darkMetal}>
        <cylinderGeometry args={[0.55, 0.6, 0.16, 10]} />
      </mesh>
      {/* Turret rotation ring */}
      <mesh position={[0, 0.2, 0]} material={MAT.lightMetal}>
        <cylinderGeometry args={[0.45, 0.5, 0.08, 12]} />
      </mesh>
      {/* Turret body */}
      <mesh position={[0, 0.42, 0]} material={MAT.midMetal}>
        <boxGeometry args={[0.6, 0.35, 0.5]} />
      </mesh>
      {/* Twin barrels */}
      <mesh position={[-0.12, 0.45, 0.55]} rotation={[Math.PI / 2, 0, 0]} material={MAT.darkMetal}>
        <cylinderGeometry args={[0.06, 0.06, 0.7, 8]} />
      </mesh>
      <mesh position={[0.12, 0.45, 0.55]} rotation={[Math.PI / 2, 0, 0]} material={MAT.darkMetal}>
        <cylinderGeometry args={[0.06, 0.06, 0.7, 8]} />
      </mesh>
      {/* Barrel tips (glowing) */}
      <mesh position={[-0.12, 0.45, 0.92]} material={MAT.barrelTip}>
        <cylinderGeometry args={[0.07, 0.065, 0.03, 8]} />
      </mesh>
      <mesh position={[0.12, 0.45, 0.92]} material={MAT.barrelTip}>
        <cylinderGeometry args={[0.07, 0.065, 0.03, 8]} />
      </mesh>
      {/* Targeting scope */}
      <mesh position={[0, 0.65, 0.1]} rotation={[Math.PI / 2, 0, 0]} material={MAT.darkMetal}>
        <cylinderGeometry args={[0.04, 0.04, 0.2, 6]} />
      </mesh>
      <mesh position={[0, 0.65, 0.22]} material={MAT.scopeGlow}>
        <sphereGeometry args={[0.055, 8, 8]} />
      </mesh>
      {/* Ammo drum */}
      <mesh position={[-0.38, 0.35, 0.1]} material={MAT.lightMetal}>
        <cylinderGeometry args={[0.12, 0.12, 0.25, 8]} />
      </mesh>
      {/* Targeting screen */}
      <mesh position={[0.35, 0.55, -0.1]} material={MAT.targetScreen}>
        <boxGeometry args={[0.22, 0.16, 0.03]} />
      </mesh>
      {/* Seat */}
      <mesh position={[0, 0.25, -0.5]} material={MAT.rubber}>
        <boxGeometry args={[0.35, 0.06, 0.35]} />
      </mesh>
      <mesh position={[0, 0.15, -0.5]} material={MAT.lightMetal}>
        <cylinderGeometry args={[0.05, 0.08, 0.2, 6]} />
      </mesh>
    </group>
  );
});

const CardReaderVisual = memo(function CardReaderVisual({ pos }: { pos: [number, number, number] }) {
  const [x, , z] = pos;

  useFrame(({ clock }) => {
    MAT.ledGreen.emissiveIntensity = 0.3 + Math.sin(clock.getElapsedTime() * 1.5) * 0.7;
  });

  return (
    <group position={[x, 0, z]}>
      {/* Pedestal base */}
      <mesh position={[0, 0.15, 0]} material={MAT.darkMetal}>
        <boxGeometry args={[0.35, 0.3, 0.2]} />
      </mesh>
      {/* Pedestal column */}
      <mesh position={[0, 0.55, 0]} material={MAT.midMetal}>
        <boxGeometry args={[0.12, 0.5, 0.12]} />
      </mesh>
      {/* Terminal body */}
      <mesh position={[0, 1.05, 0]} material={MAT.midMetal}>
        <boxGeometry args={[0.45, 0.7, 0.18]} />
      </mesh>
      {/* Screen */}
      <mesh position={[0, 1.15, 0.1]} material={MAT.cardScreen}>
        <boxGeometry args={[0.35, 0.25, 0.02]} />
      </mesh>
      {/* Card slot */}
      <mesh position={[0, 0.88, 0.1]} material={MAT.cardSlot}>
        <boxGeometry args={[0.28, 0.03, 0.06]} />
      </mesh>
      {/* Slot guide arrows */}
      <mesh position={[-0.18, 0.88, 0.1]} material={MAT.slotGuide}>
        <boxGeometry args={[0.02, 0.015, 0.04]} />
      </mesh>
      <mesh position={[0.18, 0.88, 0.1]} material={MAT.slotGuide}>
        <boxGeometry args={[0.02, 0.015, 0.04]} />
      </mesh>
      {/* Keypad (3x3 grid) */}
      {[[-0.08, 0], [0, 0], [0.08, 0], [-0.08, -0.08], [0, -0.08], [0.08, -0.08], [-0.08, -0.16], [0, -0.16], [0.08, -0.16]].map(
        ([ox, oy], i) => (
          <mesh key={`kp${i}`} position={[ox, 0.98 + oy, 0.1]} material={MAT.keypad}>
            <boxGeometry args={[0.05, 0.05, 0.015]} />
          </mesh>
        ),
      )}
      {/* Status LED */}
      <mesh position={[0.17, 1.32, 0.1]} material={MAT.ledGreen}>
        <sphereGeometry args={[0.025, 6, 6]} />
      </mesh>
      {/* Cable to floor */}
      <mesh position={[0, 0.4, -0.08]} material={MAT.rubber}>
        <cylinderGeometry args={[0.02, 0.02, 0.5, 4]} />
      </mesh>
    </group>
  );
});

const EngineVisual = memo(function EngineVisual({ pos }: { pos: [number, number, number] }) {
  const fanRef = useRef<THREE.Mesh>(null);
  const [x, , z] = pos;

  useFrame(({ clock }) => {
    if (fanRef.current) fanRef.current.rotation.z = clock.getElapsedTime() * 3;
  });

  return (
    <group position={[x, 0, z]}>
      {/* Support frame legs */}
      <mesh position={[-0.35, 0.25, -0.2]} material={MAT.darkMetal}>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
      </mesh>
      <mesh position={[0.35, 0.25, -0.2]} material={MAT.darkMetal}>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
      </mesh>
      <mesh position={[-0.35, 0.25, 0.2]} material={MAT.darkMetal}>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
      </mesh>
      <mesh position={[0.35, 0.25, 0.2]} material={MAT.darkMetal}>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
      </mesh>
      {/* Main engine block */}
      <mesh position={[0, 0.65, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.midMetal}>
        <cylinderGeometry args={[0.3, 0.3, 0.9, 12]} />
      </mesh>
      {/* End caps */}
      <mesh position={[-0.48, 0.65, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.lightMetal}>
        <cylinderGeometry args={[0.32, 0.3, 0.06, 12]} />
      </mesh>
      <mesh position={[0.48, 0.65, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.lightMetal}>
        <cylinderGeometry args={[0.32, 0.3, 0.06, 12]} />
      </mesh>
      {/* Spinning fan disc */}
      <mesh ref={fanRef} position={[0.52, 0.65, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.fan}>
        <cylinderGeometry args={[0.22, 0.22, 0.015, 3]} />
      </mesh>
      {/* Exhaust pipe */}
      <mesh position={[0, 1.1, 0]} material={MAT.darkMetal}>
        <cylinderGeometry args={[0.08, 0.08, 0.5, 8]} />
      </mesh>
      <mesh position={[0, 1.38, 0]} material={MAT.lightMetal}>
        <cylinderGeometry args={[0.1, 0.08, 0.06, 8]} />
      </mesh>
      {/* Pressure gauge */}
      <mesh position={[0.15, 0.9, 0.28]} rotation={[Math.PI / 2, 0, 0]} material={MAT.gaugeFace}>
        <cylinderGeometry args={[0.06, 0.06, 0.02, 12]} />
      </mesh>
      {/* Gauge needle */}
      <mesh position={[0.15, 0.9, 0.3]} rotation={[Math.PI / 2, 0, 0.4]} material={MAT.gaugeNeedle}>
        <boxGeometry args={[0.004, 0.05, 0.005]} />
      </mesh>
      {/* Control panel (angled) */}
      <mesh position={[0, 0.5, 0.45]} rotation={[-0.5, 0, 0]} material={MAT.panel}>
        <boxGeometry args={[0.4, 0.25, 0.06]} />
      </mesh>
      {/* Panel buttons */}
      {[-0.1, 0, 0.1].map((ox, i) => (
        <mesh key={`eb${i}`} position={[ox, 0.52, 0.48]} rotation={[-0.5, 0, 0]} material={BTN_MATS[i]}>
          <cylinderGeometry args={[0.025, 0.025, 0.02, 8]} />
        </mesh>
      ))}
      {/* Cooling pipes */}
      <mesh position={[-0.2, 0.85, 0.28]} rotation={[Math.PI / 2, 0, 0]} material={MAT.lightMetal}>
        <cylinderGeometry args={[0.03, 0.03, 0.2, 6]} />
      </mesh>
      <mesh position={[-0.35, 0.85, 0.28]} rotation={[Math.PI / 2, 0, 0]} material={MAT.lightMetal}>
        <cylinderGeometry args={[0.03, 0.03, 0.2, 6]} />
      </mesh>
    </group>
  );
});

const GenericTerminalVisual = memo(function GenericTerminalVisual({ pos }: { pos: [number, number, number] }) {
  const [x, , z] = pos;

  useFrame(({ clock }) => {
    MAT.monitorScreen.emissiveIntensity = 0.6 + Math.sin(clock.getElapsedTime() * 0.8) * 0.15;
  });

  return (
    <group position={[x, 0, z]}>
      {/* Desk */}
      <mesh position={[0, 0.55, 0]} material={MAT.midMetal}>
        <boxGeometry args={[0.8, 0.05, 0.45]} />
      </mesh>
      {/* Desk legs */}
      <mesh position={[-0.35, 0.27, -0.18]} material={MAT.darkMetal}>
        <boxGeometry args={[0.06, 0.54, 0.06]} />
      </mesh>
      <mesh position={[0.35, 0.27, -0.18]} material={MAT.darkMetal}>
        <boxGeometry args={[0.06, 0.54, 0.06]} />
      </mesh>
      <mesh position={[-0.35, 0.27, 0.18]} material={MAT.darkMetal}>
        <boxGeometry args={[0.06, 0.54, 0.06]} />
      </mesh>
      <mesh position={[0.35, 0.27, 0.18]} material={MAT.darkMetal}>
        <boxGeometry args={[0.06, 0.54, 0.06]} />
      </mesh>
      {/* Monitor bezel */}
      <mesh position={[0, 0.95, -0.12]} material={MAT.monitorBezel}>
        <boxGeometry args={[0.55, 0.4, 0.04]} />
      </mesh>
      {/* Monitor screen */}
      <mesh position={[0, 0.95, -0.1]} material={MAT.monitorScreen}>
        <boxGeometry args={[0.48, 0.32, 0.01]} />
      </mesh>
      {/* Monitor stand */}
      <mesh position={[0, 0.68, -0.12]} material={MAT.lightMetal}>
        <cylinderGeometry args={[0.03, 0.03, 0.2, 6]} />
      </mesh>
      <mesh position={[0, 0.58, -0.12]} material={MAT.lightMetal}>
        <cylinderGeometry args={[0.1, 0.1, 0.02, 8]} />
      </mesh>
      {/* Keyboard */}
      <mesh position={[0, 0.59, 0.06]} material={MAT.keyboard}>
        <boxGeometry args={[0.35, 0.02, 0.12]} />
      </mesh>
      {/* Small device on desk */}
      <mesh position={[0.28, 0.61, 0.05]} material={MAT.panel}>
        <boxGeometry args={[0.1, 0.04, 0.08]} />
      </mesh>
      {/* CPU tower under desk */}
      <mesh position={[0.28, 0.22, -0.1]} material={MAT.darkMetal}>
        <boxGeometry args={[0.15, 0.4, 0.3]} />
      </mesh>
      {/* CPU power LED */}
      <mesh position={[0.28, 0.35, 0.06]} material={MAT.cpuLed}>
        <sphereGeometry args={[0.015, 6, 6]} />
      </mesh>
      {/* Chair */}
      <mesh position={[0, 0.3, 0.45]} material={MAT.rubber}>
        <boxGeometry args={[0.3, 0.04, 0.3]} />
      </mesh>
      <mesh position={[0, 0.18, 0.45]} material={MAT.lightMetal}>
        <cylinderGeometry args={[0.04, 0.06, 0.22, 6]} />
      </mesh>
      <mesh position={[0, 0.45, 0.59]} material={MAT.rubber}>
        <boxGeometry args={[0.3, 0.25, 0.03]} />
      </mesh>
    </group>
  );
});

// ══════════════════════════════════════════════════════════════
// Dispatcher — maps task type to visual component
// ══════════════════════════════════════════════════════════════

const VISUAL_COMPONENTS: Record<TaskVisualCategory, React.ComponentType<{ pos: [number, number, number] }>> = {
  scanner: ScannerVisual,
  container: TrashVisual,
  panel: EnergyPanelVisual,
  turret: AsteroidCannonVisual,
  pedestal: CardReaderVisual,
  engine: EngineVisual,
  terminal: GenericTerminalVisual,
};

const TaskStationVisual = memo(function TaskStationVisual({ task }: { task: TaskStationInfo }) {
  const meta = TASK_REGISTRY[task.taskType];
  const Component = VISUAL_COMPONENTS[meta?.visualCategory ?? 'terminal'];
  return <Component pos={task.position} />;
});

// ══════════════════════════════════════════════════════════════
// Status glow ring on floor per task station
// ══════════════════════════════════════════════════════════════

function TaskStatusRings({ tasks }: { tasks: TaskStationInfo[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const mazeSnapshot = useGameStore((s) => s.mazeSnapshot);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || tasks.length === 0) return;

    for (let i = 0; i < tasks.length; i++) {
      const [tx, , tz] = tasks[i].position;
      _p.set(tx, 0.02, tz);
      _s.set(1.0, 0.02, 1.0);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      _c.copy(COL_GLOW_PENDING);
      mesh.setColorAt(i, _c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [tasks]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh || !mazeSnapshot || tasks.length === 0) return;

    const time = clock.getElapsedTime();
    let changed = false;

    for (let i = 0; i < tasks.length; i++) {
      const ts = mazeSnapshot.taskStates[tasks[i].id];
      const state = ts?.completionState ?? 'pending';

      if (state === 'pending') {
        const pulse = 0.7 + Math.sin(time * 1.5 + i) * 0.3;
        _c.copy(COL_GLOW_PENDING).multiplyScalar(pulse);
      } else if (state === 'in_progress') {
        const t = (Math.sin(time * 4) + 1) / 2;
        _c.copy(COL_PROGRESS_A).lerp(COL_PROGRESS_B, t);
      } else {
        _c.copy(COL_GLOW_DONE);
      }

      mesh.setColorAt(i, _c);
      changed = true;
    }

    if (changed && mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  });

  if (tasks.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, tasks.length]} frustumCulled={false}>
      <torusGeometry args={[1, 0.08, 6, 24]} />
      <meshStandardMaterial
        emissive="#ffffff"
        emissiveIntensity={2.0}
        roughness={0.5}
        metalness={0.2}
        transparent
        opacity={0.5}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

// ══════════════════════════════════════════════════════════════
// Floating interaction indicator (diamond hovering above assigned pending tasks)
// ══════════════════════════════════════════════════════════════

function TaskFloatingIndicators({ tasks }: { tasks: TaskStationInfo[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const assignedTasks = useGameStore((s) => s.assignedTasks);
  const mazeSnapshot = useGameStore((s) => s.mazeSnapshot);

  // Build a list of tasks that should show indicators (assigned + not completed)
  const activeTasks = useMemo(() => {
    if (!assignedTasks.length) return [];
    const assignedSet = new Set(assignedTasks);
    return tasks.filter((t) => assignedSet.has(t.id));
  }, [tasks, assignedTasks]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || activeTasks.length === 0) return;

    for (let i = 0; i < activeTasks.length; i++) {
      const [tx, , tz] = activeTasks[i].position;
      _p.set(tx, 2.5, tz);
      _s.set(0.12, 0.2, 0.12);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      _c.setHex(0x44aaff);
      mesh.setColorAt(i, _c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [activeTasks]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh || activeTasks.length === 0 || !mazeSnapshot) return;

    const time = clock.getElapsedTime();

    for (let i = 0; i < activeTasks.length; i++) {
      const ts = mazeSnapshot.taskStates[activeTasks[i].id];
      const state = ts?.completionState ?? 'pending';
      const [tx, , tz] = activeTasks[i].position;

      // Bob up and down
      const bobY = 2.5 + Math.sin(time * 2 + i * 0.5) * 0.15;
      _p.set(tx, bobY, tz);

      // Rotate
      _q.setFromAxisAngle(_yAxis, time * 1.5 + i);
      _s.set(0.12, 0.2, 0.12);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);

      // Color by state
      if (state === 'completed') {
        _c.copy(COL_DONE);
      } else if (state === 'in_progress') {
        const t = (Math.sin(time * 4) + 1) / 2;
        _c.copy(COL_PROGRESS_A).lerp(COL_PROGRESS_B, t);
      } else {
        const pulse = 0.7 + Math.sin(time * 2) * 0.3;
        _c.set(0.25 * pulse, 0.65 * pulse, 1.0 * pulse);
      }
      mesh.setColorAt(i, _c);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  if (activeTasks.length === 0) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, activeTasks.length]} frustumCulled={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        emissive="#ffffff"
        emissiveIntensity={2.5}
        roughness={0.2}
        metalness={0.5}
        transparent
        opacity={0.85}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

// ══════════════════════════════════════════════════════════════
// Distance-based culling — only render detailed visuals for nearby tasks
// ══════════════════════════════════════════════════════════════

const TASK_VISUAL_RANGE_SQ = 40 * 40;
const CULL_INTERVAL = 10;

function NearbyTaskVisuals({ tasks }: { tasks: TaskStationInfo[] }) {
  const [nearbyIds, setNearbyIds] = useState<Set<string>>(new Set());
  const prevIdsRef = useRef('');
  const frameRef = useRef(0);

  useFrame(() => {
    if (++frameRef.current % CULL_INTERVAL !== 0) return;
    const [px, , pz] = useGameStore.getState().localPosition;
    const ids: string[] = [];
    for (const task of tasks) {
      const dx = task.position[0] - px;
      const dz = task.position[2] - pz;
      if (dx * dx + dz * dz < TASK_VISUAL_RANGE_SQ) {
        ids.push(task.id);
      }
    }
    const key = ids.join(',');
    if (key !== prevIdsRef.current) {
      prevIdsRef.current = key;
      setNearbyIds(new Set(ids));
    }
  });

  return (
    <>
      {tasks.map((task) =>
        nearbyIds.has(task.id) ? <TaskStationVisual key={task.id} task={task} /> : null,
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// Main export
// ══════════════════════════════════════════════════════════════

export function TaskStations() {
  const mazeLayout = useGameStore((s) => s.mazeLayout);

  const tasks = useMemo(() => {
    if (!mazeLayout?.tasks?.length) return null;
    return mazeLayout.tasks;
  }, [mazeLayout]);

  if (!tasks) return null;

  return (
    <group>
      <NearbyTaskVisuals tasks={tasks} />
      <TaskStatusRings tasks={tasks} />
      <TaskFloatingIndicators tasks={tasks} />
    </group>
  );
}
