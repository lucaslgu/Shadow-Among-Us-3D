import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../stores/game-store.js';
import { interpolatePlayer, getInterpolationRenderTime } from '../networking/interpolation.js';
import * as THREE from 'three';
import { AstronautModel, type AstronautAnimData } from './AstronautModel.js';

// Reusable objects to avoid per-frame allocations
const _tmpVec3 = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();

const WALK_SPEED_THRESHOLD = 0.3;

interface RemotePlayerProps {
  playerId: string;
  color: string; // initial color — overridden by snapshot in useFrame
}

const SPOTLIGHT_RANGE_SQ = 30 * 30;

export function RemotePlayer({ playerId, color }: RemotePlayerProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const spotRef = useRef<THREE.SpotLight>(null!);
  const prevPos = useRef<[number, number, number]>([0, 0, 0]);
  const smoothSpeed = useRef(0);

  // Mutable data object — mutated in useFrame, read by AstronautModel's useFrame
  const animData = useRef<AstronautAnimData>({
    animState: 'idle',
    speed: 0,
    color,
    opacity: 1,
    visible: true,
  }).current;

  useFrame((_, delta) => {
    const { snapshotBuffer, players, isGhost: localIsGhost } = useGameStore.getState();
    const renderTime = getInterpolationRenderTime();

    const interp = interpolatePlayer(playerId, snapshotBuffer, renderTime);

    if (interp) {
      const [px, py, pz] = interp.position;
      const [rx, ry, rz, rw] = interp.rotation;
      _tmpVec3.set(px, py, pz);
      _tmpQuat.set(rx, ry, rz, rw);
      groupRef.current.position.lerp(_tmpVec3, 0.5);
      groupRef.current.quaternion.slerp(_tmpQuat, 0.5);

      // Compute movement speed from position delta
      const dx = px - prevPos.current[0];
      const dz = pz - prevPos.current[2];
      const rawSpeed = delta > 0 ? Math.sqrt(dx * dx + dz * dz) / delta : 0;
      smoothSpeed.current += (rawSpeed - smoothSpeed.current) * 0.3; // smooth
      prevPos.current = [px, py, pz];

      // Determine visibility
      if (interp.isGhost) {
        groupRef.current.visible = localIsGhost;
      } else {
        groupRef.current.visible = !interp.isInvisible && interp.isAlive;
      }

      // Determine animation state
      if (interp.isGhost) {
        animData.animState = 'ghost';
        animData.opacity = 0.3;
        animData.color = '#4488ff';
        animData.visible = groupRef.current.visible;
      } else if (!interp.isAlive) {
        animData.animState = 'death';
        animData.visible = groupRef.current.visible;
      } else {
        animData.animState = smoothSpeed.current > WALK_SPEED_THRESHOLD ? 'walk' : 'idle';
        animData.speed = smoothSpeed.current;
        animData.opacity = interp.isImpermeable ? 0.4 : 1;
        animData.visible = groupRef.current.visible;

        // Update color from latest snapshot (for Metamorph etc.)
        const snap = players[playerId];
        animData.color = snap?.color ?? color;
      }
    }

    // Distance-based spotlight culling
    if (spotRef.current) {
      const [lpx, , lpz] = useGameStore.getState().localPosition;
      const dx = groupRef.current.position.x - lpx;
      const dz = groupRef.current.position.z - lpz;
      spotRef.current.visible = (dx * dx + dz * dz) < SPOTLIGHT_RANGE_SQ;
    }
  });

  return (
    <group ref={groupRef}>
      <AstronautModel data={animData} />

      {/* Flashlight (no shadows for performance) */}
      <spotLight
        ref={spotRef}
        position={[0, 1, -0.3]}
        angle={Math.PI / 4}
        penumbra={0.5}
        intensity={80}
        distance={50}
        castShadow={false}
        color="#ffe4b5"
      />
    </group>
  );
}
