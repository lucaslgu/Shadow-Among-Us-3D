# Code Standards — Shadow Among Us 3D

This document defines the code standards, conventions, and design principles for the project. All contributors must follow these guidelines to maintain consistency and quality across the codebase.

## 1. File Size Limit

**Maximum: 300 lines per file.**

If a file approaches this limit, split it into smaller, focused modules:

- Extract helper functions into utility files.
- Extract sub-components into their own files (e.g., `PowerStatus.tsx` from `GameHUD.tsx`).
- Extract type definitions into dedicated type files (as done in `packages/shared/src/types/`).
- Extract constants and configuration objects into separate files.

## 2. SOLID Principles

### S — Single Responsibility Principle (SRP)

Each module, class, or function must have **one reason to change**.

**Good examples in this project:**

- `packages/shared/src/movement.ts` — only handles movement math (`applyMovement`, `yawToQuaternion`).
- `packages/client/src/networking/input-sender.ts` — only packages and sends input snapshots at 20 Hz.
- `packages/client/src/networking/interpolation.ts` — only handles entity interpolation calculations.

**How to apply:** When a file handles more than one responsibility (e.g., HTTP setup + room management + session handling + socket events), split it into separate modules: `rooms.ts`, `sessions.ts`, `socket-handlers.ts`, etc.

### O — Open/Closed Principle (OCP)

Modules must be **open for extension** but **closed for modification**.

**Good example in this project:**

- `packages/shared/src/types/powers.ts` — the `PowerType` enum and `POWER_CONFIGS` record allow adding a new power by adding an enum value and a config entry, without modifying the core activation logic.

**How to apply:** When adding new features (a new power, a new game phase, a new event type), add new config entries, new handler cases, or new modules rather than rewriting core logic.

### L — Liskov Substitution Principle (LSP)

Subtypes must be **substitutable** for their base types. In TypeScript, interfaces and type unions must be honored consistently.

**Good example in this project:**

- `packages/server/src/systems/movement.ts` defines a `MovablePlayer` interface with `position`, `rotation`, `speedMultiplier`, and `lastProcessedInput`. The `processInput()` function accepts any object matching this interface — both `GamePlayerState` and any future player-like entity.

**How to apply:** Define narrow interfaces for function parameters. Accept `MovablePlayer` instead of the full `GamePlayerState` so the function works with any compatible type.

### I — Interface Segregation Principle (ISP)

Clients must **not depend on interfaces they do not use**. Prefer small, focused interfaces.

**Good examples in this project:**

- `MovablePlayer` in `systems/movement.ts` only requires 4 fields, not the full `GamePlayerState` with 20+ fields.
- `LobbyPlayer` (id, name, isHost) is a minimal projection of player data for the lobby UI.

**How to apply:** When creating shared types, extract the minimum interface needed for each consumer. Do not pass `GamePlayerState` to UI components that only need a name and color.

### D — Dependency Inversion Principle (DIP)

High-level modules must **not depend on low-level modules**. Both should depend on abstractions.

**Good examples in this project:**

- `InputSender` class constructor takes callbacks (`getKeys`, `getMouse`, `onLocalInput`) rather than directly importing stores or DOM APIs. This makes it testable and decoupled.
- `startGameLoop()` receives the `io` server instance and `gamePlayers` map as parameters rather than importing global state.

**How to apply:** Pass dependencies as parameters or use Zustand stores as a shared abstraction layer. Avoid direct module-level side effects. Prefer constructor/function injection over importing singletons.

## 3. Design Patterns

### Store Pattern (Zustand)

All client-side state management uses Zustand stores. Each domain gets its own store:

- `game-store.ts` — game phase, player snapshots, client-side prediction, chat.
- `network-store.ts` — socket connection, session, room state, lobby players.

**Rules:**

- Keep store actions pure where possible (no side effects in reducers).
- Access stores outside React with `useGameStore.getState()`.
- Use selector functions to minimize re-renders: `useGameStore((s) => s.phase)`.

### Observer Pattern (Socket.io Events)

Event-driven communication between client and server follows the Observer pattern:

- `ClientEvents` defines what the client can emit.
- `ServerEvents` defines what the server can emit.
- Type-safe handling via generic Socket.io types: `Server<ClientEvents, ServerEvents>`.

**Rules:**

