import { useMemo, useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DecoObjectInfo, DecoType } from '@shadow/shared';
import { useGameStore } from '../stores/game-store.js';

// ── Color palette for ActionFigure randomization ──

const BRIGHT_COLORS = ['#ff4444', '#44ff44', '#4444ff', '#ffaa00', '#ff44ff'];

function pickColor(id: string): string {
  // Deterministic color from id so it's stable across renders
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return BRIGHT_COLORS[Math.abs(hash) % BRIGHT_COLORS.length];
}

// ── ActionFigure (boneco_desmontavel) ──

function ActionFigure({ deco }: { deco: DecoObjectInfo }) {
  const [x, , z] = deco.position;
  const color = useMemo(() => pickColor(deco.id), [deco.id]);
  return (
    <group position={[x, 0, z]} rotation={[0, deco.rotationY, 0]} scale={deco.scale}>
      {/* Capsule body */}
      <mesh position={[0, 0.075, 0]}>
        <capsuleGeometry args={[0.06, 0.15, 4, 8]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Sphere head */}
      <mesh position={[0, 0.27, 0]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

// ── PopItToy (pop_it) ──

function PopItToy({ deco }: { deco: DecoObjectInfo }) {
  const [x, , z] = deco.position;
  return (
    <group position={[x, 0, z]} rotation={[0, deco.rotationY, 0]} scale={deco.scale}>
      {/* Flat rounded base */}
      <mesh position={[0, 0.015, 0]}>
        <boxGeometry args={[0.2, 0.03, 0.15]} />
        <meshStandardMaterial color="#ff66aa" roughness={0.6} metalness={0.2} />
      </mesh>
      {/* Hemisphere bumps (4 small spheres half-embedded) */}
      <mesh position={[-0.04, 0.035, -0.03]}>
        <sphereGeometry args={[0.02, 6, 6]} />
        <meshStandardMaterial color="#ff66aa" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0.04, 0.035, -0.03]}>
        <sphereGeometry args={[0.02, 6, 6]} />
        <meshStandardMaterial color="#ff66aa" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[-0.04, 0.035, 0.03]}>
        <sphereGeometry args={[0.02, 6, 6]} />
        <meshStandardMaterial color="#ff66aa" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0.04, 0.035, 0.03]}>
        <sphereGeometry args={[0.02, 6, 6]} />
        <meshStandardMaterial color="#ff66aa" roughness={0.6} metalness={0.2} />
      </mesh>
    </group>
  );
}

// ── PlushToy (pelucia) ──

function PlushToy({ deco }: { deco: DecoObjectInfo }) {
  const [x, , z] = deco.position;
  return (
    <group position={[x, 0, z]} rotation={[0, deco.rotationY, 0]} scale={deco.scale}>
      {/* Body sphere */}
      <mesh position={[0, 0.1, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#aa8866" roughness={0.8} metalness={0.1} />
      </mesh>
      {/* Left ear */}
      <mesh position={[-0.07, 0.22, 0]}>
        <sphereGeometry args={[0.04, 6, 6]} />
        <meshStandardMaterial color="#aa8866" roughness={0.8} metalness={0.1} />
      </mesh>
      {/* Right ear */}
      <mesh position={[0.07, 0.22, 0]}>
        <sphereGeometry args={[0.04, 6, 6]} />
        <meshStandardMaterial color="#aa8866" roughness={0.8} metalness={0.1} />
      </mesh>
    </group>
  );
}

// ── BuildingBlocks (blocos_montar) ──

function BuildingBlocks({ deco }: { deco: DecoObjectInfo }) {
  const [x, , z] = deco.position;
  return (
    <group position={[x, 0, z]} rotation={[0, deco.rotationY, 0]} scale={deco.scale}>
      {/* Block 1 (bottom) */}
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[0.1, 0.08, 0.1]} />
        <meshStandardMaterial color="#ff4444" roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Block 2 (middle, slight offset) */}
      <mesh position={[0.02, 0.12, 0.01]} rotation={[0, 0.3, 0]}>
        <boxGeometry args={[0.1, 0.08, 0.1]} />
        <meshStandardMaterial color="#44aaff" roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Block 3 (top, slight angle) */}
      <mesh position={[-0.01, 0.2, -0.01]} rotation={[0, -0.5, 0]}>
        <boxGeometry args={[0.1, 0.08, 0.1]} />
        <meshStandardMaterial color="#ffdd44" roughness={0.5} metalness={0.2} />
      </mesh>
    </group>
  );
}

// ── Dispatcher ──

function DecoVisual({ deco }: { deco: DecoObjectInfo }) {
  switch (deco.decoType) {
    case 'boneco_desmontavel':
      return <ActionFigure deco={deco} />;
    case 'pop_it':
      return <PopItToy deco={deco} />;
    case 'pelucia':
      return <PlushToy deco={deco} />;
    case 'blocos_montar':
      return <BuildingBlocks deco={deco} />;
    default:
      return null;
  }
}

// ── Distance-based culling — only render decorations within range ──

const DECO_VISUAL_RANGE_SQ = 30 * 30; // render decorations within 30 units

// ── Main export ──

export function DecoObjects() {
  const mazeLayout = useGameStore((s) => s.mazeLayout);
  const [nearbyIds, setNearbyIds] = useState<Set<string>>(new Set());
  const prevIdsRef = useRef('');

  const decorations = useMemo(() => {
    if (!mazeLayout || !mazeLayout.decorations || mazeLayout.decorations.length === 0) return null;
    return mazeLayout.decorations;
  }, [mazeLayout]);

  useFrame(() => {
    if (!decorations) return;
    const [px, , pz] = useGameStore.getState().localPosition;
    const ids: string[] = [];
    for (const deco of decorations) {
      const dx = deco.position[0] - px;
      const dz = deco.position[2] - pz;
      if (dx * dx + dz * dz < DECO_VISUAL_RANGE_SQ) {
        ids.push(deco.id);
      }
    }
    const key = ids.join(',');
    if (key !== prevIdsRef.current) {
      prevIdsRef.current = key;
      setNearbyIds(new Set(ids));
    }
  });

  if (!decorations) return null;

  return (
    <group>
      {decorations.map((deco) =>
        nearbyIds.has(deco.id) ? <DecoVisual key={deco.id} deco={deco} /> : null,
      )}
    </group>
  );
}
