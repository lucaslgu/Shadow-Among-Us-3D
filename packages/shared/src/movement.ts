import type { InputSnapshot } from './types/player.js';
import type { CollisionContext } from './maze/maze-types.js';
import { DEFAULT_GAME_SETTINGS } from './types/game-state.js';
import { resolveCollision, PLAYER_RADIUS } from './maze/collision.js';
import { MAP_HALF_EXTENT } from './maze/maze-generator.js';

const PLAYER_SPEED = DEFAULT_GAME_SETTINGS.playerSpeed;

/**
 * Movement uses Three.js convention: forward = -Z, right = +X.
 * At yaw=0, forward is (0, 0, -1). Mouse right increases yaw,
 * forward becomes (sin(yaw), 0, -cos(yaw)).
 *
 * If collisionCtx is provided, resolves wall collisions after movement.
 */
export function applyMovement(
  position: [number, number, number],
  input: InputSnapshot,
  dt: number,
  speedMultiplier = 1,
  collisionCtx?: CollisionContext,
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
  let result: [number, number, number] = [
    Math.max(-MAP_HALF_EXTENT, Math.min(MAP_HALF_EXTENT, position[0] + moveX * speed * dt)),
    position[1],
    Math.max(-MAP_HALF_EXTENT, Math.min(MAP_HALF_EXTENT, position[2] + moveZ * speed * dt)),
  ];

  // Resolve wall collisions if maze context is provided
  if (collisionCtx) {
    result = resolveCollision(result, PLAYER_RADIUS, collisionCtx);
    // Re-apply bounds clamp after collision push
    result[0] = Math.max(-MAP_HALF_EXTENT, Math.min(MAP_HALF_EXTENT, result[0]));
    result[2] = Math.max(-MAP_HALF_EXTENT, Math.min(MAP_HALF_EXTENT, result[2]));
  }

  return result;
}

/**
 * Converts yaw to a Y-axis quaternion matching the -Z forward convention.
 * Negative yaw rotation so the model faces (sin(yaw), 0, -cos(yaw)).
 */
export function yawToQuaternion(yaw: number): [number, number, number, number] {
  const half = -yaw / 2;
  return [0, Math.sin(half), 0, Math.cos(half)];
}
