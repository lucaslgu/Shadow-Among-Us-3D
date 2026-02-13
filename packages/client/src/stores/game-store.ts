import { create } from 'zustand';
import type {
  GamePhase,
  PlayerRole,
  PowerType,
  PlayerSnapshot,
  StateSnapshot,
  InputSnapshot,
  MazeLayout,
  MazeSnapshot,
  CollisionContext,
  TaskType,
  TaskCompletionState,
  CosmicScenario,
  NearbyTarget,
} from '@shadow/shared';
import { applyMovement, yawToQuaternion } from '@shadow/shared';

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

interface GameState {
  // Game phase
  phase: GamePhase;

  // Local player
  localPlayerId: string | null;
  localRole: PlayerRole | null;
  localPower: PowerType | null;

  // Player info (name + color, set on game start)
  playerInfo: Record<string, { name: string; color: string }>;

  // Server snapshot state
  players: Record<string, PlayerSnapshot>;
  snapshotBuffer: StateSnapshot[];
  lastServerSeq: number;

  // Client-side prediction
  pendingInputs: InputSnapshot[];
  localPosition: [number, number, number];
  localRotation: [number, number, number, number];

  // Chat
  chatMessages: ChatMessage[];

  // Maze
  mazeLayout: MazeLayout | null;
  mazeSnapshot: MazeSnapshot | null;
  currentEra: string | null;

  // Cosmic scenario (AI-generated)
  cosmicScenario: CosmicScenario | null;
  eraGravity: number | null;
  eraDescription: string | null;

  // Task overlay
  activeTaskId: string | null;
  activeTaskType: TaskType | null;
  taskOverlayVisible: boolean;
  assignedTasks: string[];

  // Nearest interactable task (for HUD prompt — rendered in screen space)
  nearestInteractTask: {
    displayName: string;
    taskType: TaskType;
    state: TaskCompletionState;
    isBusy: boolean;
  } | null;

  // Target selection (for powers that require a target)
  targetingMode: boolean;
  nearbyTargets: NearbyTarget[];

  // Teleport map overlay
  teleportMapOpen: boolean;

  // Loading screen
  loadedPlayerIds: string[];
  loadingTotalPlayers: number;

  // Ship oxygen
  shipOxygen: number;
  oxygenRefillPlayerId: string | null;

  // Ghost / Death state
  isGhost: boolean;
  deathCause: string | null;
  showDeathScreen: boolean;
  ghostPossessTarget: string | null;
  ghostPossessCooldownEnd: number;

  // Actions
  setPhase: (phase: GamePhase) => void;
  setLocalPlayer: (playerId: string) => void;
  setLocalRole: (role: PlayerRole, power: PowerType, playerInfo: Record<string, { name: string; color: string }>) => void;
  setMazeLayout: (layout: MazeLayout) => void;
  setCosmicScenario: (scenario: CosmicScenario) => void;
  applyServerSnapshot: (snapshot: StateSnapshot) => void;
  addPendingInput: (input: InputSnapshot) => void;
  updateLocalPosition: (position: [number, number, number], rotation: [number, number, number, number]) => void;
  addChatMessage: (msg: ChatMessage) => void;
  setAssignedTasks: (tasks: string[]) => void;
  openTaskOverlay: (taskId: string, taskType: TaskType) => void;
  closeTaskOverlay: () => void;
  updateTaskState: (taskId: string, completionState: TaskCompletionState, activePlayerId: string | null) => void;
  setNearestInteractTask: (info: GameState['nearestInteractTask']) => void;
  enterTargetingMode: (targets: NearbyTarget[]) => void;
  exitTargetingMode: () => void;
  openTeleportMap: () => void;
  closeTeleportMap: () => void;
  setLoadingProgress: (loadedPlayerIds: string[], totalPlayers: number) => void;
  setGhostState: (isGhost: boolean, deathCause: string | null) => void;
  dismissDeathScreen: () => void;
  setGhostPossessTarget: (targetId: string | null) => void;
  setGhostPossessCooldownEnd: (time: number) => void;
  reset: () => void;
}

