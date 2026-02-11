import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../stores/game-store.js';
import { mouseState } from '../networking/mouse-state.js';
import * as THREE from 'three';
import { DEFAULT_GAME_SETTINGS } from '@shadow/shared';

export function LocalPlayer({ color }: { color: string }) {
  const groupRef = useRef<THREE.Group>(null!);
  const spotRef = useRef<THREE.SpotLight>(null!);
  const targetObj = useRef(new THREE.Object3D());

  useFrame(() => {
    const { localPosition, localRotation } = useGameStore.getState();
    const [px, py, pz] = localPosition;
    const [rx, ry, rz, rw] = localRotation;

    const targetPos = new THREE.Vector3(px, py, pz);
    const targetQuat = new THREE.Quaternion(rx, ry, rz, rw);

    groupRef.current.position.lerp(targetPos, 0.3);
    groupRef.current.quaternion.slerp(targetQuat, 0.3);

    // Point flashlight in look direction using Euler (same as camera)
    if (spotRef.current) {
      const yaw = mouseState.yaw;
      const pitch = mouseState.pitch;
      // Forward direction = (sin(yaw), 0, -cos(yaw)) with pitch applied
      const fx = Math.sin(yaw) * Math.cos(pitch);
      const fy = -Math.sin(pitch);
      const fz = -Math.cos(yaw) * Math.cos(pitch);
      const forward = new THREE.Vector3(fx, fy, fz).multiplyScalar(3);
      forward.add(new THREE.Vector3(px, py + 1, pz));
      targetObj.current.position.copy(forward);
      spotRef.current.target = targetObj.current;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Capsule body — hidden in FPS view */}
      <mesh position={[0, 0.6, 0]} castShadow visible={false}>
        <capsuleGeometry args={[0.3, 0.6, 8, 16]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
      </mesh>

      {/* Flashlight */}
      <spotLight
        ref={spotRef}
        position={[0, 1, -0.3]}
        angle={Math.PI / 5}
        penumbra={0.4}
        intensity={30}
        distance={DEFAULT_GAME_SETTINGS.flashlightRange}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        color="#ffe4b5"
      />
      <primitive object={targetObj.current} />
    </group>
  );
}
