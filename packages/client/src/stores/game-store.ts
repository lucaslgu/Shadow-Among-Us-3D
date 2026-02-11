import { create } from 'zustand';
import type {
  GamePhase,
  PlayerRole,
  PowerType,
  PlayerSnapshot,
  StateSnapshot,
  InputSnapshot,
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

  // Actions
  setPhase: (phase: GamePhase) => void;
  setLocalPlayer: (playerId: string) => void;
  setLocalRole: (role: PlayerRole, power: PowerType, playerInfo: Record<string, { name: string; color: string }>) => void;
  applyServerSnapshot: (snapshot: StateSnapshot) => void;
  addPendingInput: (input: InputSnapshot) => void;
  updateLocalPosition: (position: [number, number, number], rotation: [number, number, number, number]) => void;
  addChatMessage: (msg: ChatMessage) => void;
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
};

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,

  setPhase: (phase) => set({ phase }),

  setLocalPlayer: (playerId) => set({ localPlayerId: playerId }),

  setLocalRole: (role, power, playerInfo) =>
    set({ localRole: role, localPower: power, playerInfo }),

  applyServerSnapshot: (snapshot) => {
    const state = get();
    const localId = state.localPlayerId;

    // Store snapshot in buffer (keep last 5 for interpolation)
    const buffer = [...state.snapshotBuffer, snapshot].slice(-5);

    if (!localId) {
      set({
        snapshotBuffer: buffer,
        players: snapshot.players,
        lastServerSeq: snapshot.seq,
      });
      return;
    }

    const mySnapshot = snapshot.players[localId];
    if (!mySnapshot) {
      set({
        snapshotBuffer: buffer,
        players: snapshot.players,
        lastServerSeq: snapshot.seq,
      });
      return;
    }

    // Reconciliation: discard acknowledged inputs, replay unacknowledged
    const unacknowledged = state.pendingInputs.filter(
      (inp) => inp.seq > mySnapshot.lastProcessedInput,
    );

    // Start from server position, replay unacknowledged inputs
    let pos: [number, number, number] = [...mySnapshot.position];
    let rot: [number, number, number, number] = [...mySnapshot.rotation];

    for (const input of unacknowledged) {
      pos = applyMovement(pos, input, 1 / 20);
      rot = yawToQuaternion(input.mouseX);
    }

    set({
      snapshotBuffer: buffer,
      players: snapshot.players,
      lastServerSeq: snapshot.seq,
      pendingInputs: unacknowledged,
      localPosition: pos,
      localRotation: rot,
    });
  },

  addPendingInput: (input) =>
    set((state) => ({
      pendingInputs: [...state.pendingInputs, input],
    })),

  updateLocalPosition: (position, rotation) =>
    set({ localPosition: position, localRotation: rotation }),

  addChatMessage: (msg) =>
    set((state) => ({
      chatMessages: [...state.chatMessages, msg].slice(-100), // Keep last 100
    })),

  reset: () => set({ ...initialState, chatMessages: [] }),
}));
