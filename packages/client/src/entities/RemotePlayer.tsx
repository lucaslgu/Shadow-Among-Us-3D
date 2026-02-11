import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../stores/game-store.js';
import { interpolatePlayer, getInterpolationRenderTime } from '../networking/interpolation.js';
import * as THREE from 'three';

interface RemotePlayerProps {
  playerId: string;
  name: string;
  color: string;
}

export function RemotePlayer({ playerId, color }: RemotePlayerProps) {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(() => {
    const { snapshotBuffer } = useGameStore.getState();
    const renderTime = getInterpolationRenderTime();

    const interp = interpolatePlayer(playerId, snapshotBuffer, renderTime);

    if (interp) {
      const [px, py, pz] = interp.position;
      const [rx, ry, rz, rw] = interp.rotation;
      groupRef.current.position.lerp(new THREE.Vector3(px, py, pz), 0.5);
      groupRef.current.quaternion.slerp(new THREE.Quaternion(rx, ry, rz, rw), 0.5);
      groupRef.current.visible = !interp.isInvisible && interp.isAlive;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Capsule body */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <capsuleGeometry args={[0.3, 0.6, 8, 16]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
      </mesh>

      {/* Flashlight (no shadows for performance) */}
      <spotLight
        position={[0, 1, -0.3]}
        angle={Math.PI / 5}
        penumbra={0.4}
        intensity={22}
        distance={12}
        castShadow={false}
        color="#ffe4b5"
      />

    </group>
  );
}
