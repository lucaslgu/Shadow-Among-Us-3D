import type { WallSegment, CollisionContext } from './maze-types.js';

// ═══════════════════════════════════════════════════════════════
// Circle-vs-Line Segment collision for player movement
// Player is a circle of given radius in the XZ plane
// ═══════════════════════════════════════════════════════════════

const PLAYER_RADIUS = 0.4;
const COLLISION_ITERATIONS = 3;

/**
 * Check if a wall segment is currently solid (blocks movement).
 */
function isWallSolid(wall: WallSegment, ctx: CollisionContext): boolean {
  // Border walls are always solid
  if (wall.isBorder) return true;

  // Dynamic walls: check current state
  if (wall.isDynamic) {
    const state = ctx.dynamicWallStates[wall.id];
    return state !== false; // default to closed/solid if missing
  }

  // Walls with doors: check door state
  if (wall.hasDoor && wall.doorId) {
    const doorState = ctx.doorStates[wall.doorId];
    if (doorState) {
      // Door is passable only if open AND not locked
      if (doorState.isOpen && !doorState.isLocked) return false;
    }
    return true; // closed or locked = solid
  }

  // Static wall without door: always solid
  return true;
}

/**
 * Find closest point on line segment AB to point P, all in XZ plane.
 * Returns the closest point and the squared distance.
 */
function closestPointOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { cx: number; cz: number; distSq: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;

  if (lenSq === 0) {
    // Degenerate segment (point)
    const ddx = px - ax;
    const ddz = pz - az;
    return { cx: ax, cz: az, distSq: ddx * ddx + ddz * ddz };
  }

  // Project P onto AB, clamped to [0, 1]
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * dx;
  const cz = az + t * dz;
  const ddx = px - cx;
  const ddz = pz - cz;
  return { cx, cz, distSq: ddx * ddx + ddz * ddz };
}

/**
 * Resolve collision between a circle (player) and all active wall segments.
 * Uses iterative push-out to handle corners and multiple walls.
 */
export function resolveCollision(
  position: [number, number, number],
  radius: number,
  context: CollisionContext,
): [number, number, number] {
  let px = position[0];
  const py = position[1];
  let pz = position[2];
  const radiusSq = radius * radius;

  for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
    let pushed = false;

    for (const wall of context.walls) {
      if (!isWallSolid(wall, context)) continue;

      const { cx, cz, distSq } = closestPointOnSegment(
        px,
        pz,
        wall.start[0],
        wall.start[1],
        wall.end[0],
        wall.end[1],
      );

      if (distSq < radiusSq && distSq > 0.0001) {
        // Push player out
        const dist = Math.sqrt(distSq);
        const overlap = radius - dist;
        const nx = (px - cx) / dist;
        const nz = (pz - cz) / dist;
        px += nx * overlap;
        pz += nz * overlap;
        pushed = true;
      } else if (distSq <= 0.0001) {
        // Player is exactly on the segment — push along wall normal
        const dx = wall.end[0] - wall.start[0];
        const dz = wall.end[1] - wall.start[1];
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len > 0) {
          // Normal is perpendicular to wall direction
          const nx = -dz / len;
          const nz = dx / len;
          px += nx * radius;
          pz += nz * radius;
          pushed = true;
        }
      }
    }

    // Check muralha (barrier) walls — always solid
    if (context.muralhaWalls) {
      for (const mw of context.muralhaWalls) {
        const { cx, cz, distSq } = closestPointOnSegment(
          px, pz,
          mw.start[0], mw.start[1],
          mw.end[0], mw.end[1],
        );

        if (distSq < radiusSq && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = radius - dist;
          const nx = (px - cx) / dist;
          const nz = (pz - cz) / dist;
          px += nx * overlap;
          pz += nz * overlap;
          pushed = true;
        } else if (distSq <= 0.0001) {
          const dx = mw.end[0] - mw.start[0];
          const dz = mw.end[1] - mw.start[1];
          const len = Math.sqrt(dx * dx + dz * dz);
          if (len > 0) {
            const nx = -dz / len;
            const nz = dx / len;
            px += nx * radius;
            pz += nz * radius;
            pushed = true;
          }
        }
      }
    }

    if (!pushed) break; // converged
  }

  return [px, py, pz];
}

/**
 * Build a spatial grid index for faster collision queries.
 * Groups wall segments by the grid cells they overlap.
 */
export function buildSpatialIndex(
  walls: WallSegment[],
  gridSize: number,
  cellSize: number,
): Map<string, WallSegment[]> {
  const halfMap = (gridSize * cellSize) / 2;
  const grid = new Map<string, WallSegment[]>();

  for (const wall of walls) {
    // Find grid cells this wall overlaps
    const minX = Math.min(wall.start[0], wall.end[0]);
    const maxX = Math.max(wall.start[0], wall.end[0]);
    const minZ = Math.min(wall.start[1], wall.end[1]);
    const maxZ = Math.max(wall.start[1], wall.end[1]);

    const colMin = Math.max(0, Math.floor((minX + halfMap) / cellSize));
    const colMax = Math.min(gridSize - 1, Math.floor((maxX + halfMap) / cellSize));
    const rowMin = Math.max(0, Math.floor((minZ + halfMap) / cellSize));
    const rowMax = Math.min(gridSize - 1, Math.floor((maxZ + halfMap) / cellSize));

    for (let r = rowMin; r <= rowMax; r++) {
      for (let c = colMin; c <= colMax; c++) {
        const key = `${r}_${c}`;
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = [];
          grid.set(key, bucket);
        }
        bucket.push(wall);
      }
    }
  }

  return grid;
}

/**
 * Fast collision resolution using spatial index.
 * Only tests walls in the player's current cell + neighbors.
 */
export function resolveCollisionFast(
  position: [number, number, number],
  radius: number,
  spatialIndex: Map<string, WallSegment[]>,
  context: CollisionContext,
  gridSize: number,
  cellSize: number,
): [number, number, number] {
  const halfMap = (gridSize * cellSize) / 2;
  const col = Math.floor((position[0] + halfMap) / cellSize);
  const row = Math.floor((position[2] + halfMap) / cellSize);

  // Gather walls from current cell + 8 neighbors
  const nearbyWalls: WallSegment[] = [];
  const seen = new Set<string>();

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) continue;
      const bucket = spatialIndex.get(`${r}_${c}`);
      if (bucket) {
        for (const w of bucket) {
          if (!seen.has(w.id)) {
            seen.add(w.id);
            nearbyWalls.push(w);
          }
        }
      }
    }
  }

  // Resolve with only nearby walls
  const localCtx: CollisionContext = {
    walls: nearbyWalls,
    doorStates: context.doorStates,
    dynamicWallStates: context.dynamicWallStates,
  };
  return resolveCollision(position, radius, localCtx);
}

export { PLAYER_RADIUS };
