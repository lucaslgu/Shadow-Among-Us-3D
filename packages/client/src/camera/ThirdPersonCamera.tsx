import { useFrame, useThree } from '@react-three/fiber';
import { useGameStore } from '../stores/game-store.js';
import { mouseState } from '../networking/mouse-state.js';
import * as THREE from 'three';

const EYE_HEIGHT = 1.2;

export function ThirdPersonCamera() {
  const { camera } = useThree();

  useFrame(() => {
    const { localPosition } = useGameStore.getState();
    const [px, py, pz] = localPosition;

    // Camera at player's head
    camera.position.set(px, py + EYE_HEIGHT, pz);

    // FPS camera using Euler angles (YXZ order = yaw first, then pitch)
    camera.rotation.order = 'YXZ';
    camera.rotation.y = -mouseState.yaw;   // mouse right → positive yaw → camera turns right
    camera.rotation.x = -mouseState.pitch; // mouse down → positive pitch → camera tilts down
    camera.rotation.z = 0;
  });

  return null;
}
