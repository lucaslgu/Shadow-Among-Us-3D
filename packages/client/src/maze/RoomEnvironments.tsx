import { useRef, useMemo, useState, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { TaskStationInfo, TaskVisualCategory } from '@shadow/shared';
import { TASK_REGISTRY } from '@shadow/shared';
import { useGameStore } from '../stores/game-store.js';

// ── Module-level temp objects (zero allocations in useFrame) ──
const _v = new THREE.Vector3();

// ══════════════════════════════════════════════════════════════
// Shared Materials (module-level singletons — NOT recreated per mount)
// ══════════════════════════════════════════════════════════════

const M = {
  darkMetal: new THREE.MeshStandardMaterial({ color: '#1a1e28', roughness: 0.2, metalness: 0.9 }),
  midMetal: new THREE.MeshStandardMaterial({ color: '#2a303e', roughness: 0.25, metalness: 0.85 }),
  lightMetal: new THREE.MeshStandardMaterial({ color: '#3a424e', roughness: 0.3, metalness: 0.8 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#0c0c0c', roughness: 0.8, metalness: 0.1 }),
  warn: new THREE.MeshStandardMaterial({ color: '#ccaa00', roughness: 0.5, metalness: 0.3 }),

  // Panel (energy)
  solarCell: new THREE.MeshStandardMaterial({ color: '#0a1a2f', roughness: 0.08, metalness: 0.95 }),
  solarFrame: new THREE.MeshStandardMaterial({ color: '#1a2838', roughness: 0.2, metalness: 0.85 }),
  battery: new THREE.MeshStandardMaterial({ color: '#2a3848', roughness: 0.25, metalness: 0.8 }),
  inverter: new THREE.MeshStandardMaterial({ color: '#1a2030', roughness: 0.15, metalness: 0.7 }),

  // Scanner (bio lab)
  glass: new THREE.MeshStandardMaterial({ color: '#2a5060', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35 }),
  specimen: new THREE.MeshStandardMaterial({ color: '#33aa77', roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.6 }),
  biohazard: new THREE.MeshStandardMaterial({ color: '#aa8800', roughness: 0.5, metalness: 0.3 }),
  sterile: new THREE.MeshStandardMaterial({ color: '#d0d8e0', roughness: 0.15, metalness: 0.5 }),

  // Container (cargo)
  crate: new THREE.MeshStandardMaterial({ color: '#3a3020', roughness: 0.7, metalness: 0.2 }),
  crateDark: new THREE.MeshStandardMaterial({ color: '#282018', roughness: 0.7, metalness: 0.2 }),
  strap: new THREE.MeshStandardMaterial({ color: '#555544', roughness: 0.4, metalness: 0.6 }),

  // Turret (weapons)
  armor: new THREE.MeshStandardMaterial({ color: '#2a2a3a', roughness: 0.15, metalness: 0.95 }),
  ammo: new THREE.MeshStandardMaterial({ color: '#aa5500', roughness: 0.4, metalness: 0.6 }),
  danger: new THREE.MeshStandardMaterial({ color: '#cc2200', roughness: 0.5, metalness: 0.3 }),

  // Pedestal (comms)
  dish: new THREE.MeshStandardMaterial({ color: '#c0c8d0', roughness: 0.1, metalness: 0.9 }),

  // Engine (machinery)
  piston: new THREE.MeshStandardMaterial({ color: '#445566', roughness: 0.2, metalness: 0.9 }),
  coolant: new THREE.MeshStandardMaterial({ color: '#226688', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.7 }),
  oilDrum: new THREE.MeshStandardMaterial({ color: '#334422', roughness: 0.5, metalness: 0.4 }),

  // Terminal (data center)
  server: new THREE.MeshStandardMaterial({ color: '#1a1a28', roughness: 0.2, metalness: 0.8 }),
  serverFront: new THREE.MeshStandardMaterial({ color: '#222233', roughness: 0.15, metalness: 0.7 }),

  // Emissive (shared across many environments)
  ledGreen: new THREE.MeshStandardMaterial({ color: '#00ff44', emissive: new THREE.Color('#00ff44'), emissiveIntensity: 0.8, toneMapped: false }),
  ledOrange: new THREE.MeshStandardMaterial({ color: '#ff6600', emissive: new THREE.Color('#ff6600'), emissiveIntensity: 0.8, toneMapped: false }),
  screenBlue: new THREE.MeshStandardMaterial({ color: '#001133', emissive: new THREE.Color('#2266ff'), emissiveIntensity: 0.6, toneMapped: false }),
  screenCyan: new THREE.MeshStandardMaterial({ color: '#0a0a14', emissive: new THREE.Color('#00ccff'), emissiveIntensity: 0.4, toneMapped: false }),
  screenRed: new THREE.MeshStandardMaterial({ color: '#0a0a0a', emissive: new THREE.Color('#ff2200'), emissiveIntensity: 0.3, toneMapped: false }),
  screenGreen: new THREE.MeshStandardMaterial({ color: '#002211', emissive: new THREE.Color('#00aa66'), emissiveIntensity: 0.5, toneMapped: false }),
  uvPurple: new THREE.MeshStandardMaterial({ color: '#7744ff', emissive: new THREE.Color('#7744ff'), emissiveIntensity: 0.5, toneMapped: false }),
  sirenRed: new THREE.MeshStandardMaterial({ color: '#ff4400', emissive: new THREE.Color('#ff4400'), emissiveIntensity: 0.6, toneMapped: false }),
  floorYellow: new THREE.MeshStandardMaterial({ color: '#aaaa33', roughness: 0.9, metalness: 0.1 }),
  gaugeWhite: new THREE.MeshStandardMaterial({ color: '#eeeedd', roughness: 0.1, metalness: 0.3 }),
};

// ══════════════════════════════════════════════════════════════
// Shared Geometries (reuse across all instances)
// ══════════════════════════════════════════════════════════════

const G = {
  // Common boxes
  smallBox: new THREE.BoxGeometry(0.4, 0.4, 0.3),
  medBox: new THREE.BoxGeometry(0.6, 0.8, 0.4),
  thinPost: new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6),
  tallPost: new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6),
  ledDot: new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8),
  smallScreen: new THREE.BoxGeometry(0.3, 0.2, 0.02),
};

