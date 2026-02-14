import type { Server } from 'socket.io';
import type {
  ClientEvents,
  ServerEvents,
  StateSnapshot,
  PlayerSnapshot,
  InputSnapshot,
  MazeLayout,
  MazeSnapshot,
  CollisionContext,
  MuralhaWall,
  CosmicScenario,
  CosmicPhase,
} from '@shadow/shared';
import { POWER_CONFIGS, PowerType, FIRE_POSITIONS, FIRE_DAMAGE_RADIUS } from '@shadow/shared';
import {
  createSunSimulation,
  advanceSunSimulation,
  isSunVisible,
  getSunElevation,
  getSunDirection2D,
  OVERHEAD_ELEVATION,
} from '@shadow/shared/src/environment/sun-simulation.js';
import { isRayBlockedByWalls } from '@shadow/shared/src/environment/ray-occlusion.js';
import type { OcclusionContext } from '@shadow/shared/src/environment/ray-occlusion.js';
import { processInput } from '../systems/movement.js';

const TICK_RATE = 20;
const TICK_INTERVAL = 1000 / TICK_RATE;

// ===== Health & Environmental Damage Constants =====
export const MAX_HEALTH = 100;
const INFERNO_AMBIENT_DPS = 3; // base ambient heat damage/sec during chaosInferno (always active)
const INFERNO_SUN_DPS = 4;    // additional damage/sec from direct sun exposure
const ICE_DPS = 4;           // damage/sec from cold exposure (chaosIce)
const FIRE_CONTACT_DPS = 25; // damage/sec from standing in fire
const GRAVITY_TIDAL_DPS = 5; // damage/sec from tidal stress during chaosGravity
const NO_OXYGEN_DPS = 6;    // damage/sec when ship oxygen is depleted
const STABLE_REGEN_DPS = 10; // heal/sec during stable era

// ===== Ship Oxygen Constants =====
const MAX_SHIP_OXYGEN = 100;
const OXYGEN_DEPLETION_RATE = 0.8;  // %/sec during extreme gravity (runs out in ~125s / ~2 chaos phases)
// No automatic regen — oxygen is only restored manually at generators
const OXYGEN_REFILL_DURATION = 5; // seconds to complete a refill interaction
const OXYGEN_REFILL_AMOUNT = 100; // refills to full
const OXYGEN_REFILL_RANGE_SQ = 3.5 * 3.5; // interaction range squared

// ===== Room Oxygen Constants =====
const ROOM_OXYGEN_MAX = 100;
const ROOM_OXYGEN_DURATION = 45; // seconds of oxygen when sealed
const ROOM_OXYGEN_DEPLETION_RATE = ROOM_OXYGEN_MAX / ROOM_OXYGEN_DURATION; // ~2.22 %/sec
const ROOM_OXYGEN_SUFFOCATION_DPS = 4; // damage/sec when room O2 is depleted

export interface GamePlayerState {
  sessionToken: string;
  socketId: string;
  name: string;
  role: 'crew' | 'shadow';
  power: string;
  color: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  isAlive: boolean;
  isHidden: boolean;
  isInvisible: boolean;
  hasShield: boolean;
  isImpermeable: boolean;
  activeTaskId: string | null;
  assignedTasks: string[];
  speedMultiplier: number;
  lastProcessedInput: number;
  inputQueue: InputSnapshot[];
  // Power state
  powerActive: boolean;
  powerActiveEnd: number;
  powerCooldownEnd: number;
  powerUsesLeft: number;
  // Mind controller
  mindControlTargetToken: string | null;
  mindControlInput: { forward: boolean; backward: boolean; left: boolean; right: boolean; mouseX: number } | null;
  // Original speed (before power modifications)
  baseSpeedMultiplier: number;
  // Original color (for Metamorph revert)
  originalColor: string;
  // Original power (for Metamorph revert)
  originalPower: string;
  isMetamorphed: boolean;
  metamorphEndTime: number;
  // Hacker tracking (revert on deactivation)
  hackerLockedDoors: string[];
  hackerToggledLights: string[];
  hackerToggledWalls: string[];
  hackerLockedPipes: string[];
  hackerDisabledGenerators: string[];
  hackerDrainCount: number; // number of O2 drains used this activation (max 2)
  // Muralha (barrier walls — up to 4 simultaneous)
  muralhaWalls: Array<{ wallId: string; start: [number, number]; end: [number, number]; expiresAt: number }>;
  muralhaNextWallId: number;
  // Health
  health: number;
  maxHealth: number;
  damageSource: string;
  inShelter: boolean;
  doorProtection: boolean;
  currentRoomId: string | null;
  // Oxygen refill interaction
  oxygenRefillGeneratorId: string | null;
  oxygenRefillStartTime: number;
  // Kill
  killCooldownEnd: number;
  // Ghost
  isGhost: boolean;
  ghostPossessTargetToken: string | null;
  ghostPossessInput: { forward: boolean; backward: boolean; left: boolean; right: boolean; mouseX: number } | null;
  ghostPossessEnd: number;
  ghostPossessCooldownEnd: number;
  // Underground pipe system
  isUnderground: boolean;
  currentPipeNodeId: string | null;
  undergroundEnteredAt: number; // Date.now() when entered, 0 when on surface
  pipeCooldownEnd: number; // Date.now() + 20s after exiting pipe
  // Meeting
  emergencyButtonCooldownEnd: number;
  emergencyButtonUsesLeft: number;
}

// ===== Era cycle (scenario-based) =====

function computeEraFromScenario(
  gameTimeSec: number,
  phases: CosmicPhase[],
): { era: string; gravity: number; description: string } {
  // Find the phase that contains the current game time
  for (const phase of phases) {
    if (gameTimeSec >= phase.startSec && gameTimeSec < phase.endSec) {
      return { era: phase.era, gravity: phase.gravity, description: phase.description };
    }
  }

  // If game time exceeds the last phase, cycle via modulo
  const totalDuration = phases[phases.length - 1].endSec;
  if (totalDuration > 0) {
    const wrappedTime = gameTimeSec % totalDuration;
    for (const phase of phases) {
      if (wrappedTime >= phase.startSec && wrappedTime < phase.endSec) {
        return { era: phase.era, gravity: phase.gravity, description: phase.description };
      }
    }
  }

  // Ultimate fallback
  return { era: 'stable', gravity: 1.0, description: '' };
}

function getEraPeriod(era: string): number {
  switch (era) {
    case 'chaosInferno': return 30000;  // 30s cycle
    case 'chaosIce': return Infinity;   // frozen
    case 'chaosGravity': return 20000;  // 20s cycle (fast — gravitational anomalies)
    default: return 120000;             // 2min cycle
  }
}

function seededHash(str: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0) / 4294967296;
}

const DOOR_INTERACT_RANGE = 3.5;

// ===== Dead Bodies =====
export interface DeadBody {
  bodyId: string;
  victimId: string;      // socketId
  victimName: string;
  victimColor: string;
  position: [number, number, number];
  reported: boolean;
}

// ===== Position History (for Prediction power, sampled at 1Hz) =====
export interface PositionHistoryEntry {
  timestamp: number;
  x: number;
  z: number;
}

const positionHistories = new Map<string, PositionHistoryEntry[]>();
let lastPositionSampleTime = 0;
const POSITION_SAMPLE_INTERVAL = 1000; // 1Hz
const MAX_POSITION_HISTORY = 30;

export function getPositionHistories(): Map<string, PositionHistoryEntry[]> {
  return positionHistories;
}

