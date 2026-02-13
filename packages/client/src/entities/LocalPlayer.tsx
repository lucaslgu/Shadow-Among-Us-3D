import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../stores/game-store.js';
import { mouseState, inputState } from '../networking/mouse-state.js';
import * as THREE from 'three';
import { DEFAULT_GAME_SETTINGS } from '@shadow/shared';
import { playFootstep } from '../audio/sound-manager.js';

const BATTERY_DRAIN_RATE = 0.025;   // per second (~40s full drain)
const BATTERY_RECHARGE_RATE = 0.06;  // per second (~16.7s full recharge)
const BATTERY_MIN_TO_RELIGHT = 0.15; // 15% minimum to turn back on
const FOOTSTEP_INTERVAL = 0.38;     // seconds between footsteps
const FOOTSTEP_SPEED_THRESHOLD = 0.5; // minimum speed to trigger footsteps

// Reusable objects to avoid per-frame allocations
const _targetPos = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();

export function LocalPlayer({ color }: { color: string }) {
  const groupRef = useRef<THREE.Group>(null!);
  const spotRef = useRef<THREE.SpotLight>(null!);
  const spotTargetRef = useRef<THREE.Object3D>(null!);
  const prevPos = useRef<[number, number, number]>([0, 0, 0]);
  const footstepTimer = useRef(FOOTSTEP_INTERVAL * 0.8);

  // Link the JSX-managed object3D as the spotlight's target
  useEffect(() => {
    const spot = spotRef.current;
    const target = spotTargetRef.current;
    if (spot && target) {
      spot.target = target;
    }
  }, []);

  useFrame((_state, delta) => {
    const gameState = useGameStore.getState();
    const { localPosition, localRotation, isGhost } = gameState;
    const [px, py, pz] = localPosition;

    // Footstep sounds — detect movement by position delta (skip if ghost)
    const dx = px - prevPos.current[0];
    const dz = pz - prevPos.current[2];
    const speed = delta > 0 ? Math.sqrt(dx * dx + dz * dz) / delta : 0;
    prevPos.current = [px, py, pz];

    if (!isGhost && speed > FOOTSTEP_SPEED_THRESHOLD) {
      footstepTimer.current += delta;
      if (footstepTimer.current >= FOOTSTEP_INTERVAL) {
        playFootstep();
        footstepTimer.current = 0;
      }
    } else {
      // Reset timer near threshold so first step plays quickly
      footstepTimer.current = FOOTSTEP_INTERVAL * 0.8;
    }
    const [rx, ry, rz, rw] = localRotation;

    _targetPos.set(px, py, pz);
    _targetQuat.set(rx, ry, rz, rw);

    groupRef.current.position.lerp(_targetPos, 0.3);
    groupRef.current.quaternion.slerp(_targetQuat, 0.3);

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

    // Position flashlight at camera eye level (disabled when ghost)
    const spot = spotRef.current;
    const spotTarget = spotTargetRef.current;
    if (spot && spotTarget) {
      spot.visible = !isGhost && inputState.flashlightOn;
      const yaw = mouseState.yaw;
      const pitch = mouseState.pitch;
      const eyeY = py + 1.2;

      spot.position.set(px, eyeY, pz);

      // Forward direction matches camera: (sin(yaw)*cos(pitch), -sin(pitch), -cos(yaw)*cos(pitch))
      const fx = Math.sin(yaw) * Math.cos(pitch);
      const fy = -Math.sin(pitch);
      const fz = -Math.cos(yaw) * Math.cos(pitch);
      spotTarget.position.set(
        px + fx * 10,
        eyeY + fy * 10,
        pz + fz * 10,
      );
    }
  });

  return (
    <>
      <group ref={groupRef}>
        {/* Capsule body — hidden in FPS view */}
        <mesh position={[0, 0.6, 0]} visible={false}>
          <capsuleGeometry args={[0.3, 0.6, 8, 16]} />
          <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
        </mesh>
      </group>

      {/* Flashlight target — R3F manages this in the scene graph */}
      <object3D ref={spotTargetRef} />

      {/* Flashlight (outside group to avoid double transform) */}
      <spotLight
        ref={spotRef}
        angle={Math.PI / 4}
        penumbra={0.5}
        intensity={600}
        distance={DEFAULT_GAME_SETTINGS.flashlightRange}
        castShadow
        shadow-mapSize-width={256}
        shadow-mapSize-height={256}
        color="#ffe4b5"
      />
    </>
  );
}
