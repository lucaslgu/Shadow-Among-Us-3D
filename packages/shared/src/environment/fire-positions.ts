// ═══════════════════════════════════════════════════════════════
// Fire Positions — shared between server (damage) and client (rendering)
// Uses seeded RNG so both sides produce identical positions
// ═══════════════════════════════════════════════════════════════

export const NUM_FIRE_SPOTS = 12;
export const FIRE_SPOT_SEED = 42;
export const FIRE_DAMAGE_RADIUS = 2.5; // meters — used for server-side proximity damage

/** LCG-based seeded random (same algorithm used by client visuals) */
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Pre-computed fire positions — deterministic from FIRE_SPOT_SEED */
export const FIRE_POSITIONS: [number, number, number][] = (() => {
  const rng = seededRandom(FIRE_SPOT_SEED);
  const positions: [number, number, number][] = [];
  for (let i = 0; i < NUM_FIRE_SPOTS; i++) {
    positions.push([
      (rng() - 0.5) * 80, // x: -40..40
      0.1,                 // y: just above floor
      (rng() - 0.5) * 80, // z: -40..40
    ]);
  }
  return positions;
})();
