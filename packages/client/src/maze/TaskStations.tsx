import { useRef, useMemo, useEffect, useState } from 'react';
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

// ── Material cache (shared across all task types) ──
const MAT = {
  darkMetal: { color: '#1a1e28', roughness: 0.2, metalness: 0.9 },
  midMetal: { color: '#2a303e', roughness: 0.25, metalness: 0.85 },
  lightMetal: { color: '#3a424e', roughness: 0.3, metalness: 0.8 },
  panel: { color: '#101520', roughness: 0.15, metalness: 0.7 },
  accent: { color: '#1a3050', roughness: 0.3, metalness: 0.6 },
  rubber: { color: '#0c0c0c', roughness: 0.8, metalness: 0.1 },
  warn: { color: '#ccaa00', roughness: 0.5, metalness: 0.3 },
} as const;

// ══════════════════════════════════════════════════════════════
// Per-type detailed visuals
// ══════════════════════════════════════════════════════════════

function ScannerVisual({ pos }: { pos: [number, number, number] }) {
  const beamRef = useRef<THREE.Mesh>(null);
  const ledRef = useRef<THREE.Mesh>(null);
  const [x, , z] = pos;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (beamRef.current) beamRef.current.position.y = 0.8 + Math.sin(t * 2) * 0.4;
    if (ledRef.current) {
      (ledRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.5 + Math.sin(t * 3) * 0.5;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* Base platform */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.6, 0.65, 0.1, 8]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      {/* Vertical column */}
      <mesh position={[0, 0.8, -0.25]}>
        <boxGeometry args={[0.12, 1.5, 0.12]} />
        <meshStandardMaterial {...MAT.midMetal} />
      </mesh>
      {/* Support arm (horizontal) */}
      <mesh position={[0, 1.2, -0.1]}>
        <boxGeometry args={[0.08, 0.08, 0.4]} />
        <meshStandardMaterial {...MAT.lightMetal} />
      </mesh>
      {/* Scanning pod (glass tube) */}
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 1.2, 16, 1, true]} />
        <meshStandardMaterial color="#1a3044" transparent opacity={0.15} roughness={0.05} metalness={0.3} side={THREE.DoubleSide} />
      </mesh>
      {/* Scanning beam (animated) */}
      <mesh ref={beamRef} position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.02, 16]} />
        <meshStandardMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={1.5} transparent opacity={0.4} toneMapped={false} />
      </mesh>
      {/* Hand scanner pad */}
      <mesh position={[0.35, 0.7, 0.1]} rotation={[0.3, 0, 0.2]}>
        <boxGeometry args={[0.2, 0.04, 0.3]} />
        <meshStandardMaterial {...MAT.panel} />
      </mesh>
      <mesh position={[0.35, 0.725, 0.1]} rotation={[0.3, 0, 0.2]}>
        <boxGeometry args={[0.15, 0.005, 0.2]} />
        <meshStandardMaterial color="#003322" emissive="#00ff88" emissiveIntensity={0.4} toneMapped={false} />
      </mesh>
      {/* Top cap */}
      <mesh position={[0, 1.42, 0]}>
        <cylinderGeometry args={[0.38, 0.35, 0.06, 16]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      {/* LED indicator */}
      <mesh ref={ledRef} position={[0, 1.56, -0.25]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#00ffaa" emissive="#00ffaa" emissiveIntensity={1} toneMapped={false} />
      </mesh>
      {/* Screen on column */}
      <mesh position={[0, 1.3, -0.19]}>
        <boxGeometry args={[0.18, 0.12, 0.02]} />
        <meshStandardMaterial color="#001122" emissive="#0088ff" emissiveIntensity={0.8} toneMapped={false} />
      </mesh>
    </group>
  );
}