- Always define events in `@shadow/shared` for type safety on both sides.
- Validate all inputs on the server before processing (null checks, room membership, permissions).

### Game Loop Pattern (Fixed Timestep)

The server runs a `setInterval` at 20 Hz (50 ms per tick):

1. Check power expirations.
2. Process all queued inputs per player.
3. Process mind-control inputs.
4. Build and broadcast state snapshot.

**Rules:**

- Never do async work inside the game loop.
- Keep tick processing lightweight — no I/O, no database calls.
- All inputs are queued and batch-processed per tick.

### Client-Side Prediction Pattern

The client predicts locally and reconciles with the server:

1. Input is created and sent to the server.
2. Input is immediately applied locally via `applyMovement()`.
3. Input is stored in `pendingInputs`.
4. When a server snapshot arrives, inputs with `seq <= lastProcessedInput` are discarded.
5. Remaining inputs are replayed on top of the server position.

**Rules:**

- Prediction and server **must** use the exact same `applyMovement()` from `@shadow/shared`.
- Never modify shared movement logic without verifying both client and server behavior.

### Component Composition Pattern (React + R3F)

React components compose into the 3D scene and UI overlay:

- `GameScene` -> `Canvas` -> `MenuScene` | `PlayingScene`
- `PlayingScene` -> `LocalPlayer` + `RemotePlayer[]` + `ThirdPersonCamera`
- UI: `App` -> `Routes` -> page components + `GameHUD`

**Rules:**

- Keep rendering components separate from logic — use hooks for logic, components for rendering.
- Use `useFrame` for per-frame updates inside R3F, never `requestAnimationFrame` or `setInterval`.
- Avoid `useState` for high-frequency state — use refs or external mutable objects like `mouseState`.

## 4. File Organization

### Monorepo Package Rules

| Package | Responsibility | Restrictions |
|---------|---------------|--------------|
| `@shadow/shared` | Types, interfaces, enums, constants, pure functions | No React, Express, or Socket.io imports |
| `@shadow/client` | React, Three.js, browser-specific code | Imports from `@shadow/shared` only |
| `@shadow/server` | Express, Socket.io, Node.js-specific code | Imports from `@shadow/shared` only |

### Directory Naming

- Use **kebab-case** for file names: `game-loop.ts`, `network-messages.ts`.
- Group by **feature/domain**, not by type:

```
camera/       — camera-related components
entities/     — player entities (local + remote)
networking/   — input sending, interpolation, shared state
stores/       — Zustand stores
ui/           — UI overlay components
scenes/       — Three.js scene compositions
game/         — server game loop
systems/      — server systems (movement, etc.)
types/        — shared type definitions
```

### Import Conventions

- Use `.js` extension in imports for ESM compatibility.
- Use `@shadow/shared` workspace import for shared code.
- Use `import type` when importing only types:

```typescript
import type { PlayerState } from '@shadow/shared';
import { applyMovement } from '@shadow/shared';
```

- Use barrel exports via `index.ts` files in type directories.

### Environment Variables

Each package has a `.env.example` file (`packages/server/.env.example`, `packages/client/.env.example`). When adding a new environment variable:

1. Add the variable with a sensible default to the corresponding `.env.example` file.
2. Add a comment above it describing its purpose.
3. Update the **Environment Variables** table in `README.md`.
4. Client variables **must** use the `VITE_` prefix (required by Vite to expose them via `import.meta.env`).
5. Server variables are accessed via `process.env`.
6. Never commit `.env` files — only `.env.example` is tracked by git.

## 5. Naming Conventions

| Element | Convention | Examples |
|---------|-----------|----------|
| Files | `kebab-case` | `game-store.ts`, `input-sender.ts` |
| React components | `PascalCase` function | `LocalPlayer`, `GameHUD` |
| React component files | `PascalCase.tsx` | `LocalPlayer.tsx`, `GameHUD.tsx` |
| Hooks | `camelCase` with `use` prefix | `useInput`, `useGameStore` |
| Interfaces / Types | `PascalCase` | `PlayerState`, `GameSettings` |
| Enums | `PascalCase` name, `SCREAMING_SNAKE` values | `PowerType.MIND_CONTROLLER` |
| Constants | `SCREAMING_SNAKE_CASE` | `TICK_RATE`, `PLAYER_COLORS` |
| Functions | `camelCase` | `applyMovement`, `processInput` |
| Socket events | `noun:verb` pattern | `player:input`, `power:activate` |
| Store state | `camelCase` | `localPlayerId`, `snapshotBuffer` |
| Store actions | `camelCase` verb | `setPhase`, `applyServerSnapshot` |
| Booleans | `is` / `has` / `can` prefix | `isAlive`, `hasShield`, `canStart` |

