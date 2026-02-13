import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  ClientEvents,
  ServerEvents,
  RoomInfo,
  LobbyPlayer,
  GamePhase,
  InputSnapshot,
  MazeLayout,
  MazeSnapshot,
} from '@shadow/shared';
import { DEFAULT_GAME_SETTINGS, PowerType, POWER_CONFIGS, generateMaze, createInitialMazeSnapshot } from '@shadow/shared';
import type { CosmicScenario } from '@shadow/shared';
import { startGameLoop, activatePower, deactivatePower, findNearbyPlayers, attemptKill, interactDoor, startTask, completeTask, cancelTask, ghostStartTask, checkGameOver, createDeadBody, MAX_HEALTH, type GamePlayerState, type DeadBody } from './game/game-loop.js';
import { generateCosmicScenario } from './services/gemini.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const DISCONNECT_GRACE_MS = 30_000;

const app = express();
app.use(cors());

// Serve client build in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));

const httpServer = createServer(app);

const io = new Server<ClientEvents, ServerEvents>(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// ===== Room Storage =====

interface PlayerData {
  name: string;
  ready: boolean;
  joinedAt: number;
  color: string;
}

const PLAYER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6',
  '#e67e22', '#1abc9c', '#e84393', '#00cec9', '#6c5ce7',
  '#fd79a8', '#ffeaa7', '#dfe6e9', '#636e72', '#b2bec3',
];

interface MeetingState {
  reporterId: string;       // socketId who reported
  reportedBodyId: string | null;
  phase: 'discussion' | 'voting';
  phaseEndTime: number;
  votes: Map<string, string | null>;  // socketId -> targetSocketId | null (skip)
  preMeetingPositions: Map<string, [number, number, number]>;
  alivePlayers: Set<string>;  // socketIds of alive players at meeting start
  discussionTimer: ReturnType<typeof setTimeout> | null;
  votingTimer: ReturnType<typeof setTimeout> | null;
}

interface RoomData {
  roomCode: string;
  hostId: string;
  hostName: string;
  password: string | null;
  maxPlayers: number;
  phase: GamePhase;
  players: Map<string, PlayerData>;
  createdAt: number;
  gamePlayers: Map<string, GamePlayerState> | null;
  gameTickInterval: ReturnType<typeof setInterval> | null;
  mazeLayout: MazeLayout | null;
  mazeSnapshot: MazeSnapshot | null;
  cosmicScenario: CosmicScenario | null;
  loadedPlayers: Set<string>;
  currentEra: string;
  gameStartTime: number | null;
  endedGameRoles: Record<string, { name: string; color: string; role: string }> | null;
  deadBodies: Map<string, DeadBody>;
  meetingState: MeetingState | null;
}

const rooms = new Map<string, RoomData>();

