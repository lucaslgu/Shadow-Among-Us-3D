import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents, RoomListPage, RoomInfo, LobbyPlayer, GamePhase, PlayerRole, PowerType } from '@shadow/shared';
import { useGameStore } from './game-store.js';

// Session persistence keys
const SESSION_KEY = 'shadow_session_token';
const NAME_KEY = 'shadow_player_name';
const ROOM_KEY = 'shadow_room_code';

function saveSession(token: string, name: string, roomCode: string | null) {
  sessionStorage.setItem(SESSION_KEY, token);
  sessionStorage.setItem(NAME_KEY, name);
  if (roomCode) {
    sessionStorage.setItem(ROOM_KEY, roomCode);
  } else {
    sessionStorage.removeItem(ROOM_KEY);
  }
}

function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(ROOM_KEY);
}

function getSavedSession() {
  return {
    token: sessionStorage.getItem(SESSION_KEY),
    name: sessionStorage.getItem(NAME_KEY),
    roomCode: sessionStorage.getItem(ROOM_KEY),
  };
}

// Navigate function ref — injected by RouterSync component
let navigateFn: ((path: string) => void) | null = null;

export function setNavigate(fn: (path: string) => void) {
  navigateFn = fn;
}

interface NetworkState {
  socket: Socket<ServerEvents, ClientEvents> | null;
  connected: boolean;
  playerId: string | null;
  sessionToken: string | null;
  playerName: string;
  currentRoomCode: string | null;
  roomError: string | null;

  // Room listing
  roomList: RoomInfo[];
  roomListPage: number;
  roomListTotalPages: number;
  roomListTotal: number;
  roomListLoading: boolean;

  // Password prompt
  pendingJoinRoom: RoomInfo | null;

  // Lobby players
  lobbyPlayers: LobbyPlayer[];

  // Ready states
  readyStates: Record<string, boolean>;

  // Actions
  connect: () => void;
  disconnect: () => void;
  setPlayerName: (name: string) => void;
  createRoom: (password?: string, maxPlayers?: number) => void;
  joinRoom: (roomCode: string, password?: string) => void;
  leaveRoom: () => void;
  closeRoom: () => void;
  kickPlayer: (targetId: string) => void;
  transferHost: (targetId: string) => void;
  toggleReady: () => void;
  startGame: () => void;
  requestRoomList: (page?: number) => void;
  setPendingJoinRoom: (room: RoomInfo | null) => void;
  clearError: () => void;
}

const ROOMS_PER_PAGE = 6;