// ══════════════════════════════════════════════════════════════
// Deterministic hash (stable randomization from task.id)
// ══════════════════════════════════════════════════════════════

function hashId(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ══════════════════════════════════════════════════════════════
// Panel Environment (Energy rooms) — ~12 meshes
// ══════════════════════════════════════════════════════════════

const PanelEnvironment = memo(function PanelEnvironment({ task }: { task: TaskStationInfo }) {
  const [tx, , tz] = task.position;
  const seed = useMemo(() => hashId(task.id), [task.id]);
  const rot = ((seed % 4) * Math.PI) / 2;

  return (
    <group position={[tx, 0, tz]} rotation={[0, rot, 0]}>
      {/* Solar Panel 1 */}
      <mesh position={[-1.8, 1.0, -2.2]} rotation={[-0.44, 0, 0]} material={M.solarFrame}>
        <boxGeometry args={[1.4, 0.04, 0.9]} />
      </mesh>
      <mesh position={[-1.8, 1.02, -2.2]} rotation={[-0.44, 0, 0]} material={M.solarCell}>
        <boxGeometry args={[1.3, 0.01, 0.8]} />
      </mesh>
      {/* Panel 1 legs */}
      <mesh position={[-2.3, 0.45, -2.05]} material={M.lightMetal}>
        <boxGeometry args={[0.04, 0.9, 0.04]} />
      </mesh>
      <mesh position={[-1.3, 0.45, -2.05]} material={M.lightMetal}>
        <boxGeometry args={[0.04, 0.9, 0.04]} />
      </mesh>

      {/* Solar Panel 2 */}
      <mesh position={[0.5, 0.9, -2.4]} rotation={[-0.44, 0.1, 0]} material={M.solarFrame}>
        <boxGeometry args={[1.2, 0.04, 0.8]} />
      </mesh>

      {/* Battery Rack */}
      <mesh position={[-2.0, 0.4, 0.5]} material={M.darkMetal}>
        <boxGeometry args={[0.7, 0.8, 0.4]} />
      </mesh>
      <mesh position={[-2.0, 0.84, 0.5]} material={M.ledGreen}>
        <cylinderGeometry args={[0.04, 0.04, 0.03, 8]} />
      </mesh>

      {/* Power Inverter */}
      <mesh position={[2.0, 0.35, 0.2]} material={M.inverter}>
        <boxGeometry args={[0.5, 0.7, 0.35]} />
      </mesh>
      <mesh position={[2.0, 0.55, 0.38]} material={M.screenBlue}>
        <boxGeometry args={[0.2, 0.1, 0.01]} />
      </mesh>

      {/* Monitoring Console */}
      <mesh position={[0.8, 0.45, 1.5]} material={M.midMetal}>
        <boxGeometry args={[0.7, 0.04, 0.4]} />
      </mesh>
      <mesh position={[0.8, 0.65, 1.4]} rotation={[-0.2, 0, 0]} material={M.screenBlue}>
        <boxGeometry args={[0.5, 0.35, 0.03]} />
      </mesh>

      {/* Cable conduit */}
      <mesh position={[-1.0, 0.02, 0.4]} rotation={[0, 0.3, Math.PI / 2]} material={M.rubber}>
        <cylinderGeometry args={[0.025, 0.025, 1.8, 6]} />
      </mesh>

      {/* Junction Box */}
      <mesh position={[-2.5, 0.9, 1.5]} material={M.midMetal}>
        <boxGeometry args={[0.35, 0.45, 0.15]} />
      </mesh>
    </group>
  );
});

// ══════════════════════════════════════════════════════════════
// Scanner Environment (Bio Lab rooms) — ~10 meshes
// ══════════════════════════════════════════════════════════════

const ScannerEnvironment = memo(function ScannerEnvironment({ task }: { task: TaskStationInfo }) {
  const [tx, , tz] = task.position;
  const seed = useMemo(() => hashId(task.id), [task.id]);
  const rot = ((seed % 4) * Math.PI) / 2;

  return (
    <group position={[tx, 0, tz]} rotation={[0, rot, 0]}>
      {/* Specimen cylinder 1 */}
      <mesh position={[-1.8, 0.5, -1.5]} material={M.glass}>
        <cylinderGeometry args={[0.1, 0.1, 1.0, 10]} />
      </mesh>
      <mesh position={[-1.8, 0.5, -1.5]} material={M.specimen}>
        <cylinderGeometry args={[0.06, 0.06, 0.7, 8]} />
      </mesh>
      {/* Specimen cylinder 2 */}
      <mesh position={[-2.1, 0.5, -1.2]} material={M.glass}>
        <cylinderGeometry args={[0.1, 0.1, 1.0, 10]} />
      </mesh>

      {/* Biohazard container */}
      <mesh position={[1.8, 0.3, -1.5]} material={M.biohazard}>
        <boxGeometry args={[0.5, 0.6, 0.4]} />
      </mesh>

      {/* Microscope station (desk + arm) */}
      <mesh position={[0.5, 0.5, 1.8]} material={M.sterile}>
        <boxGeometry args={[0.6, 0.04, 0.4]} />
      </mesh>
      <mesh position={[0.35, 0.7, 1.8]} material={M.darkMetal}>
        <boxGeometry args={[0.06, 0.4, 0.06]} />
      </mesh>

      {/* Sample refrigerator */}
      <mesh position={[-0.8, 0.5, 1.8]} material={M.sterile}>
        <boxGeometry args={[0.5, 1.0, 0.4]} />
      </mesh>
      <mesh position={[-0.8, 0.85, 2.01]} material={M.screenGreen}>
        <boxGeometry args={[0.15, 0.06, 0.01]} />
      </mesh>

      {/* Decon shower post */}
      <mesh position={[2.0, 1.0, 0.6]} material={M.lightMetal}>
        <cylinderGeometry args={[0.025, 0.025, 2.0, 6]} />
      </mesh>

      {/* UV sterilization bar */}
      <mesh position={[-2.2, 1.85, 0.5]} material={M.uvPurple}>
        <boxGeometry args={[0.5, 0.06, 0.06]} />
      </mesh>
    </group>
  );
});

// ══════════════════════════════════════════════════════════════
// Container Environment (Cargo rooms) — ~9 meshes
// ══════════════════════════════════════════════════════════════

const ContainerEnvironment = memo(function ContainerEnvironment({ task }: { task: TaskStationInfo }) {
  const [tx, , tz] = task.position;
  const seed = useMemo(() => hashId(task.id), [task.id]);
  const rot = ((seed % 4) * Math.PI) / 2;

  return (
    <group position={[tx, 0, tz]} rotation={[0, rot, 0]}>
      {/* Large crate stack */}
      <mesh position={[-1.8, 0.25, -1.8]} material={M.crate}>
        <boxGeometry args={[0.8, 0.5, 0.6]} />
      </mesh>
      <mesh position={[-1.7, 0.65, -1.75]} material={M.crateDark}>
        <boxGeometry args={[0.7, 0.3, 0.5]} />
      </mesh>

      {/* Small crates */}
      <mesh position={[1.5, 0.15, -2.0]} material={M.crate}>
        <boxGeometry args={[0.4, 0.3, 0.35]} />
      </mesh>
      <mesh position={[1.9, 0.12, -1.6]} rotation={[0, 0.5, 0]} material={M.crateDark}>
        <boxGeometry args={[0.35, 0.25, 0.3]} />
      </mesh>

      {/* Hand cart platform */}
      <mesh position={[2.0, 0.12, 0.5]} rotation={[0, -0.3, 0]} material={M.midMetal}>
        <boxGeometry args={[0.5, 0.04, 0.8]} />
      </mesh>

      {/* Inventory terminal */}
      <mesh position={[-0.5, 0.6, 1.8]} material={M.lightMetal}>
        <cylinderGeometry args={[0.04, 0.04, 1.2, 6]} />
      </mesh>
      <mesh position={[-0.5, 1.1, 1.85]} rotation={[-0.15, 0, 0]} material={M.screenCyan}>
        <boxGeometry args={[0.3, 0.22, 0.03]} />
      </mesh>

      {/* Hazmat locker */}
      <mesh position={[-2.0, 0.6, 0.8]} material={M.midMetal}>
        <boxGeometry args={[0.45, 1.2, 0.35]} />
      </mesh>

      {/* Floor marking */}
      <mesh position={[0, 0.005, 0]} material={M.floorYellow}>
        <boxGeometry args={[4.0, 0.005, 0.06]} />
      </mesh>
    </group>
  );
});

// ══════════════════════════════════════════════════════════════
// Turret Environment (Weapons Bay rooms) — ~9 meshes
// ══════════════════════════════════════════════════════════════

const TurretEnvironment = memo(function TurretEnvironment({ task }: { task: TaskStationInfo }) {
  const [tx, , tz] = task.position;
  const seed = useMemo(() => hashId(task.id), [task.id]);
  const rot = ((seed % 4) * Math.PI) / 2;

  return (
    <group position={[tx, 0, tz]} rotation={[0, rot, 0]}>
      {/* Ammo rack */}
      <mesh position={[-2.0, 0.5, -1.5]} material={M.armor}>
        <boxGeometry args={[0.9, 1.0, 0.35]} />
      </mesh>
      <mesh position={[-2.0, 0.4, -1.31]} material={M.ammo}>
        <boxGeometry args={[0.35, 0.5, 0.06]} />
      </mesh>

      {/* Targeting console desk */}
      <mesh position={[1.5, 0.5, -2.0]} material={M.armor}>
        <boxGeometry args={[0.7, 0.04, 0.5]} />
      </mesh>
      <mesh position={[1.5, 0.72, -2.15]} rotation={[-0.3, 0, 0]} material={M.screenRed}>
        <boxGeometry args={[0.5, 0.35, 0.03]} />
      </mesh>

      {/* Tool cart */}
      <mesh position={[2.0, 0.35, 0.8]} material={M.danger}>
        <boxGeometry args={[0.5, 0.5, 0.35]} />
      </mesh>

      {/* Armor plating (leaning) */}
      <mesh position={[-2.3, 0.5, 0.5]} rotation={[0, 0, 0.12]} material={M.armor}>
        <boxGeometry args={[0.08, 1.0, 0.7]} />
      </mesh>

      {/* Warning siren */}
      <mesh position={[-1.5, 0.8, 1.8]} material={M.lightMetal}>
        <cylinderGeometry args={[0.04, 0.04, 0.8, 6]} />
      </mesh>
      <mesh position={[-1.5, 1.25, 1.8]} material={M.sirenRed}>
        <coneGeometry args={[0.08, 0.12, 6]} />
      </mesh>

      {/* Charging station */}
      <mesh position={[0, 0.4, 2.0]} material={M.armor}>
        <boxGeometry args={[0.6, 0.8, 0.3]} />
      </mesh>
    </group>
  );
});

// ══════════════════════════════════════════════════════════════
// Pedestal Environment (Communications rooms) — ~10 meshes
// ══════════════════════════════════════════════════════════════

const PedestalEnvironment = memo(function PedestalEnvironment({ task }: { task: TaskStationInfo }) {
  const [tx, , tz] = task.position;
  const seed = useMemo(() => hashId(task.id), [task.id]);
  const rot = ((seed % 4) * Math.PI) / 2;

  return (
    <group position={[tx, 0, tz]} rotation={[0, rot, 0]}>
      {/* Antenna tower */}
      <mesh position={[-2.0, 0.9, -1.8]} material={M.lightMetal}>
        <cylinderGeometry args={[0.04, 0.06, 1.8, 6]} />
      </mesh>
      <mesh position={[-2.0, 1.6, -1.8]} material={M.lightMetal}>
        <boxGeometry args={[0.6, 0.03, 0.03]} />
      </mesh>
      <mesh position={[-2.0, 1.85, -1.8]} material={M.ledOrange}>
        <sphereGeometry args={[0.05, 8, 8]} />
      </mesh>

      {/* Signal amplifier */}
      <mesh position={[1.8, 0.2, -1.5]} material={M.midMetal}>
        <boxGeometry args={[0.4, 0.4, 0.3]} />
      </mesh>

      {/* Cable spool */}
      <mesh position={[2.0, 0.2, 0.8]} rotation={[Math.PI / 2, 0, 0]} material={M.darkMetal}>
        <cylinderGeometry args={[0.25, 0.25, 0.15, 10]} />
      </mesh>

      {/* Satellite dish */}
      <mesh position={[-2.2, 1.2, 0.5]} rotation={[0, 0, -0.3]} material={M.dish}>
        <cylinderGeometry args={[0.01, 0.4, 0.12, 12]} />
      </mesh>
      <mesh position={[-2.1, 0.9, 0.5]} material={M.lightMetal}>
        <boxGeometry args={[0.04, 0.6, 0.04]} />
      </mesh>

      {/* Frequency analyzer */}
      <mesh position={[0.5, 0.5, 1.8]} material={M.midMetal}>
        <boxGeometry args={[0.5, 0.04, 0.35]} />
      </mesh>
      <mesh position={[0.5, 0.7, 1.72]} rotation={[-0.2, 0, 0]} material={M.screenCyan}>
        <boxGeometry args={[0.35, 0.25, 0.03]} />
      </mesh>

      {/* Backup power cell */}
      <mesh position={[-0.8, 0.15, 1.5]} material={M.battery}>
        <boxGeometry args={[0.3, 0.3, 0.2]} />
      </mesh>
    </group>
  );
});

// ══════════════════════════════════════════════════════════════
// Engine Environment (Machinery rooms) — ~10 meshes
// ══════════════════════════════════════════════════════════════

const EngineEnvironment = memo(function EngineEnvironment({ task }: { task: TaskStationInfo }) {
  const [tx, , tz] = task.position;
  const seed = useMemo(() => hashId(task.id), [task.id]);
  const rot = ((seed % 4) * Math.PI) / 2;

  return (
    <group position={[tx, 0, tz]} rotation={[0, rot, 0]}>
      {/* Coolant tank */}
      <mesh position={[-2.0, 0.55, -1.2]} material={M.coolant}>
        <cylinderGeometry args={[0.3, 0.3, 1.1, 10]} />
      </mesh>
      <mesh position={[-1.68, 0.6, -1.2]} rotation={[0, 0, Math.PI / 2]} material={M.danger}>
        <cylinderGeometry args={[0.06, 0.06, 0.08, 8]} />
      </mesh>

      {/* Oil drums */}
      <mesh position={[1.8, 0.35, -1.8]} material={M.oilDrum}>
        <cylinderGeometry args={[0.2, 0.2, 0.7, 8]} />
      </mesh>
      <mesh position={[2.2, 0.35, -1.5]} material={M.oilDrum}>
        <cylinderGeometry args={[0.2, 0.2, 0.7, 8]} />
      </mesh>

      {/* Pressure gauge cluster */}
      <mesh position={[-1.5, 0.8, 1.5]} material={M.darkMetal}>
        <boxGeometry args={[0.5, 0.5, 0.08]} />
      </mesh>
      <mesh position={[-1.5, 0.4, 1.5]} material={M.lightMetal}>
        <cylinderGeometry args={[0.03, 0.03, 0.8, 6]} />
      </mesh>

      {/* Tool rack */}
      <mesh position={[2.0, 0.85, 0.5]} material={M.darkMetal}>
        <boxGeometry args={[0.6, 0.25, 0.04]} />
      </mesh>
      <mesh position={[2.0, 0.7, 0.5]} material={M.midMetal}>
        <boxGeometry args={[0.6, 0.04, 0.15]} />
      </mesh>

      {/* Cooling fan housing */}
      <mesh position={[0, 0.6, -2.2]} material={M.darkMetal}>
        <boxGeometry args={[0.5, 0.5, 0.1]} />
      </mesh>

      {/* Exhaust pipe */}
      <mesh position={[-0.5, 0.4, -2.0]} rotation={[0.2, 0, 0]} material={M.piston}>
        <cylinderGeometry args={[0.08, 0.08, 0.8, 8]} />
      </mesh>
    </group>
  );
});

// ══════════════════════════════════════════════════════════════
// Terminal Environment (Data Center rooms) — ~9 meshes
// ══════════════════════════════════════════════════════════════

const TerminalEnvironment = memo(function TerminalEnvironment({ task }: { task: TaskStationInfo }) {
  const [tx, , tz] = task.position;
  const seed = useMemo(() => hashId(task.id), [task.id]);
  const rot = ((seed % 4) * Math.PI) / 2;

  return (
    <group position={[tx, 0, tz]} rotation={[0, rot, 0]}>
      {/* Server rack tower */}
      <mesh position={[-2.0, 0.9, -1.5]} material={M.server}>
        <boxGeometry args={[0.5, 1.8, 0.4]} />
      </mesh>
      <mesh position={[-2.0, 0.9, -1.29]} material={M.serverFront}>
        <boxGeometry args={[0.44, 1.6, 0.01]} />
      </mesh>

      {/* Second rack (smaller) */}
      <mesh position={[-1.4, 0.7, -1.5]} material={M.server}>
        <boxGeometry args={[0.4, 1.4, 0.35]} />
      </mesh>

      {/* Network switch */}
      <mesh position={[1.8, 0.25, -1.8]} material={M.midMetal}>
        <boxGeometry args={[0.5, 0.15, 0.3]} />
      </mesh>

      {/* Cable tray (overhead) */}
      <mesh position={[0, 2.2, -0.5]} material={M.lightMetal}>
        <boxGeometry args={[3.0, 0.04, 0.25]} />
      </mesh>

      {/* Cooling unit */}
      <mesh position={[2.0, 0.35, 0.5]} material={M.midMetal}>
        <boxGeometry args={[0.5, 0.7, 0.4]} />
      </mesh>

      {/* Activity LED */}
      <mesh position={[-2.0, 1.82, -1.3]} material={M.ledOrange}>
        <boxGeometry args={[0.03, 0.03, 0.01]} />
      </mesh>

      {/* Fire suppression canister */}
      <mesh position={[-0.5, 0.3, 1.8]} material={M.danger}>
        <cylinderGeometry args={[0.08, 0.08, 0.6, 8]} />
      </mesh>

      {/* Cable on tray */}
      <mesh position={[0, 2.22, -0.5]} rotation={[0, 0, Math.PI / 2]} material={M.rubber}>
        <cylinderGeometry args={[0.03, 0.03, 2.8, 6]} />
      </mesh>
    </group>
  );
});

// ══════════════════════════════════════════════════════════════
// Environment Dispatcher
// ══════════════════════════════════════════════════════════════

const ENV_COMPONENTS: Record<TaskVisualCategory, React.ComponentType<{ task: TaskStationInfo }>> = {
  panel: PanelEnvironment,
  scanner: ScannerEnvironment,
  container: ContainerEnvironment,
  turret: TurretEnvironment,
  pedestal: PedestalEnvironment,
  engine: EngineEnvironment,
  terminal: TerminalEnvironment,
};

// ══════════════════════════════════════════════════════════════
// Distance-based culling (throttled — check every 10 frames)
// ══════════════════════════════════════════════════════════════

const ENV_RANGE_SQ = 35 * 35;
const CULL_INTERVAL = 10; // check every 10 frames instead of every frame

function NearbyEnvironments({ tasks }: { tasks: TaskStationInfo[] }) {
  const [nearbyIds, setNearbyIds] = useState<Set<string>>(new Set());
  const prevIdsRef = useRef('');
  const frameCountRef = useRef(0);

  useFrame(() => {
    // Throttle: only check distance every CULL_INTERVAL frames
    if (++frameCountRef.current % CULL_INTERVAL !== 0) return;

    const [px, , pz] = useGameStore.getState().localPosition;
    const ids: string[] = [];
    for (const task of tasks) {
      const dx = task.position[0] - px;
      const dz = task.position[2] - pz;
      if (dx * dx + dz * dz < ENV_RANGE_SQ) {
        ids.push(task.id);
      }
    }
    const key = ids.join(',');
    if (key !== prevIdsRef.current) {
      prevIdsRef.current = key;
      setNearbyIds(new Set(ids));
    }
  });

  // Only iterate over tasks that passed culling — build filtered array
  const visibleTasks = useMemo(() => {
    if (nearbyIds.size === 0) return [];
    return tasks.filter((t) => nearbyIds.has(t.id));
  }, [tasks, nearbyIds]);

  return (
    <>
      {visibleTasks.map((task) => {
        const meta = TASK_REGISTRY[task.taskType];
        const category = meta?.visualCategory ?? 'terminal';
        const Comp = ENV_COMPONENTS[category];
        return <Comp key={task.id} task={task} />;
      })}
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// Main Export
// ══════════════════════════════════════════════════════════════

export function RoomEnvironments() {
  const mazeLayout = useGameStore((s) => s.mazeLayout);

  const tasks = useMemo(() => {
    if (!mazeLayout?.tasks?.length) return null;
    return mazeLayout.tasks;
  }, [mazeLayout]);

  if (!tasks) return null;

  return (
    <group>
      <NearbyEnvironments tasks={tasks} />
    </group>
  );
}