// Session token -> session info (persists across socket reconnections)
interface SessionData {
  sessionToken: string;
  socketId: string;
  playerName: string;
  roomCode: string | null;
  disconnectedAt: number | null;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, SessionData>();
// Socket ID -> session token (for quick lookup)
const socketToSession = new Map<string, string>();

// ===== Helpers =====

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function generateSessionToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

function getRoomInfo(room: RoomData): RoomInfo {
  return {
    roomCode: room.roomCode,
    hostName: room.hostName,
    playerCount: room.players.size,
    maxPlayers: room.maxPlayers,
    hasPassword: room.password !== null,
    phase: room.phase,
  };
}

function getListableRooms(): RoomInfo[] {
  return Array.from(rooms.values())
    .filter((r) => r.phase === 'lobby' && r.players.size < r.maxPlayers)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(getRoomInfo);
}

function getNextAvailableColor(room: RoomData): string {
  const usedColors = new Set<string>();
  for (const [, p] of room.players) usedColors.add(p.color);
  for (const c of PLAYER_COLORS) {
    if (!usedColors.has(c)) return c;
  }
  return PLAYER_COLORS[0]; // fallback (should never happen with 15 colors / 15 max players)
}

function buildLobbyPlayers(room: RoomData): LobbyPlayer[] {
  const players: LobbyPlayer[] = [];
  for (const [token, playerData] of room.players) {
    const session = sessions.get(token);
    if (session) {
      players.push({
        id: session.socketId,
        name: playerData.name,
        isHost: session.socketId === room.hostId,
        color: playerData.color,
      });
    }
  }
  return players;
}

function broadcastPlayerList(room: RoomData) {
  io.to(room.roomCode).emit('room:players', { players: buildLobbyPlayers(room) });
}

function findSessionTokenBySocketId(socketId: string): string | null {
  for (const [token, session] of sessions) {
    if (session.socketId === socketId) return token;
  }
  return null;
}

function buildGameState(room: RoomData) {
  return {
    roomCode: room.roomCode,
    phase: room.phase,
    settings: { ...DEFAULT_GAME_SETTINGS, maxPlayers: room.maxPlayers },
    players: {},
    hostId: room.hostId,
  };
}

// ===== Game End Logic =====

function endGame(room: RoomData, winner: 'crew' | 'shadow', reason: string) {
  if (room.phase === 'lobby') return;

  // Stop game loop
  if (room.gameTickInterval) {
    clearInterval(room.gameTickInterval);
    room.gameTickInterval = null;
  }

  // Build roles reveal from active gamePlayers + endedGameRoles (players who left mid-game)
  const roles: Record<string, { name: string; color: string; role: string }> = {};
  if (room.gamePlayers) {
    for (const [, gp] of room.gamePlayers) {
      roles[gp.socketId] = { name: gp.name, color: gp.color, role: gp.role };
    }
  }
  if (room.endedGameRoles) {
    Object.assign(roles, room.endedGameRoles);
  }

  // Build stats
  let tasksCompleted = 0;
  let totalTasks = 0;
  if (room.mazeSnapshot) {
    const taskStates = Object.values(room.mazeSnapshot.taskStates);
    totalTasks = taskStates.length;
    tasksCompleted = taskStates.filter(t => t.completionState === 'completed').length;
  }
  const gameDurationSec = room.gameStartTime
    ? Math.round((Date.now() - room.gameStartTime) / 1000)
    : 0;

  // Emit game ended to ALL players in the room (including lobby-waiters)
  io.to(room.roomCode).emit('game:ended', {
    winner,
    reason,
    roles,
    stats: { tasksCompleted, totalTasks, gameDurationSec },
  });

  // Clear meeting timers
  if (room.meetingState) {
    if (room.meetingState.discussionTimer) clearTimeout(room.meetingState.discussionTimer);
    if (room.meetingState.votingTimer) clearTimeout(room.meetingState.votingTimer);
    room.meetingState = null;
  }

  // Reset room to lobby phase
  room.phase = 'lobby';
  room.gamePlayers = null;
  room.mazeLayout = null;
  room.mazeSnapshot = null;
  room.cosmicScenario = null;
  room.loadedPlayers = new Set();
  room.gameStartTime = null;
  room.endedGameRoles = null;
  room.deadBodies = new Map();

  // Reset all player ready states
  for (const [, playerData] of room.players) {
    playerData.ready = false;
  }

  console.log(`[Server] Game ended in room ${room.roomCode}: ${winner} wins (${reason})`);
}

function checkGameEndConditions(room: RoomData) {
  if (room.phase !== 'playing' || !room.gamePlayers) return;

  const players = Array.from(room.gamePlayers.values());

  // No active players left
  if (players.length === 0) {
    endGame(room, 'shadow', 'all_left');
    return;
  }

  const aliveCrew = players.filter(p => p.role === 'crew' && p.isAlive);
  const aliveShadows = players.filter(p => p.role === 'shadow' && p.isAlive);

  // All crew dead — shadows win
  if (aliveCrew.length === 0) {
    endGame(room, 'shadow', 'all_crew_dead');
    return;
  }

  // All shadows eliminated — crew wins
  if (aliveShadows.length === 0) {
    endGame(room, 'crew', 'shadow_eliminated');
    return;
  }

  // All tasks completed — crew wins
  if (room.mazeSnapshot) {
    const taskStates = Object.values(room.mazeSnapshot.taskStates);
    if (taskStates.length > 0 && taskStates.every(t => t.completionState === 'completed')) {
      endGame(room, 'crew', 'all_tasks_done');
      return;
    }
  }
}

// ===== Meeting System =====

function triggerMeeting(room: RoomData, reporterId: string, bodyId: string | null) {
  if (!room.gamePlayers || room.phase !== 'playing') return;

  // Stop game loop
  if (room.gameTickInterval) {
    clearInterval(room.gameTickInterval);
    room.gameTickInterval = null;
  }

  // Save pre-meeting positions & collect alive players
  const preMeetingPositions = new Map<string, [number, number, number]>();
  const alivePlayers = new Set<string>();
  for (const [, gp] of room.gamePlayers) {
    if (gp.isAlive) {
      preMeetingPositions.set(gp.socketId, [...gp.position]);
      alivePlayers.add(gp.socketId);
    }
    // Cancel any active tasks
    if (gp.activeTaskId) {
      gp.activeTaskId = null;
    }
    // Cancel oxygen refill
    gp.oxygenRefillGeneratorId = null;
    gp.oxygenRefillStartTime = 0;
  }

  // Teleport alive players in circle around center table
  const aliveList = Array.from(alivePlayers);
  const spawnRadius = 4;
  for (let i = 0; i < aliveList.length; i++) {
    const angle = (i / aliveList.length) * Math.PI * 2;
    for (const [, gp] of room.gamePlayers) {
      if (gp.socketId === aliveList[i]) {
        gp.position = [
          Math.cos(angle) * spawnRadius,
          0,
          Math.sin(angle) * spawnRadius,
        ];
        // Exit underground if in pipes
        gp.isUnderground = false;
        gp.currentPipeNodeId = null;
        break;
      }
    }
  }

  // Mark reported body
  if (bodyId) {
    const body = room.deadBodies.get(bodyId);
    if (body) body.reported = true;
  }

  const discussionTime = DEFAULT_GAME_SETTINGS.discussionTime;
  const now = Date.now();

  room.phase = 'meeting';
  room.meetingState = {
    reporterId,
    reportedBodyId: bodyId,
    phase: 'discussion',
    phaseEndTime: now + discussionTime,
    votes: new Map(),
    preMeetingPositions,
    alivePlayers,
    discussionTimer: null,
    votingTimer: null,
  };

  io.to(room.roomCode).emit('meeting:started', { reporterId, bodyId: bodyId ?? undefined });
  io.to(room.roomCode).emit('game:phase-change', { phase: 'meeting' });

  // Transition to voting after discussion time
  room.meetingState.discussionTimer = setTimeout(() => {
    transitionToVoting(room);
  }, discussionTime);

  console.log(`[Meeting] Meeting triggered in room ${room.roomCode} by ${reporterId} (bodyId: ${bodyId})`);
}

function transitionToVoting(room: RoomData) {
  if (!room.meetingState || room.phase !== 'meeting') return;

  const votingTime = DEFAULT_GAME_SETTINGS.votingTime;
  const now = Date.now();

  room.meetingState.phase = 'voting';
  room.meetingState.phaseEndTime = now + votingTime;

  io.to(room.roomCode).emit('meeting:voting-phase');

  // End meeting after voting time
  room.meetingState.votingTimer = setTimeout(() => {
    endMeeting(room);
  }, votingTime);

  console.log(`[Meeting] Voting phase started in room ${room.roomCode}`);
}

function endMeeting(room: RoomData) {
  if (!room.meetingState || !room.gamePlayers) return;

  const ms = room.meetingState;

  // Count votes
  const voteCounts = new Map<string, number>(); // targetSocketId -> count (null = skip)
  const skipKey = '__skip__';
  for (const [, targetId] of ms.votes) {
    const key = targetId ?? skipKey;
    voteCounts.set(key, (voteCounts.get(key) ?? 0) + 1);
  }

  // Add implicit skip votes from players who didn't vote
  for (const playerId of ms.alivePlayers) {
    if (!ms.votes.has(playerId)) {
      voteCounts.set(skipKey, (voteCounts.get(skipKey) ?? 0) + 1);
    }
  }

  // Find the most voted (tie = skip)
  let maxVotes = 0;
  let ejectedId: string | null = null;
  let tie = false;
  for (const [targetId, count] of voteCounts) {
    if (targetId === skipKey) continue;
    if (count > maxVotes) {
      maxVotes = count;
      ejectedId = targetId;
      tie = false;
    } else if (count === maxVotes) {
      tie = true;
    }
  }

  // Check if skip votes exceed the max voted player
  const skipVotes = voteCounts.get(skipKey) ?? 0;
  if (skipVotes >= maxVotes || tie) {
    ejectedId = null; // No one ejected
  }

  // Eject player
  if (ejectedId) {
    for (const [, gp] of room.gamePlayers) {
      if (gp.socketId === ejectedId) {
        gp.isAlive = false;
        gp.isGhost = true;
        gp.health = 0;
        io.to(gp.socketId).emit('ghost:death-screen', { cause: 'ejected', killerId: null });
        break;
      }
    }
  }

  // Convert votes to serializable format
  const votesRecord: Record<string, string | null> = {};
  for (const [voterId, targetId] of ms.votes) {
    votesRecord[voterId] = targetId;
  }

  io.to(room.roomCode).emit('vote:result', { ejectedId, votes: votesRecord });

  console.log(`[Meeting] Meeting ended in room ${room.roomCode}. Ejected: ${ejectedId ?? 'nobody'}`);

  // Resume game after 5 seconds (result display time)
  setTimeout(() => {
    resumeGame(room);
  }, 5000);
}

function resumeGame(room: RoomData) {
  if (!room.gamePlayers || !room.mazeLayout || !room.mazeSnapshot || !room.cosmicScenario) return;

  const ms = room.meetingState;

  // Restore pre-meeting positions for alive players
  if (ms) {
    for (const [, gp] of room.gamePlayers) {
      if (gp.isAlive) {
        const savedPos = ms.preMeetingPositions.get(gp.socketId);
        if (savedPos) {
          gp.position = [...savedPos];
        }
      }
    }
    // Clean up meeting timers
    if (ms.discussionTimer) clearTimeout(ms.discussionTimer);
    if (ms.votingTimer) clearTimeout(ms.votingTimer);
  }

  room.meetingState = null;
  room.phase = 'playing';
  io.to(room.roomCode).emit('game:phase-change', { phase: 'playing' });

  // Check game over conditions after ejection
  const result = checkGameOver(room.gamePlayers, room.mazeSnapshot);
  if (result.gameOver && result.winner && result.reason) {
    endGame(room, result.winner, result.reason);
    return;
  }

  // Restart game loop
  room.gameTickInterval = startGameLoop(
    io, room.roomCode, room.gamePlayers, room.mazeLayout, room.mazeSnapshot,
    room.cosmicScenario, room.deadBodies,
    (era) => { room.currentEra = era; },
    () => { checkGameEndConditions(room); },
  );

  console.log(`[Meeting] Game resumed in room ${room.roomCode}`);
}

function returnPlayerToLobby(room: RoomData, sessionToken: string, gp: GamePlayerState, sock: ReturnType<typeof io.sockets.sockets.get>) {
  if (!sock) return;

  // Track role for end-game reveal
  if (!room.endedGameRoles) room.endedGameRoles = {};
  room.endedGameRoles[gp.socketId] = { name: gp.name, color: gp.color, role: gp.role };

  // Remove from active game players
  room.gamePlayers!.delete(sessionToken);

  // Reset ready state
  const playerData = room.players.get(sessionToken);
  if (playerData) {
    playerData.ready = false;
  }

  // Send this player back to lobby view
  sock.emit('game:phase-change', { phase: 'lobby' });
  sock.emit('room:joined', {
    gameState: buildGameState(room),
    lobbyPlayers: buildLobbyPlayers(room),
  });

  // Notify everyone in the room
  io.to(room.roomCode).emit('game:player-returned-to-lobby', { playerName: gp.name });
  broadcastPlayerList(room);

  // Check if game should end
  checkGameEndConditions(room);
}

function removePlayerFromRoom(sessionToken: string) {
  const session = sessions.get(sessionToken);
  if (!session || !session.roomCode) return;

  const room = rooms.get(session.roomCode);
  const roomCode = session.roomCode;
  session.roomCode = null;

  if (!room) return;

  // Find this session's player entry (keyed by session token)
  const removedPlayerName = room.players.get(sessionToken)?.name;
  room.players.delete(sessionToken);

  // If a game is active, remove from gamePlayers and track role
  if (room.gamePlayers) {
    const gp = room.gamePlayers.get(sessionToken);
    if (gp) {
      if (!room.endedGameRoles) room.endedGameRoles = {};
      room.endedGameRoles[gp.socketId] = { name: gp.name, color: gp.color, role: gp.role };
      room.gamePlayers.delete(sessionToken);
    }
  }

  // Notify others
  const sockId = session.socketId;
  const sock = io.sockets.sockets.get(sockId);
  if (sock) {
    sock.leave(roomCode);
    sock.to(roomCode).emit('player:left', { playerId: sockId });
  } else {
    // Player is disconnected, broadcast to room directly
    io.to(roomCode).emit('player:left', { playerId: sockId });
  }

  if (room.players.size === 0) {
    // Clean up game loop before deleting room
    if (room.gameTickInterval) {
      clearInterval(room.gameTickInterval);
      room.gameTickInterval = null;
    }
    rooms.delete(roomCode);
    console.log(`[Server] Room ${roomCode} deleted (empty)`);
  } else {
    if (room.hostId === sockId) {
      // Transfer host to the oldest player
      let oldestToken: string | null = null;
      let oldestTime = Infinity;
      for (const [token, player] of room.players) {
        if (player.joinedAt < oldestTime) {
          oldestTime = player.joinedAt;
          oldestToken = token;
        }
      }
      if (oldestToken) {
        const newHostSession = sessions.get(oldestToken);
        const newHostPlayer = room.players.get(oldestToken);
        if (newHostSession && newHostPlayer) {
          room.hostId = newHostSession.socketId;
          room.hostName = newHostPlayer.name;
          console.log(`[Server] Room ${roomCode} host transferred to ${newHostPlayer.name}`);
        }
      }
    }
    broadcastPlayerList(room);
    // Check if game should end after player removal
    checkGameEndConditions(room);
  }
}

// ===== Health Check =====

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', players: io.engine.clientsCount, rooms: rooms.size });
});