const initialState = {
  phase: 'lobby' as GamePhase,
  localPlayerId: null as string | null,
  localRole: null as PlayerRole | null,
  localPower: null as PowerType | null,
  playerInfo: {} as Record<string, { name: string; color: string }>,
  players: {} as Record<string, PlayerSnapshot>,
  snapshotBuffer: [] as StateSnapshot[],
  lastServerSeq: 0,
  pendingInputs: [] as InputSnapshot[],
  localPosition: [0, 0, 0] as [number, number, number],
  localRotation: [0, 0, 0, 1] as [number, number, number, number],
  chatMessages: [] as ChatMessage[],
  mazeLayout: null as MazeLayout | null,
  mazeSnapshot: null as MazeSnapshot | null,
  currentEra: null as string | null,
  cosmicScenario: null as CosmicScenario | null,
  eraGravity: null as number | null,
  eraDescription: null as string | null,
  activeTaskId: null as string | null,
  activeTaskType: null as TaskType | null,
  taskOverlayVisible: false,
  assignedTasks: [] as string[],
  nearestInteractTask: null as GameState['nearestInteractTask'],
  targetingMode: false,
  nearbyTargets: [] as NearbyTarget[],
  teleportMapOpen: false,
  loadedPlayerIds: [] as string[],
  loadingTotalPlayers: 0,
  shipOxygen: 100,
  oxygenRefillPlayerId: null as string | null,
  isGhost: false,
  deathCause: null as string | null,
  showDeathScreen: false,
  ghostPossessTarget: null as string | null,
  ghostPossessCooldownEnd: 0,
};

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,

  setPhase: (phase) => set({ phase }),

  setLocalPlayer: (playerId) => set({ localPlayerId: playerId }),

  setLocalRole: (role, power, playerInfo) =>
    set({ localRole: role, localPower: power, playerInfo }),

  setMazeLayout: (layout) => set({ mazeLayout: layout }),

  setCosmicScenario: (scenario) => set({ cosmicScenario: scenario }),

  applyServerSnapshot: (snapshot) => {
    const state = get();
    const localId = state.localPlayerId;

    // Mutate snapshot buffer in-place (only read via getState() in useFrame)
    const buffer = state.snapshotBuffer;
    buffer.push(snapshot);
    if (buffer.length > 5) buffer.shift();

    // Maze state from snapshot
    const mazeUpdate: Partial<GameState> = {};
    if (snapshot.maze) {
      mazeUpdate.mazeSnapshot = snapshot.maze as MazeSnapshot;
    }
    if (snapshot.currentEra) {
      mazeUpdate.currentEra = snapshot.currentEra;
    }
    if (snapshot.eraGravity !== undefined) {
      mazeUpdate.eraGravity = snapshot.eraGravity;
    }
    if (snapshot.eraDescription !== undefined) {
      mazeUpdate.eraDescription = snapshot.eraDescription;
    }
    if (snapshot.shipOxygen !== undefined) {
      (mazeUpdate as any).shipOxygen = snapshot.shipOxygen;
    }
    if (snapshot.oxygenRefillPlayerId !== undefined) {
      (mazeUpdate as any).oxygenRefillPlayerId = snapshot.oxygenRefillPlayerId;
    }

    if (!localId) {
      set({
        players: snapshot.players,
        lastServerSeq: snapshot.seq,
        ...mazeUpdate,
      });
      return;
    }

    const mySnapshot = snapshot.players[localId];
    if (!mySnapshot) {
      set({
        players: snapshot.players,
        lastServerSeq: snapshot.seq,
        ...mazeUpdate,
      });
      return;
    }

    // Reconciliation: discard acknowledged inputs via splice (avoid filter allocation)
    const inputs = state.pendingInputs;
    let firstUnacked = 0;
    while (firstUnacked < inputs.length && inputs[firstUnacked].seq <= mySnapshot.lastProcessedInput) {
      firstUnacked++;
    }
    if (firstUnacked > 0) inputs.splice(0, firstUnacked);

    // Build collision context for client-side prediction replay
    const mazeLayout = state.mazeLayout;
    const mazeState = snapshot.maze;
    const skipCollision = mySnapshot.isImpermeable || mySnapshot.isGhost;
    const collisionCtx: CollisionContext | undefined =
      !skipCollision && mazeLayout && mazeState
        ? {
            walls: mazeLayout.walls,
            doorStates: mazeState.doorStates,
            dynamicWallStates: mazeState.dynamicWallStates,
            muralhaWalls: mazeState.muralhaWalls,
          }
        : undefined;

    // Start from server position, replay unacknowledged inputs
    let pos: [number, number, number] = [mySnapshot.position[0], mySnapshot.position[1], mySnapshot.position[2]];
    let rot: [number, number, number, number] = [mySnapshot.rotation[0], mySnapshot.rotation[1], mySnapshot.rotation[2], mySnapshot.rotation[3]];

    for (const input of inputs) {
      pos = applyMovement(pos, input, 1 / 20, undefined, collisionCtx);
      rot = yawToQuaternion(input.mouseX);
    }

    // Sync localPower from server snapshot (handles Metamorph power swap)
    const powerUpdate: Partial<GameState> = {};
    if (mySnapshot.power && mySnapshot.power !== state.localPower) {
      powerUpdate.localPower = mySnapshot.power;
    }

    set({
      players: snapshot.players,
      lastServerSeq: snapshot.seq,
      localPosition: pos,
      localRotation: rot,
      ...mazeUpdate,
      ...powerUpdate,
    });
  },

  addPendingInput: (input) => {
    // Mutate in-place (only read via getState(), no React subscribers)
    get().pendingInputs.push(input);
  },

  updateLocalPosition: (position, rotation) =>
    set({ localPosition: position, localRotation: rotation }),

  addChatMessage: (msg) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, msg].slice(-100), // Keep last 100
    })),

  setAssignedTasks: (tasks) => set({ assignedTasks: tasks }),

  openTaskOverlay: (taskId, taskType) =>
    set({ activeTaskId: taskId, activeTaskType: taskType, taskOverlayVisible: true }),

  closeTaskOverlay: () =>
    set({ activeTaskId: null, activeTaskType: null, taskOverlayVisible: false }),

  updateTaskState: (taskId, completionState, activePlayerId) =>
    set((state) => {
      if (!state.mazeSnapshot) return {};
      const ts = state.mazeSnapshot.taskStates[taskId];
      if (!ts) return {};
      return {
        mazeSnapshot: {
          ...state.mazeSnapshot,
          taskStates: {
            ...state.mazeSnapshot.taskStates,
            [taskId]: { ...ts, completionState, activePlayerId },
          },
        },
      };
    }),

  setNearestInteractTask: (info) => set({ nearestInteractTask: info }),

  enterTargetingMode: (targets) => {
    document.exitPointerLock();
    set({ targetingMode: true, nearbyTargets: targets });
  },

  exitTargetingMode: () =>
    set({ targetingMode: false, nearbyTargets: [] }),

  openTeleportMap: () => {
    document.exitPointerLock();
    set({ teleportMapOpen: true });
  },

  closeTeleportMap: () =>
    set({ teleportMapOpen: false }),

  setLoadingProgress: (loadedPlayerIds, totalPlayers) =>
    set({ loadedPlayerIds, loadingTotalPlayers: totalPlayers }),

  setGhostState: (isGhost, deathCause) =>
    set({ isGhost, deathCause, showDeathScreen: isGhost }),

  dismissDeathScreen: () =>
    set({ showDeathScreen: false }),

  setGhostPossessTarget: (targetId) =>
    set({ ghostPossessTarget: targetId }),

  setGhostPossessCooldownEnd: (time) =>
    set({ ghostPossessCooldownEnd: time }),

  reset: () => set({ ...initialState, chatMessages: [], mazeLayout: null, mazeSnapshot: null, currentEra: null, cosmicScenario: null, eraGravity: null, eraDescription: null, activeTaskId: null, activeTaskType: null, taskOverlayVisible: false, assignedTasks: [], nearestInteractTask: null, targetingMode: false, nearbyTargets: [], loadedPlayerIds: [], loadingTotalPlayers: 0 }),
}));
