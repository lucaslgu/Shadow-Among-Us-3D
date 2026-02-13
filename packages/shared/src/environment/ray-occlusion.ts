// ═══════════════════════════════════════════════════════════════
// Ray Occlusion — 2D ray vs wall-segment intersection
// Used by server to check if walls block sun exposure
// ═══════════════════════════════════════════════════════════════

import type { WallSegment, DoorState, MuralhaWall } from '../maze/maze-types.js';

/**
 * Test if a 2D ray (in XZ plane) intersects a line segment.
 * Uses parametric intersection: ray = origin + t*dir, segment = A + u*(B-A)
 * Returns true if intersection exists with t > 0 and 0 <= u <= 1.
 */
function rayIntersectsSegment(
  originX: number,
  originZ: number,
  dirX: number,
  dirZ: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): boolean {
  const segDx = bx - ax;
  const segDz = bz - az;
  const denom = dirX * segDz - dirZ * segDx;

  // Parallel (or nearly so)
  if (Math.abs(denom) < 1e-8) return false;

  const t = ((ax - originX) * segDz - (az - originZ) * segDx) / denom;
  const u = ((ax - originX) * dirZ - (az - originZ) * dirX) / denom;

  // Intersection must be in front of origin (t > small epsilon) and on the segment (u in [0,1])
  return t > 0.1 && u >= 0 && u <= 1;
}

/** Check if a wall segment is currently solid (closed) */
function isWallSolid(
  wall: WallSegment,
  doorStates: Record<string, DoorState>,
  dynamicWallStates: Record<string, boolean>,
): boolean {
  if (wall.isBorder) return true;
  if (wall.isDynamic) {
    return dynamicWallStates[wall.id] !== false; // default closed
  }
  if (wall.hasDoor && wall.doorId) {
    const ds = doorStates[wall.doorId];
    if (ds && ds.isOpen && !ds.isLocked) return false; // open door = passable
  }
  return true;
}

export interface OcclusionContext {
  walls: WallSegment[];
  doorStates: Record<string, DoorState>;
  dynamicWallStates: Record<string, boolean>;
  muralhaWalls: MuralhaWall[];
}

/**
 * Check if a ray from a player toward a sun direction is blocked by any solid wall.
 * Uses early-exit: returns true as soon as ANY wall blocks the ray.
 *
 * @param px Player X position
 * @param pz Player Z position
 * @param dirX Normalized ray direction X (toward sun)
 * @param dirZ Normalized ray direction Z (toward sun)
 * @param ctx Wall data
 * @returns true if at least one wall blocks the ray
 */
export function isRayBlockedByWalls(
  px: number,
  pz: number,
  dirX: number,
  dirZ: number,
  ctx: OcclusionContext,
): boolean {
  // Check static/dynamic/door walls
  for (const wall of ctx.walls) {
    if (!isWallSolid(wall, ctx.doorStates, ctx.dynamicWallStates)) continue;
    if (rayIntersectsSegment(
      px, pz, dirX, dirZ,
      wall.start[0], wall.start[1],
      wall.end[0], wall.end[1],
    )) {
      return true;
    }
  }

  // Check muralha (barrier) walls
  for (const mw of ctx.muralhaWalls) {
    if (rayIntersectsSegment(
      px, pz, dirX, dirZ,
      mw.start[0], mw.start[1],
      mw.end[0], mw.end[1],
    )) {
      return true;
    }
  }

  return false;
}
