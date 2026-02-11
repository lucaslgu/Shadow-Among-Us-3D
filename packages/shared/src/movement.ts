import type { InputSnapshot } from './types/player.js';
import { DEFAULT_GAME_SETTINGS } from './types/game-state.js';

const PLAYER_SPEED = DEFAULT_GAME_SETTINGS.playerSpeed;

/**
 * Movement uses Three.js convention: forward = -Z, right = +X.
 * At yaw=0, forward is (0, 0, -1). Mouse right increases yaw,
 * forward becomes (sin(yaw), 0, -cos(yaw)).
 */
export function applyMovement(
  position: [number, number, number],
  input: InputSnapshot,
  dt: number,
  speedMultiplier = 1,
): [number, number, number] {
  const yaw = input.mouseX;
  let moveX = 0;
  let moveZ = 0;

  // Forward = (sin(yaw), -cos(yaw))
  if (input.forward) {
    moveX += Math.sin(yaw);
    moveZ -= Math.cos(yaw);
  }
  // Backward = (-sin(yaw), cos(yaw))
  if (input.backward) {
    moveX -= Math.sin(yaw);
    moveZ += Math.cos(yaw);
  }
  // Left = (-cos(yaw), -sin(yaw))
  if (input.left) {
    moveX -= Math.cos(yaw);
    moveZ -= Math.sin(yaw);
  }
  // Right = (cos(yaw), sin(yaw))
  if (input.right) {
    moveX += Math.cos(yaw);
    moveZ += Math.sin(yaw);
  }

  const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
  if (len > 0) {
    moveX /= len;
    moveZ /= len;
  }

  const speed = PLAYER_SPEED * speedMultiplier;
  return [
    Math.max(-50, Math.min(50, position[0] + moveX * speed * dt)),
    position[1],
    Math.max(-50, Math.min(50, position[2] + moveZ * speed * dt)),
  ];
}

/**
 * Converts yaw to a Y-axis quaternion matching the -Z forward convention.
 * Negative yaw rotation so the model faces (sin(yaw), 0, -cos(yaw)).
 */
export function yawToQuaternion(yaw: number): [number, number, number, number] {
  const half = -yaw / 2;
  return [0, Math.sin(half), 0, Math.cos(half)];
}