let bodyCounter = 0;
export function createDeadBody(victim: GamePlayerState): DeadBody {
  return {
    bodyId: `body_${++bodyCounter}`,
    victimId: victim.socketId,
    victimName: victim.name,
    victimColor: victim.color,
    position: [...victim.position],
    reported: false,
  };
}

// ===== Game Over Check =====
export function checkGameOver(
  gamePlayers: Map<string, GamePlayerState>,
  mazeSnapshot: MazeSnapshot,
): { gameOver: boolean; winner?: 'crew' | 'shadow' | 'draw'; reason?: string } {
  let aliveCrew = 0;
  let aliveShadow = 0;
  for (const [, gp] of gamePlayers) {
    if (!gp.isAlive) continue;
    if (gp.role === 'crew') aliveCrew++;
    else if (gp.role === 'shadow') aliveShadow++;
  }

  // All players dead — draw
  if (aliveCrew === 0 && aliveShadow === 0) {
    return { gameOver: true, winner: 'draw', reason: 'Everyone perished!' };
  }

  // All shadows eliminated
  if (aliveShadow === 0) {
    return { gameOver: true, winner: 'crew', reason: 'All impostors were eliminated!' };
  }

  // Crew <= shadows (shadows win)
  if (aliveCrew <= aliveShadow && aliveShadow > 0) {
    return { gameOver: true, winner: 'shadow', reason: 'The impostors have overtaken the crew!' };
  }

  // All tasks completed
  const allCompleted = Object.values(mazeSnapshot.taskStates).every(
    (ts) => ts.completionState === 'completed',
  );
  if (allCompleted) {
    return { gameOver: true, winner: 'crew', reason: 'All tasks have been completed!' };
  }

  return { gameOver: false };
}

