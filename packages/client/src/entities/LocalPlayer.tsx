import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../stores/game-store.js';
import { mouseState, inputState } from '../networking/mouse-state.js';
import * as THREE from 'three';
import { DEFAULT_GAME_SETTINGS } from '@shadow/shared';

const BATTERY_DRAIN_RATE = 0.05;   // per second (20s full drain)
const BATTERY_RECHARGE_RATE = 0.08; // per second (~12.5s full recharge)
const BATTERY_MIN_TO_RELIGHT = 0.2; // 20% minimum to turn back on

export function LocalPlayer({ color }: { color: string }) {
  const groupRef = useRef<THREE.Group>(null!);
  const spotRef = useRef<THREE.SpotLight>(null!);
  const targetObj = useRef(new THREE.Object3D());

  useFrame((_state, delta) => {
    const { localPosition, localRotation } = useGameStore.getState();
    const [px, py, pz] = localPosition;
    const [rx, ry, rz, rw] = localRotation;

    const targetPos = new THREE.Vector3(px, py, pz);
    const targetQuat = new THREE.Quaternion(rx, ry, rz, rw);

    groupRef.current.position.lerp(targetPos, 0.3);
    groupRef.current.quaternion.slerp(targetQuat, 0.3);

    // Battery drain / recharge
    if (inputState.flashlightOn) {
      inputState.batteryLevel = Math.max(0, inputState.batteryLevel - BATTERY_DRAIN_RATE * delta);
      if (inputState.batteryLevel <= 0) {
        inputState.flashlightOn = false;
        inputState.batteryDepleted = true;
      }
    } else {
      inputState.batteryLevel = Math.min(1, inputState.batteryLevel + BATTERY_RECHARGE_RATE * delta);
      if (inputState.batteryDepleted && inputState.batteryLevel >= BATTERY_MIN_TO_RELIGHT) {
        inputState.batteryDepleted = false;
      }
    }

    // Position flashlight at camera eye level (world coords, outside group)
    if (spotRef.current) {
      spotRef.current.target = targetObj.current;
      spotRef.current.visible = inputState.flashlightOn;
      const yaw = mouseState.yaw;
      const pitch = mouseState.pitch;
      const eyeY = py + 1.2;

      spotRef.current.position.set(px, eyeY, pz);

      // Forward direction matches camera: (sin(yaw)*cos(pitch), -sin(pitch), -cos(yaw)*cos(pitch))
      const fx = Math.sin(yaw) * Math.cos(pitch);
      const fy = -Math.sin(pitch);
      const fz = -Math.cos(yaw) * Math.cos(pitch);
      targetObj.current.position.set(
        px + fx * 5,
        eyeY + fy * 5,
        pz + fz * 5,
      );
      targetObj.current.updateMatrixWorld();
    }
  });

  return (
    <>
      <group ref={groupRef}>
        {/* Capsule body — hidden in FPS view */}
        <mesh position={[0, 0.6, 0]} castShadow visible={false}>
          <capsuleGeometry args={[0.3, 0.6, 8, 16]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
        </mesh>
      </group>

      {/* Flashlight (outside group to avoid double transform) */}
      <spotLight
        ref={spotRef}
        angle={Math.PI / 5}
        penumbra={0.4}
        intensity={33}
        distance={DEFAULT_GAME_SETTINGS.flashlightRange}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        color="#ffe4b5"
      />
      <primitive object={targetObj.current} />
    </>
  );
}
