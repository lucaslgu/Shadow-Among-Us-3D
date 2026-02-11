# Shadow Among Us 3D

A multiplayer 3D social deduction game inspired by Among Us. Players are split into **Crew** members and **Shadows** (impostors), each wielding a unique power. Navigate a dark environment with flashlights, use your abilities strategically, and figure out who the Shadows are before it's too late.

Built with React, Three.js, and Socket.io in a TypeScript monorepo.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Monorepo | pnpm workspaces |
| Client | React 19, Three.js 0.172, React Three Fiber 9, @react-three/drei, Zustand 5, Socket.io-client 4.8, React Router DOM 7, Vite 6 |
| Server | Express 5, Socket.io 4.8, Node.js |
| Shared | TypeScript types, Zod 3.24 |
| Language | TypeScript 5.7 (strict mode) |
| Tooling | ESLint 9, Prettier 3.4, tsx (dev runner), Concurrently |

## Project Structure

```
shadow-among-us-3d/
├── package.json                  # Root workspace scripts (dev, build, lint, typecheck)
├── pnpm-workspace.yaml           # Workspace definition (packages/*)
├── tsconfig.base.json            # Shared TypeScript config (ES2022, strict)
├── .prettierrc                   # Prettier (single quotes, trailing commas, 100 width)
│
├── packages/
│   ├── client/                   # React + Three.js frontend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts        # Vite + React plugin, socket.io proxy to :3001
│   │   └── src/
│   │       ├── main.tsx              # Entry point (BrowserRouter + StrictMode)
│   │       ├── App.tsx               # Routes, GameNetworkBridge, pointer lock
│   │       ├── camera/
│   │       │   └── ThirdPersonCamera.tsx  # FPS camera (YXZ euler, pitch clamp)
│   │       ├── entities/
│   │       │   ├── LocalPlayer.tsx        # Local player mesh + flashlight + battery
│   │       │   └── RemotePlayer.tsx       # Remote player with interpolation + name label
│   │       ├── hooks/
│   │       │   └── useInput.ts            # Keyboard (WASD, Q, F) + mouse input
│   │       ├── networking/
│   │       │   ├── input-sender.ts        # Sends InputSnapshot at 20 Hz
│   │       │   ├── interpolation.ts       # Entity interpolation (100 ms delay)
│   │       │   └── mouse-state.ts         # Shared mutable yaw/pitch/flashlight state
│   │       ├── scenes/
│   │       │   └── GameScene.tsx          # Three.js Canvas: MenuScene vs PlayingScene
│   │       ├── stores/
│   │       │   ├── game-store.ts          # Game phase, snapshots, prediction, chat
│   │       │   └── network-store.ts       # Socket, sessions, rooms, lobby state
│   │       └── ui/
│   │           ├── Chat.tsx               # Lobby and in-game chat
│   │           ├── CreateRoom.tsx         # Room creation form
│   │           ├── EnterRoom.tsx          # Password entry for locked rooms
│   │           ├── GameHUD.tsx            # In-game HUD (role, power, battery, crosshair)
│   │           ├── Lobby.tsx              # Player list, ready toggle, host controls
│   │           ├── MainMenu.tsx           # Name input, navigation
│   │           ├── PasswordPrompt.tsx     # Reusable password dialog
│   │           ├── RoomList.tsx           # Paginated room browser
│   │           └── styles.ts             # Shared CSS-in-JS styles and palette
│   │
│   ├── server/                   # Express + Socket.io backend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts              # Server entry, room/session management, events
│   │       ├── game/
│   │       │   └── game-loop.ts      # 20 Hz game tick, power system, state snapshots
│   │       └── systems/
│   │           └── movement.ts       # Authoritative movement processing
│   │
│   └── shared/                   # Cross-package types and utilities
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts              # Barrel re-exports
│           ├── movement.ts           # applyMovement(), yawToQuaternion()
│           └── types/
│               ├── index.ts              # Type barrel export
│               ├── player.ts             # Vec3, Quat, PlayerRole, PlayerState, InputSnapshot
│               ├── game-state.ts         # GamePhase, GameSettings, DEFAULT_GAME_SETTINGS
│               ├── powers.ts             # PowerType enum, PowerConfig, POWER_CONFIGS
│               └── network-messages.ts   # ClientEvents, ServerEvents, StateSnapshot
```

## Architecture Overview

### Client-Server Model