// ===== Socket Handlers =====

io.on('connection', (socket) => {
  console.log(`[Server] Player connected: ${socket.id}`);

  // Create a fresh session token for this connection
  const sessionToken = generateSessionToken();
  const session: SessionData = {
    sessionToken,
    socketId: socket.id,
    playerName: '',
    roomCode: null,
    disconnectedAt: null,
    disconnectTimer: null,
  };
  sessions.set(sessionToken, session);
  socketToSession.set(socket.id, sessionToken);

  socket.emit('connection:welcome', { playerId: socket.id, sessionToken });

  // --- Reconnect with existing session ---
  socket.on('player:reconnect', ({ sessionToken: oldToken }) => {
    const oldSession = sessions.get(oldToken);
    if (!oldSession) return;

    // Cancel the grace period timer
    if (oldSession.disconnectTimer) {
      clearTimeout(oldSession.disconnectTimer);
      oldSession.disconnectTimer = null;
    }

    // Clean up the fresh session we just created
    const freshToken = socketToSession.get(socket.id);
    if (freshToken && freshToken !== oldToken) {
      sessions.delete(freshToken);
    }

    // Update old session with new socket
    const previousSocketId = oldSession.socketId;
    oldSession.socketId = socket.id;
    oldSession.disconnectedAt = null;
    socketToSession.set(socket.id, oldToken);

    // If player was in a room, restore them
    if (oldSession.roomCode) {
      const room = rooms.get(oldSession.roomCode);
      if (room) {
        // Update the room's hostId if this player was host
        if (room.hostId === previousSocketId) {
          room.hostId = socket.id;
        }

        socket.join(oldSession.roomCode);
        console.log(`[Server] ${oldSession.playerName} reconnected to room ${oldSession.roomCode}`);

        socket.emit('room:reconnected', { gameState: buildGameState(room), lobbyPlayers: buildLobbyPlayers(room) });
        broadcastPlayerList(room);
        return;
      }
      // Room no longer exists
      oldSession.roomCode = null;
    }
  });

  // --- List Rooms (paginated) ---
  socket.on('rooms:list', ({ page, limit }) => {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const allRooms = getListableRooms();
    const total = allRooms.length;
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const start = (safePage - 1) * safeLimit;
    const paginatedRooms = allRooms.slice(start, start + safeLimit);

    socket.emit('rooms:list', {
      rooms: paginatedRooms,
      total,
      page: safePage,
      totalPages,
    });
  });

  // --- Create Room ---
  socket.on('player:create-room', ({ name, password, maxPlayers }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess) return;

    // Leave any existing room first
    if (sess.roomCode) removePlayerFromRoom(token);

    const roomCode = generateRoomCode();
    const now = Date.now();
    const room: RoomData = {
      roomCode,
      hostId: socket.id,
      hostName: name,
      password: password?.trim() || null,
      maxPlayers: Math.min(Math.max(4, maxPlayers ?? DEFAULT_GAME_SETTINGS.maxPlayers), 15),
      phase: 'lobby',
      players: new Map([[token, { name, ready: false, joinedAt: now, color: PLAYER_COLORS[0] }]]),
      createdAt: now,
      gamePlayers: null,
      gameTickInterval: null,
      mazeLayout: null,
      mazeSnapshot: null,
      cosmicScenario: null,
      loadedPlayers: new Set(),
      currentEra: 'stable',
      gameStartTime: null,
      endedGameRoles: null,
      deadBodies: new Map(),
      meetingState: null,
    };

    rooms.set(roomCode, room);
    sess.playerName = name;
    sess.roomCode = roomCode;
    socket.join(roomCode);

    console.log(
      `[Server] ${name} created room ${roomCode}${room.password ? ' (password protected)' : ''}`,
    );

    socket.emit('room:created', { roomCode });
    socket.emit('room:joined', { gameState: buildGameState(room), lobbyPlayers: buildLobbyPlayers(room) });
    broadcastPlayerList(room);

  });

  // --- Join Room ---
  socket.on('player:join', ({ name, roomCode, password }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess) return;

    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit('room:error', { message: 'Room not found.' });
      return;
    }

    if (room.phase !== 'lobby') {
      socket.emit('room:error', { message: 'Game already in progress.' });
      return;
    }

    if (room.players.size >= room.maxPlayers) {
      socket.emit('room:error', { message: 'Room is full.' });
      return;
    }

    if (room.password !== null && room.password !== (password?.trim() ?? '')) {
      socket.emit('room:error', { message: 'Incorrect password.' });
      return;
    }

    // Leave any previous room
    if (sess.roomCode) removePlayerFromRoom(token);

    const color = getNextAvailableColor(room);
    room.players.set(token, { name, ready: false, joinedAt: Date.now(), color });
    sess.playerName = name;
    sess.roomCode = roomCode;
    socket.join(roomCode);

    console.log(`[Server] ${name} joined room ${roomCode} (${room.players.size}/${room.maxPlayers})`);

    socket.emit('room:joined', { gameState: buildGameState(room), lobbyPlayers: buildLobbyPlayers(room) });
    broadcastPlayerList(room);

    socket.to(roomCode).emit('player:joined', {
      player: {
        id: socket.id,
        name,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        color: '#ffffff',
        role: 'crew',
        isAlive: true,
        isHidden: false,
        isInvisible: false,
        hasShield: false,
        speedMultiplier: 1,
        power: null,
        powerCooldownEnd: 0,
        powerActiveEnd: 0,
      },
    });
  });

  // --- Explicit Leave Room ---
  socket.on('player:leave-room', () => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess) return;

    if (sess.roomCode) {
      console.log(`[Server] ${sess.playerName} explicitly left room ${sess.roomCode}`);
      removePlayerFromRoom(token);
    }
  });

  // --- Close Room (host only) ---
  socket.on('player:close-room', () => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess || !sess.roomCode) return;

    const room = rooms.get(sess.roomCode);
    if (!room || room.hostId !== socket.id) return; // Only host can close

    const roomCode = room.roomCode;
    console.log(`[Server] ${sess.playerName} closed room ${roomCode}`);

    // Notify ALL players in the room that the room is closed
    io.to(roomCode).emit('room:closed', { reason: 'The host closed the room.' });

    // Remove all players from the room
    for (const [playerToken] of room.players) {
      const playerSession = sessions.get(playerToken);
      if (playerSession) {
        playerSession.roomCode = null;
        const playerSocket = io.sockets.sockets.get(playerSession.socketId);
        if (playerSocket) {
          playerSocket.leave(roomCode);
        }
      }
    }

    // Stop game loop if running
    if (room.gameTickInterval) clearInterval(room.gameTickInterval);

    // Delete the room from in-memory
    rooms.delete(roomCode);
  });

  // --- Player Ready Toggle ---
  socket.on('player:ready', ({ ready }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess) return;
    if (!sess.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'lobby') return;
    const player = room.players.get(token);
    if (!player) return;
    player.ready = ready;
    io.to(room.roomCode).emit('player:ready', { playerId: socket.id, ready });
  });

  // --- Select Color ---
  socket.on('player:select-color', ({ color }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'lobby') return;
    const player = room.players.get(token);
    if (!player) return;
    // Validate color is in the palette
    if (!PLAYER_COLORS.includes(color)) return;
    // Validate color is not in use by another player
    for (const [otherToken, otherPlayer] of room.players) {
      if (otherToken !== token && otherPlayer.color === color) return;
    }
    player.color = color;
    broadcastPlayerList(room);
  });

  // --- Player Loaded (client finished loading 3D scene) ---
  socket.on('player:loaded', () => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'loading' || !room.gamePlayers) return;

    room.loadedPlayers.add(token);
    const totalPlayers = room.gamePlayers.size;
    const loadedPlayerIds = Array.from(room.loadedPlayers).map((t) => {
      const s = sessions.get(t);
      return s ? s.socketId : '';
    }).filter(Boolean);

    console.log(`[Server] ${sess.playerName} loaded (${loadedPlayerIds.length}/${totalPlayers}) in room ${room.roomCode}`);

    // Broadcast loading progress to all
    io.to(room.roomCode).emit('game:loading-progress', { loadedPlayerIds, totalPlayers });

    // Check if ALL players have loaded
    if (room.loadedPlayers.size >= totalPlayers) {
      room.phase = 'playing';
      io.to(room.roomCode).emit('game:phase-change', { phase: 'playing' });

      // Start game loop now that everyone is ready
      room.gameTickInterval = startGameLoop(io, room.roomCode, room.gamePlayers, room.mazeLayout!, room.mazeSnapshot!, room.cosmicScenario!, room.deadBodies, (era) => { room.currentEra = era; }, () => { checkGameEndConditions(room); });
      console.log(`[Server] All players loaded — game started in room ${room.roomCode}`);
    }
  });

  // --- Chat Message ---
  socket.on('chat:message', ({ text }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess) return;
    if (!sess.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room) return;
    const sanitized = text.trim().slice(0, 200);
    if (!sanitized) return;
    io.to(room.roomCode).emit('chat:message', { playerId: socket.id, text: sanitized });
  });

  // --- Player Input (during game) ---
  socket.on('player:input', (inputData: InputSnapshot) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess) return;
    if (!sess.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || (!gp.isAlive && !gp.isGhost)) return;
    gp.inputQueue.push(inputData);
  });

  // --- DEBUG: Cycle Power (TODO: remove after testing) ---
  socket.on('debug:cycle-power', () => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess) return;
    if (!sess.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers) return;
    const gp = room.gamePlayers.get(token);
    if (!gp) return;
    // Deactivate current power if active
    if (gp.powerActive) {
      deactivatePower(io, room.roomCode, gp, room.gamePlayers, room.mazeSnapshot ?? undefined);
    }
    // Cycle to next power
    const allPowers = Object.values(PowerType);
    const currentIdx = allPowers.indexOf(gp.power as PowerType);
    const nextIdx = (currentIdx + 1) % allPowers.length;
    gp.power = allPowers[nextIdx];
    gp.powerCooldownEnd = 0;
    gp.powerActive = false;
    gp.powerActiveEnd = 0;
    socket.emit('debug:power-changed', { power: allPowers[nextIdx] });
    console.log(`[DEBUG] ${gp.name} power changed to: ${allPowers[nextIdx]}`);
  });

  // --- Power Request Targets (for target-selection UI) ---
  socket.on('power:request-targets', () => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isAlive) return;

    const powerType = gp.power as PowerType;
    const config = POWER_CONFIGS[powerType];
    if (!config || !config.requiresTarget || !config.targetRange) return;

    // Validate not on cooldown and not already active
    const now = Date.now();
    if (now < gp.powerCooldownEnd || gp.powerActive) return;

    const nearby = findNearbyPlayers(gp, room.gamePlayers, config.targetRange);
    if (nearby.length === 0) {
      socket.emit('power:no-targets');
      return;
    }

    socket.emit('power:nearby-targets', {
      targets: nearby.map((t) => ({ id: t.socketId, name: t.name, color: t.color, distance: t.distance })),
    });
  });

  // --- Power Activate (toggle) ---
  socket.on('power:activate', ({ targetId, wallPosition, teleportPosition }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess) return;
    if (!sess.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isAlive) return;
    activatePower(io, room.roomCode, gp, room.gamePlayers, targetId, room.mazeSnapshot ?? undefined, wallPosition, room.currentEra, teleportPosition);
  });

  // --- Power Deactivate ---
  socket.on('power:deactivate', () => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess) return;
    if (!sess.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers) return;
    const gp = room.gamePlayers.get(token);
    if (!gp) return;
    deactivatePower(io, room.roomCode, gp, room.gamePlayers, room.mazeSnapshot ?? undefined);
  });

  // --- Kill Attempt (shadow tries to eliminate a player) ---
  socket.on('kill:attempt', ({ targetId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isAlive) return;
    attemptKill(io, room.roomCode, gp, room.gamePlayers, targetId, DEFAULT_GAME_SETTINGS.killCooldown, room.deadBodies);
  });

  // --- Body Report (player reports a dead body) ---
  socket.on('body:report', ({ bodyId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isAlive || gp.isGhost) return;

    // Validate body exists and is not already reported
    const body = room.deadBodies.get(bodyId);
    if (!body || body.reported) return;

    // Proximity check (3.0 units)
    const dx = gp.position[0] - body.position[0];
    const dz = gp.position[2] - body.position[2];
    if (dx * dx + dz * dz > 3.0 * 3.0) return;

    triggerMeeting(room, socket.id, bodyId);
  });

  // --- Emergency Meeting (player presses button at center table) ---
  socket.on('meeting:emergency', () => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isAlive || gp.isGhost) return;

    const now = Date.now();

    // Cooldown check (30 seconds)
    if (now < gp.emergencyButtonCooldownEnd) {
      socket.emit('meeting:emergency-failed', { reason: 'cooldown' });
      return;
    }

    // Uses check
    if (gp.emergencyButtonUsesLeft <= 0) {
      socket.emit('meeting:emergency-failed', { reason: 'no_uses' });
      return;
    }

    // Proximity check to center (3.5 units)
    const dx = gp.position[0];
    const dz = gp.position[2];
    if (dx * dx + dz * dz > 3.5 * 3.5) {
      socket.emit('meeting:emergency-failed', { reason: 'too_far' });
      return;
    }

    gp.emergencyButtonUsesLeft--;
    gp.emergencyButtonCooldownEnd = now + 30000;

    triggerMeeting(room, socket.id, null);
  });

  // --- Vote Cast (player votes during meeting) ---
  socket.on('vote:cast', ({ targetId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'meeting' || !room.gamePlayers || !room.meetingState) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isAlive) return;

    const ms = room.meetingState;
    if (ms.phase !== 'voting') return;

    // Already voted
    if (ms.votes.has(socket.id)) return;

    // Validate target (null = skip, otherwise must be alive)
    if (targetId !== null) {
      let validTarget = false;
      for (const [, tgp] of room.gamePlayers) {
        if (tgp.socketId === targetId && tgp.isAlive) {
          validTarget = true;
          break;
        }
      }
      if (!validTarget) return;
    }

    ms.votes.set(socket.id, targetId);
    socket.emit('vote:confirmed');

    // Check if all alive players have voted — end voting early
    let allVoted = true;
    for (const playerId of ms.alivePlayers) {
      if (!ms.votes.has(playerId)) {
        allVoted = false;
        break;
      }
    }

    if (allVoted) {
      // Cancel the voting timeout
      if (ms.votingTimer) {
        clearTimeout(ms.votingTimer);
        ms.votingTimer = null;
      }
      endMeeting(room);
    }
  });

  // --- Mind Control Input (arrow keys for controlling another player) ---
  socket.on('mind-control:input', (data) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess) return;
    if (!sess.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.powerActive || gp.power !== 'mind_controller' || !gp.mindControlTargetToken) return;
    gp.mindControlInput = {
      forward: data.forward,
      backward: data.backward,
      left: data.left,
      right: data.right,
      mouseX: data.mouseX,
    };
  });

  // --- Mind Control: Activate controlled player's power (E key) ---
  socket.on('mind-control:activate-power', () => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.powerActive || gp.power !== 'mind_controller' || !gp.mindControlTargetToken) return;

    const targetGp = room.gamePlayers.get(gp.mindControlTargetToken);
    if (!targetGp || !targetGp.isAlive) return;

    activatePower(io, room.roomCode, targetGp, room.gamePlayers, undefined, room.mazeSnapshot ?? undefined);
  });

  // --- Door Interact (player presses E near a door) ---
  socket.on('door:interact', ({ doorId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess) return;
    if (!sess.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers || !room.mazeLayout || !room.mazeSnapshot) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isAlive) return;
    interactDoor(gp, doorId, room.mazeLayout, room.mazeSnapshot);
  });

  // --- Oxygen Refill (player interacts with an oxygen generator) ---
  socket.on('oxygen:start-refill', ({ generatorId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers || !room.mazeLayout) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isAlive) return;

    // Check generator exists
    const gen = room.mazeLayout.oxygenGenerators?.find(g => g.id === generatorId);
    if (!gen) return;

    // Check proximity
    const dx = gp.position[0] - gen.position[0];
    const dz = gp.position[2] - gen.position[2];
    if (dx * dx + dz * dz > 3.5 * 3.5) return;

    // Check no one else is already refilling
    for (const [, otherGp] of room.gamePlayers) {
      if (otherGp.socketId !== socket.id && otherGp.oxygenRefillGeneratorId) return;
    }

    gp.oxygenRefillGeneratorId = generatorId;
    gp.oxygenRefillStartTime = Date.now();
  });

  socket.on('oxygen:cancel-refill', () => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers) return;
    const gp = room.gamePlayers.get(token);
    if (!gp) return;

    gp.oxygenRefillGeneratorId = null;
    gp.oxygenRefillStartTime = 0;
  });

  socket.on('oxygen:complete-refill', ({ generatorId }) => {
    // Completion is handled server-side in the game loop (after OXYGEN_REFILL_DURATION)
    // This event is a no-op safety valve
  });

  // --- Task Interact (player interacts with a task station) ---
  socket.on('task:start', ({ taskId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers || !room.mazeLayout || !room.mazeSnapshot) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isAlive) return;
    const result = startTask(gp, taskId, room.mazeLayout, room.mazeSnapshot);
    if (result.ok) {
      io.to(room.roomCode).emit('task:started', { taskId, playerId: gp.socketId });
    } else {
      socket.emit('task:start-failed', { taskId, reason: result.reason });
    }
  });

  socket.on('task:complete', ({ taskId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers || !room.mazeSnapshot) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isAlive) return;
    if (completeTask(gp, taskId, room.mazeSnapshot)) {
      io.to(room.roomCode).emit('task:completed', { taskId, playerId: gp.socketId });
    } else {
      // Safety: clear activeTaskId to prevent cascading failures
      gp.activeTaskId = null;
    }
  });

  socket.on('task:cancel', ({ taskId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers || !room.mazeSnapshot) return;
    const gp = room.gamePlayers.get(token);
    if (!gp) return;
    if (cancelTask(gp, taskId, room.mazeSnapshot)) {
      io.to(room.roomCode).emit('task:cancelled', { taskId, playerId: gp.socketId });
    }
    // Always clear activeTaskId to prevent cascading failures
    gp.activeTaskId = null;
  });

  // --- Ghost: Possess a player's body (20s, 30s cooldown) ---
  socket.on('ghost:possess', ({ targetId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isGhost) return;

    const now = Date.now();
    if (now < gp.ghostPossessCooldownEnd) return;

    // Find target by socket ID
    const targetToken = findSessionTokenBySocketId(targetId);
    if (!targetToken) return;
    const targetGp = room.gamePlayers.get(targetToken);
    if (!targetGp || !targetGp.isAlive) return;

    gp.ghostPossessTargetToken = targetToken;
    gp.ghostPossessEnd = now + 20_000;
    gp.ghostPossessCooldownEnd = now + 20_000 + 30_000;
  });

  // --- Ghost: Release possession early ---
  socket.on('ghost:release-possess', () => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isGhost) return;
    gp.ghostPossessTargetToken = null;
    gp.ghostPossessInput = null;
  });

  // --- Ghost: Send input for possessed player ---
  socket.on('ghost:possess-input', (data) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isGhost || !gp.ghostPossessTargetToken) return;
    gp.ghostPossessInput = {
      forward: data.forward,
      backward: data.backward,
      left: data.left,
      right: data.right,
      mouseX: data.mouseX,
    };
  });

  // --- Ghost: Toggle light (no hacker power needed) ---
  socket.on('ghost:toggle-light', ({ lightId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.mazeSnapshot) return;
    const gp = room.gamePlayers?.get(token);
    if (!gp || !gp.isGhost) return;
    if (room.mazeSnapshot.lightStates[lightId] !== undefined) {
      room.mazeSnapshot.lightStates[lightId] = !room.mazeSnapshot.lightStates[lightId];
    }
  });

  // --- Ghost: Start task (any task, no assignment/proximity check) ---
  socket.on('ghost:task-start', ({ taskId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers || !room.mazeLayout || !room.mazeSnapshot) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isGhost) return;
    if (ghostStartTask(gp, taskId, room.mazeLayout, room.mazeSnapshot)) {
      io.to(room.roomCode).emit('task:started', { taskId, playerId: gp.socketId });
    }
  });

  // --- Ghost: Complete task ---
  socket.on('ghost:task-complete', ({ taskId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers || !room.mazeSnapshot) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isGhost) return;
    if (completeTask(gp, taskId, room.mazeSnapshot)) {
      io.to(room.roomCode).emit('task:completed', { taskId, playerId: gp.socketId });
    }
  });

  // --- Ghost: Cancel task ---
  socket.on('ghost:task-cancel', ({ taskId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers || !room.mazeSnapshot) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isGhost) return;
    if (cancelTask(gp, taskId, room.mazeSnapshot)) {
      io.to(room.roomCode).emit('task:cancelled', { taskId, playerId: gp.socketId });
    }
  });

  // --- Death Choice (ghost, lobby, leave) ---
  socket.on('death:choice', ({ choice }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || !room.gamePlayers) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || gp.isAlive) return; // Only dead players can choose

    switch (choice) {
      case 'ghost':
        // Already a ghost — nothing to do server-side
        break;
      case 'lobby':
        returnPlayerToLobby(room, token, gp, socket);
        break;
      case 'leave':
        removePlayerFromRoom(token);
        break;
    }
  });

  // --- Pipe: Enter underground pipe network ---
  socket.on('pipe:enter', ({ pipeNodeId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers || !room.mazeLayout) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isAlive || gp.isUnderground) return;

    // Find the pipe node
    const pipeNode = room.mazeLayout.pipeNodes?.find(p => p.id === pipeNodeId);
    if (!pipeNode) return;

    // Check proximity to pipe entrance (surface)
    const dx = gp.position[0] - pipeNode.surfacePosition[0];
    const dz = gp.position[2] - pipeNode.surfacePosition[2];
    if (dx * dx + dz * dz > 4 * 4) return; // Must be within 4 units

    // Teleport to underground position
    gp.position = [...pipeNode.undergroundPosition];
    gp.isUnderground = true;
    gp.currentPipeNodeId = pipeNodeId;
    console.log(`[PIPE] ${gp.name} entered pipe at ${pipeNode.roomName}`);
  });

  // --- Pipe: Exit underground pipe network ---
  socket.on('pipe:exit', ({ pipeNodeId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers || !room.mazeLayout) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isAlive || !gp.isUnderground) return;

    // Find the pipe node
    const pipeNode = room.mazeLayout.pipeNodes?.find(p => p.id === pipeNodeId);
    if (!pipeNode) return;

    // Check proximity to underground exit
    const dx = gp.position[0] - pipeNode.undergroundPosition[0];
    const dz = gp.position[2] - pipeNode.undergroundPosition[2];
    if (dx * dx + dz * dz > 4 * 4) return; // Must be within 4 units

    // Teleport to surface position
    gp.position = [...pipeNode.surfacePosition];
    gp.isUnderground = false;
    gp.currentPipeNodeId = null;
    console.log(`[PIPE] ${gp.name} exited pipe at ${pipeNode.roomName}`);
  });

  // --- Pipe: Fast-travel underground to another node ---
  socket.on('pipe:travel', ({ destinationNodeId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess?.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers || !room.mazeLayout) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isAlive || !gp.isUnderground) return;

    const destNode = room.mazeLayout.pipeNodes?.find(p => p.id === destinationNodeId);
    if (!destNode) return;

    gp.position = [...destNode.undergroundPosition];
    gp.currentPipeNodeId = destinationNodeId;
    console.log(`[PIPE] ${gp.name} traveled to ${destNode.roomName} underground`);
  });

  // --- Hacker Action (lock door / toggle light) ---
  socket.on('hacker:action', ({ targetType, targetId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess) return;
    if (!sess.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers || !room.mazeSnapshot) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isAlive || !gp.powerActive || gp.power !== PowerType.HACKER) return;

    if (targetType === 'door') {
      const doorState = room.mazeSnapshot.doorStates[targetId];
      if (!doorState) return;
      // Toggle lock
      if (doorState.isLocked && doorState.lockedBy === gp.socketId) {
        doorState.isLocked = false;
        doorState.isOpen = false;
        doorState.lockedBy = null;
        gp.hackerLockedDoors = gp.hackerLockedDoors.filter(id => id !== targetId);
      } else if (!doorState.isLocked) {
        doorState.isLocked = true;
        doorState.isOpen = false;
        doorState.lockedBy = gp.socketId;
        gp.hackerLockedDoors.push(targetId);
      }
    }

    if (targetType === 'light') {
      if (room.mazeSnapshot.lightStates[targetId] !== undefined) {
        room.mazeSnapshot.lightStates[targetId] = !room.mazeSnapshot.lightStates[targetId];
        if (!room.mazeSnapshot.lightStates[targetId]) {
          gp.hackerToggledLights.push(targetId);
        } else {
          gp.hackerToggledLights = gp.hackerToggledLights.filter(id => id !== targetId);
        }
      }
    }

    if (targetType === 'wall') {
      if (room.mazeSnapshot.dynamicWallStates[targetId] !== undefined) {
        const wasClosed = room.mazeSnapshot.dynamicWallStates[targetId] !== false;
        room.mazeSnapshot.dynamicWallStates[targetId] = !wasClosed;
        if (!wasClosed) {
          // Was open, now closing — remove from toggled list
          gp.hackerToggledWalls = gp.hackerToggledWalls.filter(id => id !== targetId);
        } else {
          // Was closed, now opening — add to toggled list
          gp.hackerToggledWalls.push(targetId);
        }
      }
    }
  });

  // --- Start Game (host only) ---
  socket.on('game:start', async () => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess) return;
    if (!sess.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;

    // Check all players are ready and minimum count
    if (room.players.size < 2) return;
    for (const [, player] of room.players) {
      if (!player.ready) return;
    }

    // Generate cosmic scenario via Gemini AI
    const cosmicScenario = await generateCosmicScenario();

    // Assign roles
    const playerTokens = Array.from(room.players.keys());
    const shadowCount = Math.max(1, Math.floor(playerTokens.length / 3));
    const shuffled = [...playerTokens].sort(() => Math.random() - 0.5);
    const shadowTokens = new Set(shuffled.slice(0, shadowCount));

    // Assign powers
    const allPowers = Object.values(PowerType);
    const shuffledPowers = [...allPowers].sort(() => Math.random() - 0.5);

    // Colors for players
    const PLAYER_COLORS = [
      '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6',
      '#e67e22', '#1abc9c', '#e84393', '#00cec9', '#6c5ce7',
      '#fd79a8', '#ffeaa7', '#dfe6e9', '#636e72', '#b2bec3',
    ];

    // Generate maze
    const mazeSeed = Math.floor(Math.random() * 2147483647);
    const mazeLayout = generateMaze(mazeSeed, playerTokens.length);
    const mazeSnapshot = createInitialMazeSnapshot(mazeLayout);

    // Assign tasks per player (crew gets real tasks, shadows get fake tasks)
    const TASKS_PER_PLAYER = 5;
    const allTaskIds = mazeLayout.tasks.map((t) => t.id);
    const shuffledTaskIds = [...allTaskIds].sort(() => Math.random() - 0.5);

    // Count crew members to distribute tasks
    const crewTokens = playerTokens.filter((t) => !shadowTokens.has(t));
    const crewCount = crewTokens.length;
    // Each crew member gets up to TASKS_PER_PLAYER, cycling through all tasks
    const taskAssignments = new Map<string, string[]>();
    let taskCursor = 0;
    for (const cToken of crewTokens) {
      const assigned: string[] = [];
      for (let i = 0; i < TASKS_PER_PLAYER && i < allTaskIds.length; i++) {
        assigned.push(shuffledTaskIds[taskCursor % shuffledTaskIds.length]);
        taskCursor++;
      }
      taskAssignments.set(cToken, assigned);
    }
    // Shadows get fake tasks (random subset, same count, for blending in)
    for (const sToken of shuffled.slice(0, shadowCount)) {
      const fakeAssigned: string[] = [];
      const shadowShuffled = [...allTaskIds].sort(() => Math.random() - 0.5);
      for (let i = 0; i < TASKS_PER_PLAYER && i < shadowShuffled.length; i++) {
        fakeAssigned.push(shadowShuffled[i]);
      }
      taskAssignments.set(sToken, fakeAssigned);
    }

    // Build game player states and player info map
    const gamePlayers = new Map<string, GamePlayerState>();
    const playerInfo: Record<string, { name: string; color: string }> = {};
    const totalPlayers = room.players.size;
    const spawnRadius = 3;
    let idx = 0;

    for (const [pToken, pData] of room.players) {
      const pSession = sessions.get(pToken);
      if (!pSession) continue;

      const isShadow = shadowTokens.has(pToken);
      const angle = (idx / totalPlayers) * Math.PI * 2;
      const color = pData.color;
      const power = shuffledPowers[idx % shuffledPowers.length];

      const gp: GamePlayerState = {
        sessionToken: pToken,
        socketId: pSession.socketId,
        name: pData.name,
        role: isShadow ? 'shadow' : 'crew',
        power,
        color,
        position: [
          Math.cos(angle) * spawnRadius,
          0,
          Math.sin(angle) * spawnRadius,
        ],
        rotation: [0, 0, 0, 1],
        isAlive: true,
        isHidden: false,
        isInvisible: false,
        hasShield: false,
        isImpermeable: false,
        activeTaskId: null,
        assignedTasks: taskAssignments.get(pToken) ?? [],
        speedMultiplier: 1,
        lastProcessedInput: 0,
        inputQueue: [],
        powerActive: false,
        powerActiveEnd: 0,
        powerCooldownEnd: 0,
        powerUsesLeft: POWER_CONFIGS[power]?.usesPerMatch ?? 1,
        mindControlTargetToken: null,
        mindControlInput: null,
        baseSpeedMultiplier: 1,
        originalColor: color,
        originalPower: power,
        isMetamorphed: false,
        metamorphEndTime: 0,
        hackerLockedDoors: [],
        hackerToggledLights: [],
        hackerToggledWalls: [],
        muralhaWalls: [],
        muralhaNextWallId: 0,
        health: MAX_HEALTH,
        maxHealth: MAX_HEALTH,
        damageSource: 'none',
        inShelter: false,
        doorProtection: false,
        isGhost: false,
        ghostPossessTargetToken: null,
        ghostPossessInput: null,
        ghostPossessEnd: 0,
        ghostPossessCooldownEnd: 0,
        oxygenRefillGeneratorId: null,
        oxygenRefillStartTime: 0,
        killCooldownEnd: 0,
        isUnderground: false,
        currentPipeNodeId: null,
        emergencyButtonCooldownEnd: 0,
        emergencyButtonUsesLeft: 1,
      };

      gamePlayers.set(pToken, gp);
      playerInfo[pSession.socketId] = { name: pData.name, color };
      idx++;
    }

    room.phase = 'loading';
    room.gamePlayers = gamePlayers;
    room.mazeLayout = mazeLayout;
    room.mazeSnapshot = mazeSnapshot;
    room.cosmicScenario = cosmicScenario;
    room.loadedPlayers = new Set();
    room.gameStartTime = Date.now();
    room.endedGameRoles = null;
    room.deadBodies = new Map();
    room.meetingState = null;

    // Emit to each player individually (they only learn their own role)
    for (const [pToken, gp] of gamePlayers) {
      const pSession = sessions.get(pToken);
      if (!pSession) continue;
      const pSocket = io.sockets.sockets.get(pSession.socketId);
      if (pSocket) {
        pSocket.emit('game:started', {
          role: gp.role,
          power: gp.power as PowerType,
          playerInfo,
          mazeLayout,
          cosmicScenario,
          assignedTasks: gp.assignedTasks,
        });
      }
    }

    // Tell all clients to enter loading phase (NOT playing yet)
    io.to(room.roomCode).emit('game:phase-change', { phase: 'loading' });
    io.to(room.roomCode).emit('game:loading-progress', { loadedPlayerIds: [], totalPlayers });

    console.log(`[Server] Game loading in room ${room.roomCode} (${totalPlayers} players, ${shadowCount} shadow(s), scenario: "${cosmicScenario.theme}") — waiting for all clients to load...`);
  });

  // --- Kick Player (host only) ---
  socket.on('player:kick', ({ targetId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess) return;
    if (!sess.roomCode) return;

    const room = rooms.get(sess.roomCode);
    if (!room || room.hostId !== socket.id) return; // Only host can kick

    // Find target session token by socket ID
    const targetToken = findSessionTokenBySocketId(targetId);
    if (!targetToken) return;

    const targetSession = sessions.get(targetToken);
    if (!targetSession || targetSession.roomCode !== room.roomCode) return;

    // Cannot kick yourself
    if (targetId === socket.id) return;

    const targetPlayer = room.players.get(targetToken);
    console.log(`[Server] ${sess.playerName} kicked ${targetPlayer?.name} from room ${room.roomCode}`);

    // Notify the kicked player
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.emit('room:kicked', { reason: 'You were kicked by the host.' });
    }

    // Remove from room
    removePlayerFromRoom(targetToken);
  });

  // --- Transfer Host (host only) ---
  socket.on('player:transfer-host', ({ targetId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess) return;
    if (!sess.roomCode) return;

    const room = rooms.get(sess.roomCode);
    if (!room || room.hostId !== socket.id) return; // Only host can transfer

    // Find target session token by socket ID
    const targetToken = findSessionTokenBySocketId(targetId);
    if (!targetToken) return;

    const targetSession = sessions.get(targetToken);
    if (!targetSession || targetSession.roomCode !== room.roomCode) return;

    // Cannot transfer to yourself
    if (targetId === socket.id) return;

    const targetPlayer = room.players.get(targetToken);
    if (!targetPlayer) return;

    room.hostId = targetId;
    room.hostName = targetPlayer.name;
    console.log(`[Server] Host of room ${room.roomCode} transferred to ${targetPlayer.name}`);

    broadcastPlayerList(room);
  });

  // --- Disconnect (grace period, NOT immediate removal) ---
  socket.on('disconnect', () => {
    const token = socketToSession.get(socket.id);
    if (!token) return;

    const sess = sessions.get(token);
    if (!sess) {
      socketToSession.delete(socket.id);
      return;
    }

    socketToSession.delete(socket.id);

    if (!sess.roomCode) {
      // Not in a room, just clean up the session
      sessions.delete(token);
      console.log(`[Server] Player disconnected: ${socket.id} (no room)`);
      return;
    }

    // In a room — start grace period
    sess.disconnectedAt = Date.now();
    console.log(`[Server] ${sess.playerName} disconnected from room ${sess.roomCode} (grace period: ${DISCONNECT_GRACE_MS / 1000}s)`);

    sess.disconnectTimer = setTimeout(() => {
      // Grace period expired — remove from room
      console.log(`[Server] ${sess.playerName} grace period expired, removing from room ${sess.roomCode}`);
      removePlayerFromRoom(token);
      sessions.delete(token);
    }, DISCONNECT_GRACE_MS);
  });
});

// SPA fallback: serve index.html for any non-API/non-socket route
app.get('{*path}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

httpServer.listen(PORT, () => {
  console.log(`[Server] Shadow Among Us 3D server running on port ${PORT}`);
  console.log(`[Server] Waiting for players...`);
});
