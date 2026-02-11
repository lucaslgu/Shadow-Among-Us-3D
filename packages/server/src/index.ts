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
} from '@shadow/shared';
import { DEFAULT_GAME_SETTINGS, PowerType } from '@shadow/shared';
import { startGameLoop, activatePower, deactivatePower, type GamePlayerState } from './game/game-loop.js';

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

function buildLobbyPlayers(room: RoomData): LobbyPlayer[] {
  const players: LobbyPlayer[] = [];
  for (const [token, playerData] of room.players) {
    const session = sessions.get(token);
    if (session) {
      players.push({
        id: session.socketId,
        name: playerData.name,
        isHost: session.socketId === room.hostId,
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
      players: new Map([[token, { name, ready: false, joinedAt: now }]]),
      createdAt: now,
      gamePlayers: null,
      gameTickInterval: null,
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

    room.players.set(token, { name, ready: false, joinedAt: Date.now() });
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
    if (!gp || !gp.isAlive) return;
    gp.inputQueue.push(inputData);
  });

  // --- Power Activate (toggle) ---
  socket.on('power:activate', ({ targetId }) => {
    const token = socketToSession.get(socket.id);
    if (!token) return;
    const sess = sessions.get(token);
    if (!sess) return;
    if (!sess.roomCode) return;
    const room = rooms.get(sess.roomCode);
    if (!room || room.phase !== 'playing' || !room.gamePlayers) return;
    const gp = room.gamePlayers.get(token);
    if (!gp || !gp.isAlive) return;
    activatePower(io, room.roomCode, gp, room.gamePlayers, targetId);
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
    deactivatePower(io, room.roomCode, gp, room.gamePlayers);
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

  // --- Start Game (host only) ---
  socket.on('game:start', () => {
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
      const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
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
        speedMultiplier: 1,
        lastProcessedInput: 0,
        inputQueue: [],
        powerActive: false,
        powerActiveEnd: 0,
        powerCooldownEnd: 0,
        powerUsesLeft: 1,
        mindControlTargetToken: null,
        mindControlInput: null,
        baseSpeedMultiplier: 1,
        originalColor: color,
      };

      gamePlayers.set(pToken, gp);
      playerInfo[pSession.socketId] = { name: pData.name, color };
      idx++;
    }

    room.phase = 'playing';
    room.gamePlayers = gamePlayers;

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
        });
      }
    }

    io.to(room.roomCode).emit('game:phase-change', { phase: 'playing' });

    // Start game loop
    room.gameTickInterval = startGameLoop(io, room.roomCode, gamePlayers);
    console.log(`[Server] Game started in room ${room.roomCode} (${totalPlayers} players, ${shadowCount} shadow(s))`);
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
