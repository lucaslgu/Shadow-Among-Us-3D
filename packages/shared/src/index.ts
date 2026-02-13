export * from './types/index.js';
export { applyMovement, yawToQuaternion } from './movement.js';
export * from './maze/index.js';
export { FIRE_POSITIONS, FIRE_DAMAGE_RADIUS, NUM_FIRE_SPOTS, FIRE_SPOT_SEED, seededRandom } from './environment/fire-positions.js';
export {
  createSunSimulation,
  advanceSunSimulation,
  isSunVisible,
  getSunElevation,
  getSunDirection2D,
  OVERHEAD_ELEVATION,
} from './environment/sun-simulation.js';
export type { LorenzState, SunPosition, SunSimulationState } from './environment/sun-simulation.js';
export { isRayBlockedByWalls } from './environment/ray-occlusion.js';
export type { OcclusionContext } from './environment/ray-occlusion.js';