The server is the **single source of truth** for all game state. Clients send input snapshots (WASD + mouse yaw) at 20 Hz. The server processes inputs in a fixed-timestep game loop (20 Hz / 50 ms), applies movement via the shared `applyMovement()` function, and broadcasts state snapshots to all players in the room.

### Client-Side Prediction and Reconciliation

The client applies movement locally for immediate responsiveness using the same `applyMovement()` function from `@shadow/shared`. When a server snapshot arrives, the client discards acknowledged inputs (via `lastProcessedInput` sequence number) and replays unacknowledged inputs on top of the server position.

### Entity Interpolation

Remote players are rendered using snapshot interpolation with a **100 ms delay**. A buffer stores the last 5 snapshots, and `interpolatePlayer()` performs linear position interpolation (lerp) and spherical quaternion interpolation (slerp) between bracketing snapshots.

### Session Persistence

On connection, the server issues a `sessionToken` stored in `sessionStorage`. On disconnect, the session stays alive for **30 seconds**. On reconnect, the client sends `player:reconnect` with the saved token to restore its room and state.

### Networking Diagram

```
Client (React + R3F)                    Server (Express + Socket.io)
┌─────────────────────┐                 ┌─────────────────────┐
│  useInput (WASD)    │──player:input──>│  Input Queue        │
│  InputSender 20 Hz  │                 │  Game Loop 20 Hz    │
│                     │                 │  ┌────────────────┐  │
│  Client-Side        │<─state-snapshot─│  │ processInput() │  │
│  Prediction         │                 │  │ applyMovement()│  │
│  + Reconciliation   │                 │  │ power system   │  │
│                     │                 │  └────────────────┘  │
│  Entity             │                 │                      │
│  Interpolation      │                 │  Rooms (in-memory)   │
│  (100 ms delay)     │                 │  Sessions (30 s)     │
└─────────────────────┘                 └──────────────────────┘
          │                                       │
          └──────────── @shadow/shared ───────────┘
               (types, movement math, configs)
```

## Prerequisites

- **Node.js** >= 18 (recommended: 20+)
- **pnpm** >= 8 — install via `npm install -g pnpm`

## Getting Started

### Installation

```bash
git clone <repository-url>
cd shadow-among-us-3d
pnpm install
```

### Development

```bash
pnpm dev
```

This runs both the server (port 3001) and client (port 5173) concurrently. The Vite dev server proxies `/socket.io` requests to the server automatically.

| URL | Description |
|-----|-------------|
| http://localhost:5173 | Client (Vite dev server) |
| http://localhost:3001 | Server (Express + Socket.io) |
| http://localhost:3001/health | Health check endpoint |

### Individual Packages

```bash
pnpm dev:server    # Server only (tsx watch mode)
pnpm dev:client    # Client only (Vite HMR)
```

### Type Checking and Linting

```bash
pnpm typecheck     # TypeScript check across all packages
pnpm lint          # ESLint across all packages
```

## Deployment

### Building for Production

```bash
pnpm build
```

Build order (automatic): `shared` -> `server` -> `client`. The client outputs to `packages/client/dist/`.

### Running in Production

```bash
node packages/server/dist/index.js
```

The server serves the client static files from `packages/client/dist/` and includes an SPA fallback route that serves `index.html` for all non-API paths.

### Environment Variables

Each package has a `.env.example` file with all required variables. Copy it to `.env` and adjust as needed:

```bash
cp packages/server/.env.example packages/server/.env
cp packages/client/.env.example packages/client/.env
```

| Variable | Package | Default | Description |
|----------|---------|---------|-------------|
| `PORT` | server | `3001` | Server listen port |
| `VITE_SERVER_URL` | client | `http://localhost:3001` | Socket.io server URL (build-time) |

> For the full and up-to-date list of environment variables, refer to the `.env.example` file in each package.

### Health Check

```
GET /health
```

Returns:
```json
{ "status": "ok", "players": 12, "rooms": 3 }
```

## How to Play

### 1. Main Menu

Enter your player name (2-20 characters). Choose **Enter Room** to browse and join existing rooms, or **Create Room** to host a new game.

### 2. Creating a Room

- Set the maximum number of players (4-15, default: 10).
- Optionally protect the room with a password.
- Click **Create Room** — you are placed in the lobby as the host.

### 3. Joining a Room