function TrashVisual({ pos }: { pos: [number, number, number] }) {
  const [x, , z] = pos;
  return (
    <group position={[x, 0, z]}>
      {/* Main bin */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.28, 0.32, 0.8, 10]} />
        <meshStandardMaterial {...MAT.midMetal} />
      </mesh>
      {/* Bin rim */}
      <mesh position={[0, 0.82, 0]}>
        <cylinderGeometry args={[0.32, 0.3, 0.04, 10]} />
        <meshStandardMaterial {...MAT.lightMetal} />
      </mesh>
      {/* Recycling bin (smaller, green-tinted) */}
      <mesh position={[0.45, 0.3, 0]}>
        <cylinderGeometry args={[0.2, 0.22, 0.6, 8]} />
        <meshStandardMaterial color="#1a3022" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[0.45, 0.62, 0]}>
        <cylinderGeometry args={[0.23, 0.21, 0.04, 8]} />
        <meshStandardMaterial color="#224030" roughness={0.25} metalness={0.7} />
      </mesh>
      {/* Chute/funnel above */}
      <mesh position={[0, 1.3, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.35, 0.5, 8]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      {/* Chute pipe (connects chute to ceiling area) */}
      <mesh position={[0, 1.8, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.6, 8]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      {/* Foot pedal */}
      <mesh position={[0.15, 0.04, 0.32]}>
        <boxGeometry args={[0.12, 0.04, 0.15]} />
        <meshStandardMaterial {...MAT.rubber} />
      </mesh>
      {/* Pedal arm */}
      <mesh position={[0.15, 0.08, 0.24]} rotation={[0.3, 0, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.2, 4]} />
        <meshStandardMaterial {...MAT.lightMetal} />
      </mesh>
      {/* Warning stripe */}
      <mesh position={[0, 0.45, 0.29]}>
        <boxGeometry args={[0.2, 0.06, 0.005]} />
        <meshStandardMaterial {...MAT.warn} />
      </mesh>
    </group>
  );
}