## 6. TypeScript Best Practices

### Strict Mode

The project uses `"strict": true` in `tsconfig.base.json`. Never disable strict checks. All code must pass `strictNullChecks`, `noImplicitAny`, and `strictFunctionTypes`.

### Type-Only Imports

Use `import type` for interfaces, types, or enums used only in type positions:

```typescript
// Correct
import type { PlayerState, InputSnapshot } from '@shadow/shared';
import { applyMovement, yawToQuaternion } from '@shadow/shared';

// Incorrect — mixes type-only and value imports
import { PlayerState, InputSnapshot, applyMovement } from '@shadow/shared';
```

### Avoid `any`

Never use `any`. Use `unknown` for truly unknown types, then narrow with type guards. Use generics where flexibility is needed.

### Prefer Interfaces for Object Shapes

```typescript
// Preferred for object shapes
interface PlayerState {
  id: string;
  name: string;
}

// Acceptable for unions and utility types
type PlayerRole = 'crew' | 'shadow';
type GamePhase = 'lobby' | 'playing' | 'meeting' | 'results';
```

### Tuple Types for Fixed-Length Arrays

```typescript
type Vec3 = [number, number, number];       // Not number[]
type Quat = [number, number, number, number]; // Quaternion
```

### Exhaustive Switch Statements

When switching on an enum or union, handle all cases:

```typescript
function handlePower(power: PowerType): void {
  switch (power) {
    case PowerType.INVISIBLE: /* ... */ break;
    case PowerType.FLASH: /* ... */ break;
    // ... all cases
    default: {
      const _exhaustive: never = power;
      throw new Error(`Unhandled power: ${_exhaustive}`);
    }
  }
}
```

### Typed Socket.io Generics

Always use the typed generics for type safety on both sides:

```typescript
// Server
const io = new Server<ClientEvents, ServerEvents>(httpServer);

// Client
const socket: Socket<ServerEvents, ClientEvents> = io(serverUrl);
```

### Readonly Where Possible

Mark properties as `readonly` for data that must not be mutated after creation. Use `as const` for literal objects like configuration records.

## 7. Code Review Checklist

### General

- [ ] File is under 300 lines.
- [ ] No `any` types.
- [ ] No stray `console.log` — server logs use `[Server]` prefix consistently.
- [ ] No hardcoded magic numbers — named constants are used.
- [ ] All imports use `.js` extension for ESM.
- [ ] `import type` used for type-only imports.

### Architecture

- [ ] Shared logic lives in `@shadow/shared`, not duplicated across packages.
- [ ] Client does not import from server and vice versa.
- [ ] New socket events are defined in `ClientEvents` or `ServerEvents` in `@shadow/shared`.
- [ ] Server validates all client inputs (null checks, permission checks, room membership).

### React / Three.js

- [ ] No `useState` for data updated every frame — refs or external mutable objects used instead.
- [ ] `useFrame` used for per-frame logic, not `requestAnimationFrame` or `setInterval`.
- [ ] Zustand selectors are narrow (select only what the component needs).
- [ ] Component names match their filenames.

### Networking

- [ ] Client prediction and server use the same `applyMovement()` from `@shadow/shared`.
- [ ] Input sequence numbers are validated to prevent replay.
- [ ] Session token validation is performed before processing room/game actions.
- [ ] Chat messages are sanitized and length-limited on the server (max 200 characters).

### Performance

- [ ] No object allocations inside `useFrame` or the game loop that run every tick.
- [ ] Remote player shadows disabled for performance.
- [ ] Snapshot buffer kept small (last 5 entries).
- [ ] No blocking I/O inside the game loop `setInterval`.

### Formatting

- [ ] Code formatted with Prettier (semicolons, single quotes, trailing commas, 100 print width, 2-space indent).
- [ ] `pnpm typecheck` passes with no errors.
- [ ] `pnpm lint` passes with no errors.