export const useNetworkStore = create<NetworkState>((set, get) => ({
  socket: null,
  connected: false,
  playerId: null,
  sessionToken: null,
  playerName: getSavedSession().name ?? '',
  currentRoomCode: null,
  roomError: null,

  roomList: [],
  roomListPage: 1,
  roomListTotalPages: 1,
  roomListTotal: 0,
  roomListLoading: false,

  pendingJoinRoom: null,

  lobbyPlayers: [],

  readyStates: {},

  connect: () => {
    if (get().socket) return;

    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
    const socket: Socket<ServerEvents, ClientEvents> = io(serverUrl, {
      transports: ['websocket'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('[Client] Connected to server');
      set({ connected: true });

      // Try to reconnect to previous session
      const saved = getSavedSession();
      if (saved.token && saved.roomCode) {
        console.log(`[Client] Attempting reconnect with session ${saved.token.slice(0, 8)}...`);
        socket.emit('player:reconnect', { sessionToken: saved.token });
      }
    });

    socket.on('connection:welcome', ({ playerId, sessionToken }) => {
      console.log(`[Client] Welcome! Player ID: ${playerId}`);
      set({ playerId, sessionToken });
      // Only save the new token if we don't have a pending reconnect
      const saved = getSavedSession();
      if (!saved.token || !saved.roomCode) {
        saveSession(sessionToken, get().playerName, null);
      }
    });

    socket.on('rooms:list', (data: RoomListPage) => {
      set({
        roomList: data.rooms,
        roomListPage: data.page,
        roomListTotalPages: data.totalPages,
        roomListTotal: data.total,
        roomListLoading: false,
      });
    });

    socket.on('room:created', ({ roomCode }) => {
      console.log(`[Client] Room created: ${roomCode}`);
      const { sessionToken, playerName } = get();
      set({ currentRoomCode: roomCode });
      if (sessionToken) saveSession(sessionToken, playerName, roomCode);
    });

    socket.on('room:joined', ({ gameState, lobbyPlayers }) => {
      const { playerName } = get();
      const roomCode = gameState.roomCode;
      set({
        currentRoomCode: roomCode,
        roomError: null,
        pendingJoinRoom: null,
        lobbyPlayers,
      });
      // Save session so reload reconnects
      const saved = getSavedSession();
      const token = saved.token ?? get().sessionToken;
      if (token) saveSession(token, playerName, roomCode);
      // Navigate to lobby
      navigateFn?.(`/lobby/${roomCode}`);
    });

    socket.on('room:reconnected', ({ gameState, lobbyPlayers }) => {
      const roomCode = gameState.roomCode;
      console.log(`[Client] Reconnected to room ${roomCode}`);
      set({
        currentRoomCode: roomCode,
        roomError: null,
        lobbyPlayers,
      });
      // Navigate to lobby
      navigateFn?.(`/lobby/${roomCode}`);
    });

    socket.on('room:error', ({ message }) => {
      set({ roomError: message });
    });

    socket.on('room:players', ({ players }) => {
      set({ lobbyPlayers: players });
    });

    socket.on('room:kicked', ({ reason }) => {
      console.log(`[Client] Kicked from room: ${reason}`);
      clearSession();
      set({ currentRoomCode: null, roomError: null, lobbyPlayers: [], readyStates: {} });
      useGameStore.getState().reset();
      navigateFn?.('/');
    });

    socket.on('room:closed', ({ reason }) => {
      console.log(`[Client] Room closed: ${reason}`);
      clearSession();
      set({ currentRoomCode: null, roomError: null, lobbyPlayers: [], readyStates: {} });
      useGameStore.getState().reset();
      navigateFn?.('/');
    });

    socket.on('player:ready', ({ playerId, ready }) => {
      set((state) => ({
        readyStates: { ...state.readyStates, [playerId]: ready },
      }));
    });

    socket.on('game:started', ({ role, power, playerInfo }) => {
      const gameStore = useGameStore.getState();
      const playerId = get().playerId;
      if (playerId) gameStore.setLocalPlayer(playerId);
      gameStore.setLocalRole(role as PlayerRole, power as PowerType, playerInfo);
      gameStore.setPhase('playing');
      const roomCode = get().currentRoomCode;
      navigateFn?.(`/game/${roomCode}`);
    });

    socket.on('game:state-snapshot', (snapshot) => {
      useGameStore.getState().applyServerSnapshot(snapshot);
    });

    socket.on('game:phase-change', ({ phase }) => {
      useGameStore.getState().setPhase(phase);
    });

    socket.on('chat:message', ({ playerId, text }) => {
      const lobbyPlayers = get().lobbyPlayers;
      const playerName = lobbyPlayers.find((p) => p.id === playerId)?.name ?? playerId.slice(0, 8);
      useGameStore.getState().addChatMessage({
        id: `${Date.now()}-${playerId}`,
        playerId,
        playerName,
        text,
        timestamp: Date.now(),
      });
    });

    socket.on('disconnect', () => {
      console.log('[Client] Disconnected from server');
      // Don't clear room/session on disconnect — we may reconnect
      set({ connected: false, playerId: null });
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false, playerId: null, currentRoomCode: null });
    }
  },

  setPlayerName: (name: string) => {
    set({ playerName: name });
    const token = getSavedSession().token ?? get().sessionToken;
    if (token) saveSession(token, name, get().currentRoomCode);
  },

  createRoom: (password?: string, maxPlayers?: number) => {
    const { socket, playerName } = get();
    if (!socket || !playerName.trim()) return;
    socket.emit('player:create-room', {
      name: playerName.trim(),
      password: password || undefined,
      maxPlayers,
    });
  },

  joinRoom: (roomCode: string, password?: string) => {
    const { socket, playerName } = get();
    if (!socket || !playerName.trim()) return;
    set({ roomError: null });
    socket.emit('player:join', {
      name: playerName.trim(),
      roomCode,
      password: password || undefined,
    });
  },

  leaveRoom: () => {
    const { socket } = get();
    if (socket) {
      socket.emit('player:leave-room');
    }
    clearSession();
    set({
      currentRoomCode: null,
      roomError: null,
      lobbyPlayers: [],
      readyStates: {},
    });
    useGameStore.getState().reset();
    navigateFn?.('/');
  },

  closeRoom: () => {
    const { socket } = get();
    if (socket) {
      socket.emit('player:close-room');
    }
    clearSession();
    set({
      currentRoomCode: null,
      roomError: null,
      lobbyPlayers: [],
      readyStates: {},
    });
    useGameStore.getState().reset();
    navigateFn?.('/');
  },

  kickPlayer: (targetId: string) => {
    const { socket } = get();
    if (socket) socket.emit('player:kick', { targetId });
  },

  transferHost: (targetId: string) => {
    const { socket } = get();
    if (socket) socket.emit('player:transfer-host', { targetId });
  },

  toggleReady: () => {
    const { socket, playerId, readyStates } = get();
    if (!socket || !playerId) return;
    const currentReady = readyStates[playerId] ?? false;
    socket.emit('player:ready', { ready: !currentReady });
  },

  startGame: () => {
    const { socket } = get();
    if (!socket) return;
    socket.emit('game:start');
  },

  requestRoomList: (page = 1) => {
    const { socket } = get();
    if (!socket) return;
    set({ roomListLoading: true });
    socket.emit('rooms:list', { page, limit: ROOMS_PER_PAGE });
  },

  setPendingJoinRoom: (room: RoomInfo | null) => set({ pendingJoinRoom: room, roomError: null }),

  clearError: () => set({ roomError: null }),
}));