function EnergyPanelVisual({ pos }: { pos: [number, number, number] }) {
  const warnRef = useRef<THREE.Mesh>(null);
  const [x, , z] = pos;

  useFrame(({ clock }) => {
    if (warnRef.current) {
      const t = clock.getElapsedTime();
      (warnRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        Math.sin(t * 5) > 0 ? 2.0 : 0.2;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* Floor transformer box */}
      <mesh position={[0.3, 0.2, 0]}>
        <boxGeometry args={[0.3, 0.4, 0.25]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      {/* Cable conduit (floor to panel) */}
      <mesh position={[0.15, 0.6, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.9, 6]} />
        <meshStandardMaterial {...MAT.lightMetal} />
      </mesh>
      {/* Main panel body */}
      <mesh position={[0, 1.15, 0]}>
        <boxGeometry args={[0.9, 1.1, 0.12]} />
        <meshStandardMaterial {...MAT.midMetal} />
      </mesh>
      {/* Panel door (slightly open) */}
      <mesh position={[-0.02, 1.15, 0.07]}>
        <boxGeometry args={[0.82, 1.0, 0.03]} />
        <meshStandardMaterial {...MAT.lightMetal} />
      </mesh>
      {/* Switch row (5 switches) */}
      {[-0.25, -0.12, 0, 0.12, 0.25].map((ox, i) => (
        <mesh key={`sw${i}`} position={[ox, 1.3, 0.1]}>
          <boxGeometry args={[0.06, 0.1, 0.04]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? '#44ff44' : '#ff4444'}
            emissive={i % 2 === 0 ? '#44ff44' : '#ff4444'}
            emissiveIntensity={0.5}
            toneMapped={false}
          />
        </mesh>
      ))}
      {/* Voltage meter */}
      <mesh position={[0, 0.9, 0.1]}>
        <cylinderGeometry args={[0.1, 0.1, 0.03, 16]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.1} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.9, 0.12]}>
        <boxGeometry args={[0.005, 0.08, 0.01]} />
        <meshStandardMaterial color="#ff3333" emissive="#ff3333" emissiveIntensity={0.8} toneMapped={false} />
      </mesh>
      {/* Warning light */}
      <mesh ref={warnRef} position={[0.35, 1.6, 0.06]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#ff2200" emissive="#ff2200" emissiveIntensity={1} toneMapped={false} />
      </mesh>
      {/* Danger label */}
      <mesh position={[0, 0.7, 0.1]}>
        <boxGeometry args={[0.3, 0.06, 0.005]} />
        <meshStandardMaterial {...MAT.warn} />
      </mesh>
      {/* Panel mounting bracket */}
      <mesh position={[-0.48, 1.15, 0.04]}>
        <boxGeometry args={[0.04, 0.6, 0.1]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      <mesh position={[0.48, 1.15, 0.04]}>
        <boxGeometry args={[0.04, 0.6, 0.1]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
    </group>
  );
}

function AsteroidCannonVisual({ pos }: { pos: [number, number, number] }) {
  const scopeRef = useRef<THREE.Mesh>(null);
  const [x, , z] = pos;

  useFrame(({ clock }) => {
    if (scopeRef.current) {
      (scopeRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.8 + Math.sin(clock.getElapsedTime() * 2) * 0.4;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* Heavy base platform */}
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.55, 0.6, 0.16, 10]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      {/* Turret rotation ring */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.45, 0.5, 0.08, 12]} />
        <meshStandardMaterial {...MAT.lightMetal} />
      </mesh>
      {/* Turret body */}
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[0.6, 0.35, 0.5]} />
        <meshStandardMaterial {...MAT.midMetal} />
      </mesh>
      {/* Twin barrels */}
      <mesh position={[-0.12, 0.45, 0.55]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.7, 8]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      <mesh position={[0.12, 0.45, 0.55]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.7, 8]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      {/* Barrel tips (glowing) */}
      <mesh position={[-0.12, 0.45, 0.92]}>
        <cylinderGeometry args={[0.07, 0.065, 0.03, 8]} />
        <meshStandardMaterial color="#ff4400" emissive="#ff4400" emissiveIntensity={0.6} toneMapped={false} />
      </mesh>
      <mesh position={[0.12, 0.45, 0.92]}>
        <cylinderGeometry args={[0.07, 0.065, 0.03, 8]} />
        <meshStandardMaterial color="#ff4400" emissive="#ff4400" emissiveIntensity={0.6} toneMapped={false} />
      </mesh>
      {/* Targeting scope */}
      <mesh position={[0, 0.65, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.2, 6]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      <mesh ref={scopeRef} position={[0, 0.65, 0.22]}>
        <sphereGeometry args={[0.055, 8, 8]} />
        <meshStandardMaterial color="#ff3300" emissive="#ff3300" emissiveIntensity={1} toneMapped={false} />
      </mesh>
      {/* Ammo drum */}
      <mesh position={[-0.38, 0.35, 0.1]}>
        <cylinderGeometry args={[0.12, 0.12, 0.25, 8]} />
        <meshStandardMaterial {...MAT.lightMetal} />
      </mesh>
      {/* Targeting screen */}
      <mesh position={[0.35, 0.55, -0.1]}>
        <boxGeometry args={[0.22, 0.16, 0.03]} />
        <meshStandardMaterial color="#001100" emissive="#ff8800" emissiveIntensity={0.6} toneMapped={false} />
      </mesh>
      {/* Seat (simple chair) */}
      <mesh position={[0, 0.25, -0.5]}>
        <boxGeometry args={[0.35, 0.06, 0.35]} />
        <meshStandardMaterial {...MAT.rubber} />
      </mesh>
      <mesh position={[0, 0.15, -0.5]}>
        <cylinderGeometry args={[0.05, 0.08, 0.2, 6]} />
        <meshStandardMaterial {...MAT.lightMetal} />
      </mesh>
    </group>
  );
}

function CardReaderVisual({ pos }: { pos: [number, number, number] }) {
  const ledRef = useRef<THREE.Mesh>(null);
  const [x, , z] = pos;

  useFrame(({ clock }) => {
    if (ledRef.current) {
      (ledRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.3 + Math.sin(clock.getElapsedTime() * 1.5) * 0.7;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* Pedestal base */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.35, 0.3, 0.2]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      {/* Pedestal column */}
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[0.12, 0.5, 0.12]} />
        <meshStandardMaterial {...MAT.midMetal} />
      </mesh>
      {/* Terminal body */}
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[0.45, 0.7, 0.18]} />
        <meshStandardMaterial {...MAT.midMetal} />
      </mesh>
      {/* Screen */}
      <mesh position={[0, 1.15, 0.1]}>
        <boxGeometry args={[0.35, 0.25, 0.02]} />
        <meshStandardMaterial color="#001133" emissive="#2266ff" emissiveIntensity={0.7} toneMapped={false} />
      </mesh>
      {/* Card slot */}
      <mesh position={[0, 0.88, 0.1]}>
        <boxGeometry args={[0.28, 0.03, 0.06]} />
        <meshStandardMaterial color="#050505" roughness={0.9} metalness={0.1} />
      </mesh>
      {/* Slot guide arrows */}
      <mesh position={[-0.18, 0.88, 0.1]}>
        <boxGeometry args={[0.02, 0.015, 0.04]} />
        <meshStandardMaterial color="#33aaff" emissive="#33aaff" emissiveIntensity={0.5} toneMapped={false} />
      </mesh>
      <mesh position={[0.18, 0.88, 0.1]}>
        <boxGeometry args={[0.02, 0.015, 0.04]} />
        <meshStandardMaterial color="#33aaff" emissive="#33aaff" emissiveIntensity={0.5} toneMapped={false} />
      </mesh>
      {/* Keypad (3x3 grid) */}
      {[[-0.08, 0], [0, 0], [0.08, 0], [-0.08, -0.08], [0, -0.08], [0.08, -0.08], [-0.08, -0.16], [0, -0.16], [0.08, -0.16]].map(
        ([ox, oy], i) => (
          <mesh key={`kp${i}`} position={[ox, 0.98 + oy, 0.1]}>
            <boxGeometry args={[0.05, 0.05, 0.015]} />
            <meshStandardMaterial color="#1a2030" roughness={0.4} metalness={0.5} />
          </mesh>
        ),
      )}
      {/* Status LED */}
      <mesh ref={ledRef} position={[0.17, 1.32, 0.1]}>
        <sphereGeometry args={[0.025, 6, 6]} />
        <meshStandardMaterial color="#00ff44" emissive="#00ff44" emissiveIntensity={1} toneMapped={false} />
      </mesh>
      {/* Cable to floor */}
      <mesh position={[0, 0.4, -0.08]}>
        <cylinderGeometry args={[0.02, 0.02, 0.5, 4]} />
        <meshStandardMaterial {...MAT.rubber} />
      </mesh>
    </group>
  );
}

function EngineVisual({ pos }: { pos: [number, number, number] }) {
  const fanRef = useRef<THREE.Mesh>(null);
  const [x, , z] = pos;

  useFrame(({ clock }) => {
    if (fanRef.current) fanRef.current.rotation.z = clock.getElapsedTime() * 3;
  });

  return (
    <group position={[x, 0, z]}>
      {/* Support frame legs */}
      <mesh position={[-0.35, 0.25, -0.2]}>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      <mesh position={[0.35, 0.25, -0.2]}>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      <mesh position={[-0.35, 0.25, 0.2]}>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      <mesh position={[0.35, 0.25, 0.2]}>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      {/* Main engine block (horizontal cylinder) */}
      <mesh position={[0, 0.65, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.3, 0.3, 0.9, 12]} />
        <meshStandardMaterial {...MAT.midMetal} />
      </mesh>
      {/* End caps */}
      <mesh position={[-0.48, 0.65, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.32, 0.3, 0.06, 12]} />
        <meshStandardMaterial {...MAT.lightMetal} />
      </mesh>
      <mesh position={[0.48, 0.65, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.32, 0.3, 0.06, 12]} />
        <meshStandardMaterial {...MAT.lightMetal} />
      </mesh>
      {/* Spinning fan disc */}
      <mesh ref={fanRef} position={[0.52, 0.65, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.22, 0.22, 0.015, 3]} />
        <meshStandardMaterial color="#445566" roughness={0.15} metalness={0.9} />
      </mesh>
      {/* Exhaust pipe */}
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.5, 8]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      <mesh position={[0, 1.38, 0]}>
        <cylinderGeometry args={[0.1, 0.08, 0.06, 8]} />
        <meshStandardMaterial {...MAT.lightMetal} />
      </mesh>
      {/* Pressure gauge */}
      <mesh position={[0.15, 0.9, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.02, 12]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.1} metalness={0.5} />
      </mesh>
      {/* Gauge needle */}
      <mesh position={[0.15, 0.9, 0.3]} rotation={[Math.PI / 2, 0, 0.4]}>
        <boxGeometry args={[0.004, 0.05, 0.005]} />
        <meshStandardMaterial color="#ff3333" emissive="#ff3333" emissiveIntensity={0.6} toneMapped={false} />
      </mesh>
      {/* Control panel (angled) */}
      <mesh position={[0, 0.5, 0.45]} rotation={[-0.5, 0, 0]}>
        <boxGeometry args={[0.4, 0.25, 0.06]} />
        <meshStandardMaterial {...MAT.panel} />
      </mesh>
      {/* Panel buttons */}
      {[-0.1, 0, 0.1].map((ox, i) => (
        <mesh key={`eb${i}`} position={[ox, 0.52, 0.48]} rotation={[-0.5, 0, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.02, 8]} />
          <meshStandardMaterial
            color={['#44ff44', '#ff4444', '#ffaa00'][i]}
            emissive={['#44ff44', '#ff4444', '#ffaa00'][i]}
            emissiveIntensity={0.6}
            toneMapped={false}
          />
        </mesh>
      ))}
      {/* Cooling pipes */}
      <mesh position={[-0.2, 0.85, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.2, 6]} />
        <meshStandardMaterial {...MAT.lightMetal} />
      </mesh>
      <mesh position={[-0.35, 0.85, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.2, 6]} />
        <meshStandardMaterial {...MAT.lightMetal} />
      </mesh>
    </group>
  );
}

function GenericTerminalVisual({ pos }: { pos: [number, number, number] }) {
  const screenRef = useRef<THREE.Mesh>(null);
  const [x, , z] = pos;

  useFrame(({ clock }) => {
    if (screenRef.current) {
      (screenRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.6 + Math.sin(clock.getElapsedTime() * 0.8) * 0.15;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* Desk */}
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[0.8, 0.05, 0.45]} />
        <meshStandardMaterial {...MAT.midMetal} />
      </mesh>
      {/* Desk legs */}
      <mesh position={[-0.35, 0.27, -0.18]}>
        <boxGeometry args={[0.06, 0.54, 0.06]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      <mesh position={[0.35, 0.27, -0.18]}>
        <boxGeometry args={[0.06, 0.54, 0.06]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      <mesh position={[-0.35, 0.27, 0.18]}>
        <boxGeometry args={[0.06, 0.54, 0.06]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      <mesh position={[0.35, 0.27, 0.18]}>
        <boxGeometry args={[0.06, 0.54, 0.06]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      {/* Monitor bezel */}
      <mesh position={[0, 0.95, -0.12]}>
        <boxGeometry args={[0.55, 0.4, 0.04]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.15} metalness={0.8} />
      </mesh>
      {/* Monitor screen */}
      <mesh ref={screenRef} position={[0, 0.95, -0.1]}>
        <boxGeometry args={[0.48, 0.32, 0.01]} />
        <meshStandardMaterial color="#000d1a" emissive="#1155cc" emissiveIntensity={0.7} toneMapped={false} />
      </mesh>
      {/* Monitor stand */}
      <mesh position={[0, 0.68, -0.12]}>
        <cylinderGeometry args={[0.03, 0.03, 0.2, 6]} />
        <meshStandardMaterial {...MAT.lightMetal} />
      </mesh>
      <mesh position={[0, 0.58, -0.12]}>
        <cylinderGeometry args={[0.1, 0.1, 0.02, 8]} />
        <meshStandardMaterial {...MAT.lightMetal} />
      </mesh>
      {/* Keyboard */}
      <mesh position={[0, 0.59, 0.06]}>
        <boxGeometry args={[0.35, 0.02, 0.12]} />
        <meshStandardMaterial color="#0c0c0c" roughness={0.7} metalness={0.3} />
      </mesh>
      {/* Small device on desk */}
      <mesh position={[0.28, 0.61, 0.05]}>
        <boxGeometry args={[0.1, 0.04, 0.08]} />
        <meshStandardMaterial {...MAT.panel} />
      </mesh>
      {/* CPU tower under desk */}
      <mesh position={[0.28, 0.22, -0.1]}>
        <boxGeometry args={[0.15, 0.4, 0.3]} />
        <meshStandardMaterial {...MAT.darkMetal} />
      </mesh>
      {/* CPU power LED */}
      <mesh position={[0.28, 0.35, 0.06]}>
        <sphereGeometry args={[0.015, 6, 6]} />
        <meshStandardMaterial color="#00ff44" emissive="#00ff44" emissiveIntensity={1.5} toneMapped={false} />
      </mesh>
      {/* Chair */}
      <mesh position={[0, 0.3, 0.45]}>
        <boxGeometry args={[0.3, 0.04, 0.3]} />
        <meshStandardMaterial {...MAT.rubber} />
      </mesh>
      <mesh position={[0, 0.18, 0.45]}>
        <cylinderGeometry args={[0.04, 0.06, 0.22, 6]} />
        <meshStandardMaterial {...MAT.lightMetal} />
      </mesh>
      <mesh position={[0, 0.45, 0.59]}>
        <boxGeometry args={[0.3, 0.25, 0.03]} />
        <meshStandardMaterial {...MAT.rubber} />
      </mesh>
    </group>
  );
}

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

function TaskStationVisual({ task }: { task: TaskStationInfo }) {
  const meta = TASK_REGISTRY[task.taskType];
  const Component = VISUAL_COMPONENTS[meta?.visualCategory ?? 'terminal'];
  return <Component pos={task.position} />;
}

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
// Main export
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// Distance-based culling — only render detailed visuals for nearby tasks
// ══════════════════════════════════════════════════════════════

const TASK_VISUAL_RANGE_SQ = 40 * 40; // render detailed visuals within 40 units

function NearbyTaskVisuals({ tasks }: { tasks: TaskStationInfo[] }) {
  const [nearbyIds, setNearbyIds] = useState<Set<string>>(new Set());
  const prevIdsRef = useRef('');

  useFrame(() => {
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
