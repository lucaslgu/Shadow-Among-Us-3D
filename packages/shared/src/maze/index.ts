export * from './maze-types.js';
export * from './task-registry.js';
export { generateMaze, createInitialMazeSnapshot, GRID_SIZE, CELL_SIZE, MAP_HALF_EXTENT } from './maze-generator.js';
export {
  resolveCollision,
  resolveCollisionFast,
  buildSpatialIndex,
  PLAYER_RADIUS,
} from './collision.js';