export function startGameLoop(
  io: Server<ClientEvents, ServerEvents>,
  roomCode: string,
  gamePlayers: Map<string, GamePlayerState>,
  mazeLayout: MazeLayout,
  mazeSnapshot: MazeSnapshot,
  cosmicScenario: CosmicScenario,
  deadBodies: Map<string, DeadBody>,
  onEraChange?: (era: string) => void,
  onCheckEndConditions?: () => void,
  options?: { devMode?: boolean },
): ReturnType<typeof setInterval> {
  let tickSeq = 0;
  const gameStartTime = Date.now();
  const masses: [number, number, number] = [
    cosmicScenario.suns[0].mass ?? 1.0,
    cosmicScenario.suns[1].mass ?? 1.0,
    cosmicScenario.suns[2].mass ?? 1.0,
  ];
  const sunSim = createSunSimulation(masses, cosmicScenario.initialConfig as 'triangle' | 'hierarchical' | 'figure8' | undefined);
  // shipOxygen is stored on mazeSnapshot so hacker:action handlers can drain it
  positionHistories.clear();
  lastPositionSampleTime = Date.now();

  // Room oxygen — each room starts full; depletes when sealed (all doors closed)
  const roomOxygen = new Map<string, number>();
  for (const room of mazeLayout.rooms) {
    roomOxygen.set(room.id, ROOM_OXYGEN_MAX);
  }

  const interval = setInterval(() => {
    tickSeq++;
    const now = Date.now();

    // ── Position history sampling (1Hz for Prediction power) ──
    if (now - lastPositionSampleTime >= POSITION_SAMPLE_INTERVAL) {
      lastPositionSampleTime = now;
      for (const [token, gp] of gamePlayers) {
        if (!gp.isAlive) continue;
        let history = positionHistories.get(token);
        if (!history) {
          history = [];
          positionHistories.set(token, history);
        }
        history.push({ timestamp: now, x: gp.position[0], z: gp.position[2] });
        if (history.length > MAX_POSITION_HISTORY) {
          history.shift();
        }
      }
    }

    // ── Era cycle (from AI-generated scenario) ──
    const gameTimeSec = (now - gameStartTime) / 1000;
    const { era: currentEra, gravity: eraGravity, description: eraDescription } = computeEraFromScenario(gameTimeSec, cosmicScenario.phases);
    if (onEraChange) onEraChange(currentEra);

    // ── Advance sun simulation ──
    advanceSunSimulation(sunSim, TICK_INTERVAL / 1000);

    // ── Update dynamic wall states ──
    for (const wallId of mazeLayout.dynamicWallIds) {
      const period = getEraPeriod(currentEra);
      if (period === Infinity) continue; // chaosIce — frozen, keep current state
      const phase = seededHash(wallId, mazeLayout.seed) * period;
      const t = ((now + phase) % period) / period;
      mazeSnapshot.dynamicWallStates[wallId] = t < 0.6; // 60% closed, 40% open
    }

    // ── Expire muralha walls + recharge charges ──
    for (const [, gp] of gamePlayers) {
      if (gp.muralhaWalls.length > 0) {
        gp.muralhaWalls = gp.muralhaWalls.filter(w => w.expiresAt > now);
      }
      // Recharge MURALHA charges when cooldown expires and charges < max
      if (gp.power === PowerType.MURALHA &&
          gp.powerUsesLeft < POWER_CONFIGS[PowerType.MURALHA].usesPerMatch &&
          !gp.powerActive && now >= gp.powerCooldownEnd) {
        gp.powerUsesLeft = POWER_CONFIGS[PowerType.MURALHA].usesPerMatch;
      }
      // Recharge TELEPORT charges one at a time when cooldown expires
      if (gp.power === PowerType.TELEPORT &&
          gp.powerUsesLeft < POWER_CONFIGS[PowerType.TELEPORT].usesPerMatch &&
          !gp.powerActive && now >= gp.powerCooldownEnd) {
        gp.powerUsesLeft++;
        if (gp.powerUsesLeft < POWER_CONFIGS[PowerType.TELEPORT].usesPerMatch) {
          gp.powerCooldownEnd = now + POWER_CONFIGS[PowerType.TELEPORT].cooldown;
        }
      }
      // Recharge PREDICTION charges one at a time when cooldown expires
      if (gp.power === PowerType.PREDICTION &&
          gp.powerUsesLeft < POWER_CONFIGS[PowerType.PREDICTION].usesPerMatch &&
          !gp.powerActive && now >= gp.powerCooldownEnd) {
        gp.powerUsesLeft++;
        if (gp.powerUsesLeft < POWER_CONFIGS[PowerType.PREDICTION].usesPerMatch) {
          gp.powerCooldownEnd = now + POWER_CONFIGS[PowerType.PREDICTION].cooldown;
        }
      }
    }

    // ── Collect active muralha walls ──
    const muralhaWalls: MuralhaWall[] = [];
    for (const [, gp] of gamePlayers) {
      for (const wall of gp.muralhaWalls) {
        muralhaWalls.push({ wallId: wall.wallId, ownerId: gp.socketId, start: wall.start, end: wall.end });
      }
    }

    // ── Expire hacker locks (doors, pipes, generators) ──
    for (const doorState of Object.values(mazeSnapshot.doorStates)) {
      if (doorState.hackerLockExpiresAt > 0 && now >= doorState.hackerLockExpiresAt) {
        doorState.isLocked = false;
        doorState.lockedBy = null;
        doorState.hackerLockExpiresAt = 0;
      }
    }
    for (const pipeLock of Object.values(mazeSnapshot.pipeLockStates)) {
      if (pipeLock.hackerLockExpiresAt > 0 && now >= pipeLock.hackerLockExpiresAt) {
        pipeLock.isLocked = false;
        pipeLock.lockedBy = null;
        pipeLock.hackerLockExpiresAt = 0;
      }
    }
    for (const [genId, expiresAt] of Object.entries(mazeSnapshot.disabledGenerators)) {
      if (now >= expiresAt) delete mazeSnapshot.disabledGenerators[genId];
    }

    // ── Build collision context ──
    const collisionCtx: CollisionContext = {
      walls: mazeLayout.walls,
      doorStates: mazeSnapshot.doorStates,
      dynamicWallStates: mazeSnapshot.dynamicWallStates,
      muralhaWalls,
    };
    // Underground collision context (pipe tunnel walls only)
    const undergroundCollisionCtx: CollisionContext = {
      walls: [],
      doorStates: {},
      dynamicWallStates: {},
      pipeWalls: mazeLayout.pipeWalls,
    };

    // Check Metamorph transformation expirations
    for (const [, gp] of gamePlayers) {
      if (gp.isMetamorphed && now >= gp.metamorphEndTime) {
        // If the copied power is active, deactivate it first
        if (gp.powerActive) {
          deactivatePower(io, roomCode, gp, gamePlayers, mazeSnapshot);
        }
        gp.color = gp.originalColor;
        gp.power = gp.originalPower;
        gp.isMetamorphed = false;
        gp.metamorphEndTime = 0;
        gp.powerCooldownEnd = now + POWER_CONFIGS[PowerType.METAMORPH].cooldown;
        io.to(roomCode).emit('power:ended', { playerId: gp.socketId, powerType: PowerType.METAMORPH });
      }
    }

    // Check power expirations
    for (const [, gp] of gamePlayers) {
      if (gp.powerActive && gp.powerActiveEnd > 0 && now >= gp.powerActiveEnd) {
        deactivatePower(io, roomCode, gp, gamePlayers, mazeSnapshot);
      }
    }

    // Gravity-based speed factor: high gravity → slower movement
    const gravitySpeedFactor = (currentEra === 'chaosGravity' && (eraGravity ?? 1) > 1)
      ? Math.max(0.4, 1.0 / Math.sqrt(eraGravity ?? 1))
      : 1.0;

    // Process all queued inputs for each alive player
    for (const [, gp] of gamePlayers) {
      if (!gp.isAlive && !gp.isGhost) continue;
      if (gp.isGhost) {
        // Ghost movement — no collision
        while (gp.inputQueue.length > 0) {
          const input = gp.inputQueue.shift()!;
          processInput(gp, input, TICK_INTERVAL / 1000, undefined);
        }
        continue;
      }
      // Apply gravity slowdown to speed multiplier
      const savedSpeed = gp.speedMultiplier;
      gp.speedMultiplier *= gravitySpeedFactor;

      const skipCollision = gp.isImpermeable;
      // Underground players use pipe tunnel collision, surface players use maze collision
      const ctx = gp.isUnderground ? undergroundCollisionCtx : collisionCtx;
      while (gp.inputQueue.length > 0) {
        const input = gp.inputQueue.shift()!;
        processInput(gp, input, TICK_INTERVAL / 1000, skipCollision ? undefined : ctx);
      }
      // Restore original speed multiplier (gravity factor is per-tick, not persistent)
      gp.speedMultiplier = savedSpeed;
      // Update currentPipeNodeId based on proximity to pipe nodes
      if (gp.isUnderground && mazeLayout.pipeNodes) {
        gp.currentPipeNodeId = null;
        for (const pn of mazeLayout.pipeNodes) {
          const dx = gp.position[0] - pn.undergroundPosition[0];
          const dz = gp.position[2] - pn.undergroundPosition[2];
          if (dx * dx + dz * dz < 4 * 4) {
            gp.currentPipeNodeId = pn.id;
            break;
          }
        }

        // Force-exit if underground oxygen time expired (40 seconds)
        if (gp.undergroundEnteredAt > 0 && now - gp.undergroundEnteredAt >= 40_000) {
          // Find nearest pipe node to teleport back to surface
          let nearestNode = mazeLayout.pipeNodes[0];
          let nearestDistSq = Infinity;
          for (const pn of mazeLayout.pipeNodes) {
            const dx2 = gp.position[0] - pn.undergroundPosition[0];
            const dz2 = gp.position[2] - pn.undergroundPosition[2];
            const d = dx2 * dx2 + dz2 * dz2;
            if (d < nearestDistSq) { nearestDistSq = d; nearestNode = pn; }
          }
          gp.position = [...nearestNode.surfacePosition];
          gp.isUnderground = false;
          gp.currentPipeNodeId = null;
          gp.undergroundEnteredAt = 0;
          gp.pipeCooldownEnd = now + 20_000;
          console.log(`[PIPE] ${gp.name} forced out — underground oxygen expired`);
        }
      }
    }

    // Process mind controller arrow-key inputs on target players
    for (const [, gp] of gamePlayers) {
      if (gp.powerActive && gp.power === PowerType.MIND_CONTROLLER && gp.mindControlTargetToken && gp.mindControlInput) {
        const target = gamePlayers.get(gp.mindControlTargetToken);
        if (target && target.isAlive) {
          const fakeInput: InputSnapshot = {
            seq: target.lastProcessedInput,
            forward: gp.mindControlInput.forward,
            backward: gp.mindControlInput.backward,
            left: gp.mindControlInput.left,
            right: gp.mindControlInput.right,
            mouseX: gp.mindControlInput.mouseX,
            mouseY: 0,
            timestamp: now,
          };
          const targetSkipCollision = target.isImpermeable;
          processInput(target, { ...fakeInput, seq: target.lastProcessedInput + 1 }, TICK_INTERVAL / 1000, targetSkipCollision ? undefined : collisionCtx);
        }
      }
    }

    // Process ghost possession inputs on target players
    for (const [, gp] of gamePlayers) {
      if (!gp.isGhost || !gp.ghostPossessTargetToken || !gp.ghostPossessInput) continue;
      if (now >= gp.ghostPossessEnd) {
        gp.ghostPossessTargetToken = null;
        gp.ghostPossessInput = null;
        continue;
      }
      const target = gamePlayers.get(gp.ghostPossessTargetToken);
      if (target && target.isAlive) {
        const fakeInput: InputSnapshot = {
          seq: target.lastProcessedInput,
          forward: gp.ghostPossessInput.forward,
          backward: gp.ghostPossessInput.backward,
          left: gp.ghostPossessInput.left,
          right: gp.ghostPossessInput.right,
          mouseX: gp.ghostPossessInput.mouseX,
          mouseY: 0,
          timestamp: now,
        };
        const targetSkipCollision = target.isImpermeable;
        processInput(target, { ...fakeInput, seq: target.lastProcessedInput + 1 }, TICK_INTERVAL / 1000, targetSkipCollision ? undefined : collisionCtx);
      }
    }

    // ── Environmental health damage / regeneration ──
    // Build occlusion context once per tick (shared across all players)
    const occlusionCtx: OcclusionContext = {
      walls: mazeLayout.walls,
      doorStates: mazeSnapshot.doorStates,
      dynamicWallStates: mazeSnapshot.dynamicWallStates,
      muralhaWalls,
    };

    const dt = TICK_INTERVAL / 1000;

    // ── Ship oxygen depletion (no auto-regen — manual refill only) ──
    const isExtremeGravity = eraGravity >= 2.0 || eraGravity <= 0.25;
    if (isExtremeGravity) {
      mazeSnapshot.shipOxygen = Math.max(0, mazeSnapshot.shipOxygen - OXYGEN_DEPLETION_RATE * dt);
    }

    // ── Process oxygen refill interactions ──
    for (const [, rgp] of gamePlayers) {
      if (!rgp.oxygenRefillGeneratorId) continue;

      // Player died or left — cancel refill
      if (!rgp.isAlive) {
        rgp.oxygenRefillGeneratorId = null;
        rgp.oxygenRefillStartTime = 0;
        continue;
      }

      // Check proximity to generator
      const gen = mazeLayout.oxygenGenerators?.find(g => g.id === rgp.oxygenRefillGeneratorId);
      if (!gen) {
        rgp.oxygenRefillGeneratorId = null;
        rgp.oxygenRefillStartTime = 0;
        continue;
      }

      // Generator disabled by hacker — cancel refill
      const disabledUntil = mazeSnapshot.disabledGenerators[rgp.oxygenRefillGeneratorId!];
      if (disabledUntil && now < disabledUntil) {
        rgp.oxygenRefillGeneratorId = null;
        rgp.oxygenRefillStartTime = 0;
        continue;
      }

      const gdx = rgp.position[0] - gen.position[0];
      const gdz = rgp.position[2] - gen.position[2];
      if (gdx * gdx + gdz * gdz > OXYGEN_REFILL_RANGE_SQ) {
        // Walked away — cancel refill
        rgp.oxygenRefillGeneratorId = null;
        rgp.oxygenRefillStartTime = 0;
        continue;
      }

      // Check if refill duration elapsed
      if (now - rgp.oxygenRefillStartTime >= OXYGEN_REFILL_DURATION * 1000) {
        mazeSnapshot.shipOxygen = Math.min(MAX_SHIP_OXYGEN, mazeSnapshot.shipOxygen + OXYGEN_REFILL_AMOUNT);
        rgp.oxygenRefillGeneratorId = null;
        rgp.oxygenRefillStartTime = 0;
      }
    }

    // ── Room oxygen depletion / refill ──
    // For each room, check if all its connected doors are closed → deplete O2
    // If any door is open → refill back to max instantly (air flows in)
    for (const room of mazeLayout.rooms) {
      let allClosed = true;
      let hasDoors = false;
      for (const door of mazeLayout.doors) {
        const sideOffsets: Record<string, [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
        const [dr, dc] = sideOffsets[door.side] ?? [0, 0];
        const isConnected =
          (door.row === room.row && door.col === room.col) ||
          (door.row + dr === room.row && door.col + dc === room.col);
        if (isConnected) {
          hasDoors = true;
          const doorState = mazeSnapshot.doorStates[door.id];
          if (!doorState || doorState.isOpen) {
            allClosed = false;
            break;
          }
        }
      }
      const currentO2 = roomOxygen.get(room.id) ?? ROOM_OXYGEN_MAX;
      if (hasDoors && allClosed) {
        // Sealed room — deplete oxygen
        roomOxygen.set(room.id, Math.max(0, currentO2 - ROOM_OXYGEN_DEPLETION_RATE * dt));
      } else {
        // Open room — refill to max
        if (currentO2 < ROOM_OXYGEN_MAX) {
          roomOxygen.set(room.id, ROOM_OXYGEN_MAX);
        }
      }
    }

    for (const [, gp] of gamePlayers) {
      if (!gp.isAlive) {
        gp.damageSource = 'none';
        gp.inShelter = false;
        gp.doorProtection = false;
        continue;
      }

      // Impermeable power grants full immunity to all environmental effects
      if (gp.isImpermeable) {
        gp.damageSource = 'none';
        gp.inShelter = false;
        gp.doorProtection = false;
        // Regenerate health while impermeable
        gp.health = Math.min(gp.maxHealth, gp.health + STABLE_REGEN_DPS * dt);
        continue;
      }

      // Shelter check: player is inside ANY room with ALL its doors closed
      let inShelter = false;
      const halfMap = (mazeLayout.gridSize * mazeLayout.cellSize) / 2;
      const playerCol = Math.floor((gp.position[0] + halfMap) / mazeLayout.cellSize);
      const playerRow = Math.floor((gp.position[2] + halfMap) / mazeLayout.cellSize);

      // Check if player's cell is a room
      const playerRoom = mazeLayout.rooms.find((r) => r.row === playerRow && r.col === playerCol);
      if (playerRoom) {
        // Find all doors connected to this room cell and check if they are ALL closed
        let allDoorsClosed = true;
        let hasDoors = false;
        for (const door of mazeLayout.doors) {
          const sideOffsets: Record<string, [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
          const [dr, dc] = sideOffsets[door.side] ?? [0, 0];
          const isConnected =
            (door.row === playerRow && door.col === playerCol) ||
            (door.row + dr === playerRow && door.col + dc === playerCol);
          if (isConnected) {
            hasDoors = true;
            const doorState = mazeSnapshot.doorStates[door.id];
            if (!doorState || doorState.isOpen) {
              allDoorsClosed = false;
              break;
            }
          }
        }
        if (hasDoors && allDoorsClosed) {
          inShelter = true;
        }
      }

      // Also check designated shelter zones (always protect regardless of doors)
      if (!inShelter) {
        for (const shelter of mazeLayout.shelterZones) {
          const sdx = gp.position[0] - shelter.position[0];
          const sdz = gp.position[2] - shelter.position[2];
          if (sdx * sdx + sdz * sdz < shelter.radius * shelter.radius) {
            inShelter = true;
            break;
          }
        }
      }

      gp.inShelter = inShelter;
      gp.doorProtection = false;
      gp.currentRoomId = playerRoom ? playerRoom.id : null;

      // ── Directional sun exposure check ──
      // For each visible sun, determine if the player is exposed to it.
      // - Overhead sun (elevation > 45°): only shelter zones block damage
      // - Lateral sun (elevation <= 45°): raycast checks if a wall/barrier blocks the sun
      const [px, , pz] = gp.position;
      let visibleSunCount = 0;
      let exposedSunCount = 0;

      for (let i = 0; i < 3; i++) {
        const sunPos = sunSim.sunPositions[i];
        if (!isSunVisible(sunPos)) continue;
        visibleSunCount++;

        const elevation = getSunElevation(sunPos);

        if (elevation > OVERHEAD_ELEVATION) {
          // Overhead sun — only being inside a room (shelter zone) protects
          if (!inShelter) {
            exposedSunCount++;
          }
        } else {
          // Lateral sun — walls/barriers can block the radiation
          if (inShelter) {
            // Inside room → protected from all directions
            continue;
          }
          const [dirX, dirZ] = getSunDirection2D(px, pz, sunPos);
          const blocked = isRayBlockedByWalls(px, pz, dirX, dirZ, occlusionCtx);
          if (!blocked) {
            exposedSunCount++;
          }
        }
      }

      // Exposure ratio: 0 = fully protected, 1 = fully exposed
      // When no suns are visible (chaosIce), cold damage uses a flat rate
      const exposureRatio = visibleSunCount > 0
        ? exposedSunCount / visibleSunCount
        : 0;

      // Build damage source and calculate damage
      const sources: string[] = [];
      let damage = 0;

      if (currentEra === 'chaosInferno') {
        // Ambient heat: always applies during chaosInferno (only shelter blocks it)
        if (!inShelter) {
          sources.push('heat');
          damage += INFERNO_AMBIENT_DPS * dt;

          // Extra directional damage from visible suns
          if (exposureRatio > 0) {
            damage += INFERNO_SUN_DPS * exposureRatio * dt;
          }
        }

        // Additional fire contact damage (proximity check — not affected by sun direction)
        for (const [fx, , fz] of FIRE_POSITIONS) {
          const fdx = px - fx;
          const fdz = pz - fz;
          if (fdx * fdx + fdz * fdz < FIRE_DAMAGE_RADIUS * FIRE_DAMAGE_RADIUS) {
            if (!sources.includes('fire')) sources.push('fire');
            damage += FIRE_CONTACT_DPS * dt;
            break;
          }
        }
      } else if (currentEra === 'chaosIce') {
        // Cold damage — no visible suns, ambient cold everywhere
        // Shelter fully protects; door protection reduces by 50%
        if (!inShelter) {
          sources.push('cold');
          damage += ICE_DPS * dt;
        }
      } else if (currentEra === 'chaosGravity') {
        // Tidal stress damage — gravitational anomalies tear at the ship
        // Shelter fully protects; door protection reduces by 30% (less effective than thermal)
        if (!inShelter) {
          sources.push('gravity');
          damage += GRAVITY_TIDAL_DPS * dt;
        }
      }

      // Oxygen depletion damage — when ship oxygen is empty, everyone suffocates
      // (shelter does NOT protect — the whole ship has no O2)
      if (mazeSnapshot.shipOxygen <= 0) {
        sources.push('oxygen');
        damage += NO_OXYGEN_DPS * dt;
      }

      // Room oxygen suffocation — sealed room ran out of O2
      if (inShelter && playerRoom) {
        const rO2 = roomOxygen.get(playerRoom.id) ?? ROOM_OXYGEN_MAX;
        if (rO2 <= 0) {
          if (!sources.includes('oxygen')) sources.push('oxygen');
          damage += ROOM_OXYGEN_SUFFOCATION_DPS * dt;
        }
      }

      gp.damageSource = (damage > 0 && sources.length > 0) ? sources.join('+') : 'none';

      if (damage > 0) {
        gp.health = Math.max(0, gp.health - damage);
      } else if (currentEra === 'stable') {
        gp.health = Math.min(gp.maxHealth, gp.health + STABLE_REGEN_DPS * dt);
      }

      // Death by environmental damage → become ghost
      if (gp.health <= 0) {
        if (options?.devMode) {
          gp.health = 1;
        } else {
          gp.health = 0;
          gp.isAlive = false;
          gp.isGhost = true;
          const deathCause = sources.join('+') || 'environment';
          const body = createDeadBody(gp);
          deadBodies.set(body.bodyId, body);
          io.to(gp.socketId).emit('ghost:death-screen', { cause: deathCause, killerId: null });
          io.to(roomCode).emit('kill:occurred', {
            killerId: gp.socketId,
            victimId: gp.socketId,
            bodyId: body.bodyId,
            bodyPosition: { x: gp.position[0], y: gp.position[1], z: gp.position[2] },
          });
        }
      }
    }

    // Build snapshot
    const playersSnapshot: Record<string, PlayerSnapshot> = {};
    for (const [, gp] of gamePlayers) {
      playersSnapshot[gp.socketId] = {
        position: [...gp.position],
        rotation: [...gp.rotation],
        isAlive: gp.isAlive,
        isHidden: gp.isHidden,
        isInvisible: gp.isInvisible,
        isImpermeable: gp.isImpermeable,
        isElevated: false,
        speedMultiplier: gp.speedMultiplier,
        lastProcessedInput: gp.lastProcessedInput,
        powerActive: gp.powerActive,
        powerActiveEnd: gp.powerActiveEnd,
        powerCooldownEnd: gp.powerCooldownEnd,
        mindControlTargetId: gp.mindControlTargetToken
          ? (findSocketIdByToken(gamePlayers, gp.mindControlTargetToken) ?? null)
          : null,
        color: gp.color,
        power: gp.power as PowerType,
        health: Math.round(gp.health),
        maxHealth: gp.maxHealth,
        damageSource: gp.damageSource,
        inShelter: gp.inShelter,
        doorProtection: gp.doorProtection,
        isGhost: gp.isGhost,
        ghostPossessTargetId: gp.ghostPossessTargetToken
          ? (findSocketIdByToken(gamePlayers, gp.ghostPossessTargetToken) ?? null)
          : null,
        powerUsesLeft: gp.powerUsesLeft,
        metamorphEndTime: gp.isMetamorphed ? gp.metamorphEndTime : 0,
        isUnderground: gp.isUnderground,
        currentPipeNodeId: gp.currentPipeNodeId,
        undergroundTimeLeft: gp.isUnderground && gp.undergroundEnteredAt > 0
          ? Math.max(0, 40 - (now - gp.undergroundEnteredAt) / 1000)
          : 0,
        pipeCooldownEnd: gp.pipeCooldownEnd,
        roomOxygen: gp.currentRoomId
          ? Math.round(roomOxygen.get(gp.currentRoomId) ?? ROOM_OXYGEN_MAX)
          : -1,
      };
    }

    const snapshot: StateSnapshot = {
      seq: tickSeq,
      timestamp: now,
      players: playersSnapshot,
      maze: {
        doorStates: mazeSnapshot.doorStates,
        lightStates: mazeSnapshot.lightStates,
        dynamicWallStates: mazeSnapshot.dynamicWallStates,
        muralhaWalls,
        taskStates: mazeSnapshot.taskStates,
        pipeLockStates: mazeSnapshot.pipeLockStates,
        disabledGenerators: mazeSnapshot.disabledGenerators,
        shipOxygen: mazeSnapshot.shipOxygen,
      },
      currentEra,
      eraGravity,
      eraDescription,
      shipOxygen: Math.round(mazeSnapshot.shipOxygen),
      oxygenRefillPlayerId: (() => {
        for (const [, rgp] of gamePlayers) {
          if (rgp.oxygenRefillGeneratorId) return rgp.socketId;
        }
        return null;
      })(),
      bodies: (() => {
        const arr: Array<{ bodyId: string; victimId: string; victimColor: string; position: [number, number, number] }> = [];
        for (const [, b] of deadBodies) {
          if (!b.reported) {
            arr.push({ bodyId: b.bodyId, victimId: b.victimId, victimColor: b.victimColor, position: b.position });
          }
        }
        return arr;
      })(),
    };

    io.to(roomCode).emit('game:state-snapshot', snapshot);

    // Check game end conditions after each tick
    onCheckEndConditions?.();
  }, TICK_INTERVAL);

  return interval;
}

function findSocketIdByToken(gamePlayers: Map<string, GamePlayerState>, token: string): string | undefined {
  return gamePlayers.get(token)?.socketId;
}

// ===== Power Activation =====

export function activatePower(
  io: Server<ClientEvents, ServerEvents>,
  roomCode: string,
  gp: GamePlayerState,
  gamePlayers: Map<string, GamePlayerState>,
  targetId?: string,
  mazeSnapshot?: MazeSnapshot,
  wallPosition?: [number, number],
  currentEra?: string,
  teleportPosition?: [number, number],
  teleportFromMap?: boolean,
): boolean {
  const now = Date.now();
  const powerType = gp.power as PowerType;
  const config = POWER_CONFIGS[powerType];
  if (!config) return false;

  // Check cooldown
  if (now < gp.powerCooldownEnd) return false;
  // Already active → toggle off
  if (gp.powerActive) {
    deactivatePower(io, roomCode, gp, gamePlayers, mazeSnapshot);
    return true;
  }

  // Range validation for target-based powers
  if (config.requiresTarget && targetId) {
    const targetToken = findTokenBySocketId(gamePlayers, targetId);
    const target = targetToken ? gamePlayers.get(targetToken) : null;
    if (target && config.targetRange) {
      const dx = target.position[0] - gp.position[0];
      const dz = target.position[2] - gp.position[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > config.targetRange) return false;
    }
  }

  // Prevent Metamorph activation while already transformed
  if (powerType === PowerType.METAMORPH && gp.isMetamorphed) return false;

  gp.powerActive = true;
  // MURALHA duration halved during chaosInferno (heat era)
  let effectiveDuration = config.duration;
  if (powerType === PowerType.MURALHA && currentEra === 'chaosInferno') {
    effectiveDuration = Math.round(effectiveDuration * 0.5);
  }
  gp.powerActiveEnd = effectiveDuration > 0 ? now + effectiveDuration : 0;

  let copiedPower: PowerType | undefined;

  // Apply power-specific effects
  switch (powerType) {
    case PowerType.INVISIBLE:
      gp.isInvisible = true;
      break;

    case PowerType.FLASH:
      gp.baseSpeedMultiplier = gp.speedMultiplier;
      gp.speedMultiplier = 3;
      break;

    case PowerType.IMPERMEABLE:
      gp.isImpermeable = true;
      break;

    case PowerType.MURALHA: {
      // Check charges remaining
      if (gp.powerUsesLeft <= 0) {
        gp.powerActive = false;
        return false;
      }

      let cx: number;
      let cz: number;
      let dirX: number;
      let dirZ: number;

      if (wallPosition) {
        // Place wall at the mouse aim position (ground raycast from client)
        cx = wallPosition[0];
        cz = wallPosition[1];
        // Wall perpendicular to the line from player to aim point
        dirX = cx - gp.position[0];
        dirZ = cz - gp.position[2];
        const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
        if (len > 0.01) { dirX /= len; dirZ /= len; }
        else { dirX = 0; dirZ = 1; }
      } else {
        // Fallback: place in front of player based on facing direction
        const [, qy, , qw] = gp.rotation;
        const yaw = Math.atan2(2 * (qw * qy), 1 - 2 * (qy * qy));
        dirX = Math.sin(yaw);
        dirZ = -Math.cos(yaw);
        cx = gp.position[0] + dirX * 2;
        cz = gp.position[2] + dirZ * 2;
      }

      // Perpendicular direction for wall width
      const perpX = -dirZ;
      const perpZ = dirX;
      const halfLen = 3; // 6 units wide

      const wallId = `${gp.socketId}_${gp.muralhaNextWallId++}`;
      gp.muralhaWalls.push({
        wallId,
        start: [cx - perpX * halfLen, cz - perpZ * halfLen],
        end: [cx + perpX * halfLen, cz + perpZ * halfLen],
        expiresAt: now + effectiveDuration,
      });

      gp.powerUsesLeft--;
      gp.powerActive = false; // instant placement (like teleport)
      if (gp.powerUsesLeft > 0) {
        // Short cooldown between charges (2s)
        gp.powerCooldownEnd = now + 2000;
      } else {
        // Full cooldown after all charges used
        gp.powerCooldownEnd = now + config.cooldown;
      }
      break;
    }

    case PowerType.MIND_CONTROLLER: {
      // Requires explicit targetId from client target selector
      if (!targetId) {
        gp.powerActive = false;
        return false;
      }
      const targetToken = findTokenBySocketId(gamePlayers, targetId);
      if (!targetToken) {
        gp.powerActive = false;
        return false;
      }
      gp.mindControlTargetToken = targetToken;
      break;
    }

    case PowerType.METAMORPH: {
      // Requires explicit targetId from client target selector
      if (!targetId) {
        gp.powerActive = false;
        return false;
      }
      const morphTargetToken = findTokenBySocketId(gamePlayers, targetId);
      if (!morphTargetToken) {
        gp.powerActive = false;
        return false;
      }
      const target = gamePlayers.get(morphTargetToken);
      if (!target) {
        gp.powerActive = false;
        return false;
      }
      console.log(`[METAMORPH] ${gp.name} (${gp.color}) → copying ${target.name} (${target.color}) + power ${target.power}`);
      gp.originalColor = gp.color;
      gp.originalPower = gp.power;
      gp.color = target.color;
      gp.power = target.power;
      gp.isMetamorphed = true;
      gp.metamorphEndTime = now + config.duration;
      copiedPower = target.power as PowerType;
      // Metamorph is a timed transformation, not a toggle — mark as not active
      gp.powerActive = false;
      gp.powerActiveEnd = 0;
      // Reset cooldown so copied power is immediately usable
      gp.powerCooldownEnd = 0;
      break;
    }

    case PowerType.TELEPORT: {
      // Check charges remaining
      if (gp.powerUsesLeft <= 0) {
        gp.powerActive = false;
        return false;
      }
      // Teleport to the position sent by client (aim point or map click)
      if (teleportPosition) {
        gp.position = [teleportPosition[0], 0, teleportPosition[1]];
      } else {
        // Fallback: teleport 8 units forward in facing direction
        const [, qy, , qw] = gp.rotation;
        const yaw = Math.atan2(2 * (qw * qy), 1 - 2 * (qy * qy));
        gp.position = [
          gp.position[0] + Math.sin(yaw) * 8,
          0,
          gp.position[2] - Math.cos(yaw) * 8,
        ];
      }

      if (teleportFromMap) {
        // Map teleport: consume ALL charges, recharge one by one via cooldown
        gp.powerUsesLeft = 0;
      } else {
        // Quick-press teleport: consume 1 charge
        gp.powerUsesLeft--;
      }

      gp.powerActive = false; // instant
      if (gp.powerUsesLeft > 0) {
        // Short cooldown between charges (1s)
        gp.powerCooldownEnd = now + 1000;
      } else {
        // Full cooldown to recharge first charge
        gp.powerCooldownEnd = now + config.cooldown;
      }
      break;
    }

    case PowerType.MEDIC: {
      // Requires explicit targetId from client target selector
      if (!targetId) {
        gp.powerActive = false;
        return false;
      }
      const medicTargetToken = findTokenBySocketId(gamePlayers, targetId);
      if (medicTargetToken) {
        const target = gamePlayers.get(medicTargetToken);
        if (target) target.hasShield = true;
      }
      gp.powerActive = false; // instant
      gp.powerCooldownEnd = now + config.cooldown;
      break;
    }

    case PowerType.HACKER:
      // Hacker becomes invisible while power is active
      gp.isInvisible = true;
      gp.hackerLockedDoors = [];
      gp.hackerToggledLights = [];
      gp.hackerToggledWalls = [];
      gp.hackerLockedPipes = [];
      gp.hackerDisabledGenerators = [];
      gp.hackerDrainCount = 0;
      break;

    case PowerType.PREDICTION: {
      // Check charges remaining
      if (gp.powerUsesLeft <= 0) {
        gp.powerActive = false;
        return false;
      }
      gp.powerUsesLeft--;
      // Duration-based (15s), auto-deactivates via game loop
      break;
    }

    default:
      break;
  }

  // Set cooldown for duration-based powers (applied on deactivation)
  if (config.duration > 0 && powerType !== PowerType.TELEPORT && powerType !== PowerType.MEDIC) {
    // Cooldown starts after power ends
  }

  io.to(roomCode).emit('power:activated', {
    playerId: gp.socketId,
    powerType,
    targetId: targetId ?? undefined,
    copiedPower,
  });

  return true;
}

export function deactivatePower(
  io: Server<ClientEvents, ServerEvents>,
  roomCode: string,
  gp: GamePlayerState,
  gamePlayers: Map<string, GamePlayerState>,
  mazeSnapshot?: MazeSnapshot,
): void {
  if (!gp.powerActive) return;

  const powerType = gp.power as PowerType;
  const config = POWER_CONFIGS[powerType];
  const now = Date.now();

  gp.powerActive = false;
  gp.powerActiveEnd = 0;

  // If player is metamorphed and deactivating the copied power,
  // apply cooldown for the copied power (not metamorph's cooldown)
  if (gp.isMetamorphed) {
    gp.powerCooldownEnd = now + (config?.cooldown ?? 0);
  } else {
    gp.powerCooldownEnd = now + (config?.cooldown ?? 0);
  }

  // Revert power-specific effects
  switch (powerType) {
    case PowerType.INVISIBLE:
      gp.isInvisible = false;
      break;

    case PowerType.FLASH:
      gp.speedMultiplier = gp.baseSpeedMultiplier;
      break;

    case PowerType.IMPERMEABLE:
      gp.isImpermeable = false;
      break;

    case PowerType.MURALHA:
      // Clear all active walls (safety fallback — normally walls expire individually)
      gp.muralhaWalls = [];
      break;

    case PowerType.MIND_CONTROLLER:
      gp.mindControlTargetToken = null;
      gp.mindControlInput = null;
      break;

    case PowerType.HACKER:
      gp.isInvisible = false;
      if (mazeSnapshot) {
        // Do NOT revert hacker-locked doors/pipes — they have 40s auto-expire timers
        // Revert toggled lights (current behavior)
        for (const lightId of gp.hackerToggledLights) {
          mazeSnapshot.lightStates[lightId] = true;
        }
        // Revert toggled walls (current behavior)
        for (const wallId of gp.hackerToggledWalls) {
          mazeSnapshot.dynamicWallStates[wallId] = true;
        }
        // Do NOT revert disabled generators — they auto-expire
      }
      gp.hackerLockedDoors = [];
      gp.hackerToggledLights = [];
      gp.hackerToggledWalls = [];
      gp.hackerLockedPipes = [];
      gp.hackerDisabledGenerators = [];
      break;

    case PowerType.PREDICTION:
      // No effects to revert — overlay is client-side
      break;

    default:
      break;
  }

  io.to(roomCode).emit('power:ended', { playerId: gp.socketId, powerType });
}

function findTokenBySocketId(gamePlayers: Map<string, GamePlayerState>, socketId: string): string | null {
  for (const [token, gp] of gamePlayers) {
    if (gp.socketId === socketId) return token;
  }
  return null;
}

function findRandomOtherPlayerToken(source: GamePlayerState, gamePlayers: Map<string, GamePlayerState>): string | null {
  const others: string[] = [];
  for (const [token, gp] of gamePlayers) {
    if (gp.socketId !== source.socketId) others.push(token);
  }
  if (others.length === 0) return null;
  return others[Math.floor(Math.random() * others.length)];
}

export function findNearbyPlayers(
  source: GamePlayerState,
  gamePlayers: Map<string, GamePlayerState>,
  range: number,
): Array<{ token: string; socketId: string; name: string; color: string; distance: number }> {
  const [sx, , sz] = source.position;
  const results: Array<{ token: string; socketId: string; name: string; color: string; distance: number }> = [];

  for (const [token, gp] of gamePlayers) {
    if (gp.socketId === source.socketId || !gp.isAlive) continue;
    const dx = gp.position[0] - sx;
    const dz = gp.position[2] - sz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist <= range) {
      results.push({ token, socketId: gp.socketId, name: gp.name, color: gp.color, distance: Math.round(dist * 10) / 10 });
    }
  }

  return results.sort((a, b) => a.distance - b.distance);
}

// ===== Kill Attempt (shadow tries to kill a crew member) =====

const KILL_RANGE = 3.0;
const KILL_RANGE_SQ = KILL_RANGE * KILL_RANGE;

export function attemptKill(
  io: Server<ClientEvents, ServerEvents>,
  roomCode: string,
  attacker: GamePlayerState,
  gamePlayers: Map<string, GamePlayerState>,
  targetId: string,
  killCooldown: number,
  deadBodies: Map<string, DeadBody>,
  devMode?: boolean,
): { success: boolean; bodyId?: string } {
  // Only shadows can kill
  if (attacker.role !== 'shadow') return { success: false };
  if (!attacker.isAlive) return { success: false };

  // Kill cooldown check
  const now = Date.now();
  if (now < attacker.killCooldownEnd) return { success: false };

  // Find target by socketId
  let target: GamePlayerState | null = null;
  for (const [, gp] of gamePlayers) {
    if (gp.socketId === targetId) { target = gp; break; }
  }
  if (!target || !target.isAlive || target.isGhost) return { success: false };

  // In dev mode, targets are immune to kills
  if (devMode) {
    attacker.killCooldownEnd = now + killCooldown;
    return { success: false };
  }

  // Target is immune if impermeable
  if (target.isImpermeable) return { success: false };

  // Target has shield (Medic power)
  if (target.hasShield) {
    target.hasShield = false;
    attacker.killCooldownEnd = now + killCooldown;
    return { success: false };
  }

  // Range check
  const dx = target.position[0] - attacker.position[0];
  const dz = target.position[2] - attacker.position[2];
  if (dx * dx + dz * dz > KILL_RANGE_SQ) return { success: false };

  // Execute kill
  target.isAlive = false;
  target.isGhost = true;
  target.health = 0;
  attacker.killCooldownEnd = now + killCooldown;

  // Create dead body
  const body = createDeadBody(target);
  deadBodies.set(body.bodyId, body);

  io.to(target.socketId).emit('ghost:death-screen', { cause: 'killed', killerId: attacker.socketId });
  io.to(roomCode).emit('kill:occurred', {
    killerId: attacker.socketId,
    victimId: target.socketId,
    bodyId: body.bodyId,
    bodyPosition: { x: target.position[0], y: target.position[1], z: target.position[2] },
  });

  return { success: true, bodyId: body.bodyId };
}

// ===== Door Interaction (player presses E near a door) =====

export function interactDoor(
  gp: GamePlayerState,
  doorId: string,
  mazeLayout: MazeLayout,
  mazeSnapshot: MazeSnapshot,
): boolean {
  const door = mazeLayout.doors.find((d) => d.id === doorId);
  if (!door) return false;

  const doorState = mazeSnapshot.doorStates[doorId];
  if (!doorState) return false;

  // Locked doors cannot be opened by normal interaction
  if (doorState.isLocked) return false;

  // Check proximity
  const dx = gp.position[0] - door.position[0];
  const dz = gp.position[2] - door.position[2];
  const distSq = dx * dx + dz * dz;
  if (distSq > DOOR_INTERACT_RANGE * DOOR_INTERACT_RANGE) return false;

  // Toggle door
  doorState.isOpen = !doorState.isOpen;
  return true;
}

// ===== Door Lock (player presses R near a door to lock/unlock) =====

export function lockDoor(
  gp: GamePlayerState,
  doorId: string,
  mazeLayout: MazeLayout,
  mazeSnapshot: MazeSnapshot,
): boolean {
  const door = mazeLayout.doors.find((d) => d.id === doorId);
  if (!door) return false;

  const doorState = mazeSnapshot.doorStates[doorId];
  if (!doorState) return false;

  // Check proximity
  const dx = gp.position[0] - door.position[0];
  const dz = gp.position[2] - door.position[2];
  const distSq = dx * dx + dz * dz;
  if (distSq > DOOR_INTERACT_RANGE * DOOR_INTERACT_RANGE) return false;

  if (doorState.isLocked) {
    // Hacker locks are unbreakable until they auto-expire
    if (doorState.hackerLockExpiresAt > 0 && Date.now() < doorState.hackerLockExpiresAt) return false;
    // 15-second cooldown before normal locks can be unlocked
    if (doorState.lockedAt > 0 && Date.now() - doorState.lockedAt < 15_000) return false;
    // Normal unlock — allowed from either side
    doorState.isLocked = false;
    doorState.lockedBy = null;
    doorState.hackerLockExpiresAt = 0;
    doorState.lockedAt = 0;
  } else {
    // Lock — only allowed from INSIDE a room
    // Determine which cell the player is in
    const halfMap = (mazeLayout.gridSize * mazeLayout.cellSize) / 2;
    const playerCol = Math.floor((gp.position[0] + halfMap) / mazeLayout.cellSize);
    const playerRow = Math.floor((gp.position[2] + halfMap) / mazeLayout.cellSize);

    // The door connects cell (door.row, door.col) to an adjacent cell
    const sideOffsets: Record<string, [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
    const [dr, dc] = sideOffsets[door.side] ?? [0, 0];
    const cellARow = door.row;
    const cellACol = door.col;
    const cellBRow = door.row + dr;
    const cellBCol = door.col + dc;

    // Check which side the player is on
    let playerIsInRoom = false;
    if (playerRow === cellARow && playerCol === cellACol) {
      playerIsInRoom = mazeLayout.rooms.some((r) => r.row === cellARow && r.col === cellACol);
    } else if (playerRow === cellBRow && playerCol === cellBCol) {
      playerIsInRoom = mazeLayout.rooms.some((r) => r.row === cellBRow && r.col === cellBCol);
    }

    if (!playerIsInRoom) return false;

    doorState.isOpen = false;
    doorState.isLocked = true;
    doorState.lockedBy = gp.socketId;
    doorState.hackerLockExpiresAt = 0; // normal player lock — no auto-expire
    doorState.lockedAt = Date.now();
  }

  return true;
}

// ===== Task Interaction (player interacts with a task station) =====

const TASK_INTERACT_RANGE_SQ = 5.0 * 5.0;

export function startTask(
  gp: GamePlayerState,
  taskId: string,
  mazeLayout: MazeLayout,
  mazeSnapshot: MazeSnapshot,
): { ok: boolean; reason: string } {
  const task = mazeLayout.tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, reason: 'task_not_found' };

  // Shadow: can interact with ANY task (fake interaction, no global progress)
  if (gp.role === 'shadow') {
    // Skip assignment check entirely
  }
  // Crew: must be assigned OR have completed all their own tasks (helper mode)
  else if (!gp.assignedTasks.includes(taskId)) {
    const allMyDone = gp.assignedTasks.every(tid =>
      mazeSnapshot.taskStates[tid]?.completionState === 'completed');
    if (!allMyDone) {
      console.log(`[TASK] startTask REJECTED for ${gp.name}: task ${taskId} not in assignedTasks [${gp.assignedTasks.join(',')}]`);
      return { ok: false, reason: 'not_assigned' };
    }
  }
  const taskState = mazeSnapshot.taskStates[taskId];
  if (!taskState) return { ok: false, reason: 'no_task_state' };
  if (taskState.completionState === 'completed') return { ok: false, reason: 'already_completed' };
  if (taskState.activePlayerId && taskState.activePlayerId !== gp.socketId) {
    console.log(`[TASK] startTask REJECTED for ${gp.name}: task ${taskId} in use by ${taskState.activePlayerId}`);
    return { ok: false, reason: 'in_use' };
  }
  if (gp.activeTaskId && gp.activeTaskId !== taskId) {
    console.log(`[TASK] startTask REJECTED for ${gp.name}: already doing task ${gp.activeTaskId}`);
    return { ok: false, reason: 'already_busy' };
  }
  const dx = gp.position[0] - task.position[0];
  const dz = gp.position[2] - task.position[2];
  const distSq = dx * dx + dz * dz;
  if (distSq > TASK_INTERACT_RANGE_SQ) {
    console.log(`[TASK] startTask REJECTED for ${gp.name}: too far (distSq=${distSq.toFixed(1)}, max=${TASK_INTERACT_RANGE_SQ})`);
    return { ok: false, reason: 'too_far' };
  }
  taskState.completionState = 'in_progress';
  taskState.activePlayerId = gp.socketId;
  gp.activeTaskId = taskId;
  console.log(`[TASK] ${gp.name} started task ${taskId}`);
  return { ok: true, reason: '' };
}

export function completeTask(
  gp: GamePlayerState,
  taskId: string,
  mazeSnapshot: MazeSnapshot,
): boolean {
  const taskState = mazeSnapshot.taskStates[taskId];
  if (!taskState) {
    console.log(`[TASK] completeTask REJECTED for ${gp.name}: no state for task ${taskId}`);
    return false;
  }
  if (taskState.activePlayerId !== gp.socketId) {
    console.log(`[TASK] completeTask REJECTED for ${gp.name}: activePlayerId=${taskState.activePlayerId} !== ${gp.socketId}`);
    return false;
  }
  if (taskState.completionState !== 'in_progress') {
    console.log(`[TASK] completeTask REJECTED for ${gp.name}: state=${taskState.completionState} (expected in_progress)`);
    return false;
  }

  if (gp.role === 'shadow') {
    // Shadows fake-complete: revert to pending (no real progress)
    taskState.completionState = 'pending';
    taskState.activePlayerId = null;
    gp.activeTaskId = null;
    console.log(`[TASK] ${gp.name} (shadow) fake-completed task ${taskId}`);
    return true; // still emit event so client closes overlay
  }

  taskState.completionState = 'completed';
  taskState.completedByPlayerId = gp.socketId;
  taskState.activePlayerId = null;
  gp.activeTaskId = null;
  console.log(`[TASK] ${gp.name} completed task ${taskId}`);
  return true;
}

export function cancelTask(
  gp: GamePlayerState,
  taskId: string,
  mazeSnapshot: MazeSnapshot,
): boolean {
  const taskState = mazeSnapshot.taskStates[taskId];
  if (!taskState) return false;
  if (taskState.activePlayerId !== gp.socketId) return false;
  taskState.completionState = 'pending';
  taskState.activePlayerId = null;
  gp.activeTaskId = null;
  return true;
}

// ===== Ghost Task (ghosts can do ANY task, no proximity/assignment check) =====

export function ghostStartTask(
  gp: GamePlayerState,
  taskId: string,
  mazeLayout: MazeLayout,
  mazeSnapshot: MazeSnapshot,
): boolean {
  const task = mazeLayout.tasks.find((t) => t.id === taskId);
  if (!task) return false;
  const taskState = mazeSnapshot.taskStates[taskId];
  if (!taskState || taskState.completionState === 'completed') return false;
  if (taskState.activePlayerId && taskState.activePlayerId !== gp.socketId) return false;
  if (gp.activeTaskId && gp.activeTaskId !== taskId) return false;
  taskState.completionState = 'in_progress';
  taskState.activePlayerId = gp.socketId;
  gp.activeTaskId = taskId;
  return true;
}