- Browse the paginated room list (6 rooms per page).
- Click **Join** on an open room. Password-protected rooms display a lock icon and prompt for the password.
- Alternatively, enter a room code directly if shared by a friend.

### 4. Lobby

- The player list shows each player's ready state and the host (crown icon).
- Click **Click to Ready Up** to toggle your ready status.
- The **host** can:
  - **Start Game** — requires all players to be ready and at least 2 players.
  - **Kick** a player from the room.
  - **Transfer Host** to another player.
  - **Close Room** — removes everyone and deletes the room.
- Chat is available in the sidebar. Messages are limited to 200 characters.

### 5. Controls

| Key | Action |
|-----|--------|
| **W / A / S / D** | Move forward / left / backward / right |
| **Mouse** (pointer locked) | Look around (yaw + pitch, clamped to ±60°) |
| **Q** | Activate / deactivate your unique power |
| **F** | Toggle flashlight on/off |
| **Arrow Keys** | Control the target (Mind Controller power only) |
| **Space** | Kill nearby player (Shadow role only) |
| **R** | Report a dead body |
| **E** | Call emergency meeting |
| **Click on canvas** | Engage pointer lock (required for mouse look) |

### 6. Roles

| Role | Objective |
|------|-----------|
| **Crew** | Survive, identify Shadows, and vote them out during meetings. |
| **Shadow** | Eliminate Crew members without getting caught. Blend in and deceive. |

Roles are assigned randomly when the game starts. Shadow count is calculated as `floor(playerCount / 3)` with a minimum of 1. Each player only sees their own role.

### 7. Powers

Every player receives **one random power** at the start of the match. Each power has 1 use per match.

| Power | Duration | Cooldown | Description |
|-------|----------|----------|-------------|
| **Metamorph** | 30 s | 60 s | Copy another player's appearance. Requires nearby target. |
| **Invisible** | 15 s | 45 s | Become completely invisible to other players. |
| **Teleport** | Instant | 40 s | Instantly teleport to a random location on the map. |
| **Medic** | Instant | 60 s | Revive a ghost or grant a protective shield to a nearby player. |
| **Time Controller** | 5 s | 60 s | Freeze all other players in place. |
| **Hacker** | 20 s | 45 s | Access security cameras and lock doors remotely. |
| **Flash** | 10 s | 40 s | Triple your movement speed. |
| **Necromancer** | Instant | 60 s | Spawn an NPC follower from a dead body. Requires target. |
| **Mind Controller** | 8 s | 60 s | Take over another player's movement. Use Arrow Keys to control the target. |

The HUD displays your power name, status (ready / active / cooldown), and remaining cooldown time.

### 8. Flashlight System

Your flashlight is the **primary light source** in the dark 3D environment.

- **Battery drain**: 5% per second while on (full battery lasts ~20 s).
- **Battery recharge**: 8% per second while off (full recharge in ~12.5 s).
- **Depletion**: If the battery reaches 0%, the flashlight turns off automatically and cannot be re-enabled until it recharges to **20%**.
- The HUD shows battery percentage with a color-coded bar (green > 50%, yellow > 20%, red below 20%).
- Press **F** to toggle the flashlight.

### 9. Win Conditions

| Condition | Winner |
|-----------|--------|
| All Shadows are voted out during meetings | **Crew wins** |
| Shadows eliminate enough Crew to equal or outnumber them | **Shadows win** |

## Game Settings Reference

Default settings defined in `@shadow/shared`:

| Setting | Default | Description |
|---------|---------|-------------|
| `maxPlayers` | 10 | Maximum players per room (4-15) |
| `shadowCount` | 2 | Shadow players (auto: `floor(players / 3)`, min 1) |
| `discussionTime` | 30 s | Discussion time before voting |
| `votingTime` | 30 s | Time to cast votes |
| `killCooldown` | 25 s | Cooldown between Shadow kills |
| `playerSpeed` | 5 | Base movement speed (units/second) |
| `flashlightRange` | 15 | Flashlight beam distance (units) |

## Contributing

1. Fork the repository and create a feature branch.
2. Follow the code standards defined in [CODE_STANDARDS.md](CODE_STANDARDS.md).
3. Ensure `pnpm typecheck` and `pnpm lint` pass with no errors.
4. Keep files under **300 lines**. Prefer small, focused modules.
5. Write clear commit messages describing what changed and why.
6. Open a pull request with a summary of your changes.

## License

This project is currently unlicensed. A license will be added in the future.
