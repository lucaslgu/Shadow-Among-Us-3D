import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { GameScene } from './scenes/GameScene.js';
import { MainMenu } from './ui/MainMenu.js';
import { CreateRoom } from './ui/CreateRoom.js';
import { RoomList } from './ui/RoomList.js';
import { EnterRoom } from './ui/EnterRoom.js';
import { Lobby } from './ui/Lobby.js';
import { GameHUD } from './ui/GameHUD.js';
import { useNetworkStore } from './stores/network-store.js';
import { setNavigate } from './stores/network-store.js';
import { useGameStore } from './stores/game-store.js';
import { TaskOverlay } from './ui/TaskOverlay.js';
import { useInput } from './hooks/useInput.js';
import { InputSender } from './networking/input-sender.js';
import { applyMovement, yawToQuaternion, PowerType, POWER_CONFIGS, MAP_HALF_EXTENT } from '@shadow/shared';
import { playPowerActivate, playPowerDeactivate, playMuralhaRise, playTeleport } from './audio/sound-manager.js';
import { eraPhysicsState } from './environment/ThreeBodyEnvironment.js';
import { mouseState } from './networking/mouse-state.js';
import { TargetSelector } from './ui/TargetSelector.js';
import { DeathScreen } from './ui/DeathScreen.js';
import { GameEndScreen } from './ui/GameEndScreen.js';
import { LoadingScreen } from './ui/LoadingScreen.js';
import { TeleportMapOverlay } from './ui/TeleportMapOverlay.js';
import { HackerPanel } from './ui/HackerPanel.js';
import { PipeMapOverlay } from './ui/PipeMapOverlay.js';
import { MeetingScreen } from './ui/MeetingScreen.js';
import { GameOverScreen } from './ui/GameOverScreen.js';

function RouterSync() {
  const navigate = useNavigate();

  useEffect(() => {
    setNavigate((path) => navigate(path));
  }, [navigate]);

  return null;
}

function GameGuard() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const currentRoomCode = useNetworkStore((st) => st.currentRoomCode);
  const phase = useGameStore((st) => st.phase);

  if (currentRoomCode !== roomCode || (phase !== 'loading' && phase !== 'playing' && phase !== 'meeting' && phase !== 'results')) {
    return <Navigate to="/" replace />;
  }

  return null;
}

const MIND_CONTROL_SEND_RATE = 20;
const MIND_CONTROL_INTERVAL = 1000 / MIND_CONTROL_SEND_RATE;

function GameNetworkBridge() {
  const socket = useNetworkStore((st) => st.socket);
  const phase = useGameStore((st) => st.phase);
  const { keysRef, mouseRef, arrowKeysRef, actionRef } = useInput();
  const senderRef = useRef<InputSender | null>(null);
  const mindControlIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Main input sender (WASD + prediction)
  useEffect(() => {
    console.log(`[GameNetworkBridge] Input effect: phase=${phase}, socket=${!!socket}`);
    if (phase === 'playing' && socket) {
      const sender = new InputSender(
        socket,
        () => keysRef.current,
        () => mouseRef.current,
        (input) => {
          const gameStore = useGameStore.getState();
          // Block movement input when task overlay, target selector, teleport map, hacker panel, or meeting is open
          if (gameStore.taskOverlayVisible || gameStore.targetingMode || gameStore.teleportMapOpen || gameStore.hackerPanelOpen || gameStore.phase === 'meeting') {
            input.forward = false;
            input.backward = false;
            input.left = false;
            input.right = false;
          }
          gameStore.addPendingInput(input);
          // Client-side prediction with collision context
          const { mazeLayout, mazeSnapshot, localPlayerId, players } = gameStore;
          const mySnap = localPlayerId ? players[localPlayerId] : null;
          const skipCollision = mySnap?.isImpermeable || gameStore.isGhost;
          const collisionCtx = !skipCollision && mazeLayout && mazeSnapshot
            ? { walls: mazeLayout.walls, doorStates: mazeSnapshot.doorStates, dynamicWallStates: mazeSnapshot.dynamicWallStates, muralhaWalls: mazeSnapshot.muralhaWalls }
            : undefined;
          const basePos = applyMovement(gameStore.localPosition, input, 1 / 20, undefined, collisionCtx);
          const newRot = yawToQuaternion(input.mouseX);

          // Ice sliding: add momentum on slippery floor
          let newPos = basePos;
          if (eraPhysicsState.isIce) {
            const dt = 1 / 20;
            const moveX = basePos[0] - gameStore.localPosition[0];
            const moveZ = basePos[2] - gameStore.localPosition[2];
            // Accumulate slide velocity from movement input
            eraPhysicsState.slideVelocityX += moveX * 2.0;
            eraPhysicsState.slideVelocityZ += moveZ * 2.0;
            // Very low friction on ice (0.97 per tick at 20Hz)
            eraPhysicsState.slideVelocityX *= 0.97;
            eraPhysicsState.slideVelocityZ *= 0.97;
            // Apply slide velocity on top of normal movement
            newPos = [
              Math.max(-MAP_HALF_EXTENT, Math.min(MAP_HALF_EXTENT, basePos[0] + eraPhysicsState.slideVelocityX * dt)),
              basePos[1],
              Math.max(-MAP_HALF_EXTENT, Math.min(MAP_HALF_EXTENT, basePos[2] + eraPhysicsState.slideVelocityZ * dt)),
            ];
          } else {
            // Rapidly decay slide velocity when not on ice
            eraPhysicsState.slideVelocityX *= 0.8;
            eraPhysicsState.slideVelocityZ *= 0.8;
          }

          gameStore.updateLocalPosition(newPos, newRot);

          // Check for Q key (power toggle / ghost possess)
          if (actionRef.current.power) {
            actionRef.current.power = false;
            if (gameStore.isGhost) {
              // Ghost: Q triggers possess (request targets)
              socket.emit('power:request-targets');
            } else {
              const { localPower, targetingMode, teleportMapOpen } = gameStore;
              const config = localPower ? POWER_CONFIGS[localPower] : null;

              if (gameStore.hackerPanelOpen) {
                // Q closes hacker panel and deactivates power
                gameStore.closeHackerPanel();
                socket.emit('power:deactivate');
              } else if (teleportMapOpen) {
                // Q cancels teleport map
                gameStore.closeTeleportMap();
              } else if (targetingMode) {
                // Q cancels targeting mode
                gameStore.exitTargetingMode();
              } else if (config?.type === PowerType.HACKER) {
                // Hacker: activate power and open control panel
                playPowerActivate();
                socket.emit('power:activate', {});
                gameStore.openHackerPanel();
              } else if (config?.type === PowerType.TELEPORT) {
                // Teleport: defer — wait for hold/release detection (handled below)
              } else if (config?.requiresTarget && config.targetRange) {
                // Two-step: request nearby targets first
                socket.emit('power:request-targets');
              } else if (config?.type === PowerType.MURALHA) {
                // Muralha: compute ground intersection from camera yaw/pitch
                const { yaw, pitch } = mouseState;
                const EYE_H = 1.2;
                const [px, , pz] = gameStore.localPosition;
                // Camera forward vector from yaw and pitch
                const cosPitch = Math.cos(pitch);
                const fwdX = Math.sin(yaw) * cosPitch;
                const fwdY = -Math.sin(pitch);
                const fwdZ = -Math.cos(yaw) * cosPitch;

                let wallX: number;
                let wallZ: number;
                if (fwdY < -0.01) {
                  // Looking downward — intersect with ground plane y=0
                  const t = Math.min(EYE_H / -fwdY, 20); // cap at 20 units
                  wallX = px + fwdX * t;
                  wallZ = pz + fwdZ * t;
                } else {
                  // Looking up or horizontal — place 8 units ahead
                  wallX = px + Math.sin(yaw) * 8;
                  wallZ = pz - Math.cos(yaw) * 8;
                }
                playMuralhaRise();
                socket.emit('power:activate', { wallPosition: [wallX, wallZ] });
              } else {
                // Direct activation (non-target powers)
                playPowerActivate();
                socket.emit('power:activate', {});
              }
            }
          }

          // Teleport hold/release detection (runs every tick)
          if (!gameStore.isGhost && gameStore.localPower === PowerType.TELEPORT) {
            const downTime = actionRef.current.powerDownTime;
            if (downTime > 0) {
              const elapsed = Date.now() - downTime;
              if (actionRef.current.powerUp) {
                // Q was released
                actionRef.current.powerUp = false;
                actionRef.current.powerDownTime = 0;
                if (elapsed < 400 && !gameStore.teleportMapOpen) {
                  // Quick press — teleport to aim point
                  const { yaw, pitch } = mouseState;
                  const EYE_H = 1.2;
                  const [px, , pz] = gameStore.localPosition;
                  const cosPitch = Math.cos(pitch);
                  const fwdX = Math.sin(yaw) * cosPitch;
                  const fwdY = -Math.sin(pitch);
                  const fwdZ = -Math.cos(yaw) * cosPitch;

                  let tpX: number;
                  let tpZ: number;
                  if (fwdY < -0.01) {
                    const t = Math.min(EYE_H / -fwdY, 30);
                    tpX = px + fwdX * t;
                    tpZ = pz + fwdZ * t;
                  } else {
                    tpX = px + Math.sin(yaw) * 15;
                    tpZ = pz - Math.cos(yaw) * 15;
                  }
                  playTeleport();
                  socket.emit('power:activate', { teleportPosition: [tpX, tpZ] });
                }
              } else if (elapsed > 400 && !gameStore.teleportMapOpen) {
                // Long hold — open fullscreen map
                actionRef.current.powerDownTime = 0;
                gameStore.openTeleportMap();
              }
            }
          }

          // Clean up stale powerUp for non-TELEPORT powers
          if (actionRef.current.powerUp && gameStore.localPower !== PowerType.TELEPORT) {
            actionRef.current.powerUp = false;
            actionRef.current.powerDownTime = 0;
          }
        },
      );
      sender.start();
      senderRef.current = sender;

      return () => {
        sender.stop();
        senderRef.current = null;
      };
    }
  }, [phase, socket, keysRef, mouseRef, actionRef]);

  // Mind Controller arrow-key sender
  useEffect(() => {
    if (phase === 'playing' && socket) {
      const interval = setInterval(() => {
        const gameStore = useGameStore.getState();
        const mySnapshot = gameStore.localPlayerId
          ? gameStore.players[gameStore.localPlayerId]
          : null;

        // Only send if we have an active mind control
        if (mySnapshot?.powerActive && mySnapshot.mindControlTargetId && gameStore.localPower === PowerType.MIND_CONTROLLER) {
          const arrows = arrowKeysRef.current;
          const hasInput = arrows.forward || arrows.backward || arrows.left || arrows.right;
          if (hasInput) {
            socket.emit('mind-control:input', {
              forward: arrows.forward,
              backward: arrows.backward,
              left: arrows.left,
              right: arrows.right,
              mouseX: mouseRef.current.x,
            });
          }
          // E key: activate the controlled player's power
          if (actionRef.current.mindControlPower) {
            actionRef.current.mindControlPower = false;
            socket.emit('mind-control:activate-power');
          }
        }
      }, MIND_CONTROL_INTERVAL);
      mindControlIntervalRef.current = interval;

      return () => {
        clearInterval(interval);
        mindControlIntervalRef.current = null;
      };
    }
  }, [phase, socket, arrowKeysRef, mouseRef]);

  // Ghost possession arrow-key sender
  useEffect(() => {
    if (phase === 'playing' && socket) {
      const interval = setInterval(() => {
        const gameStore = useGameStore.getState();
        if (!gameStore.isGhost) return;

        const mySnapshot = gameStore.localPlayerId
          ? gameStore.players[gameStore.localPlayerId]
          : null;

        if (mySnapshot?.ghostPossessTargetId) {
          // Update game store with the possession target
          gameStore.setGhostPossessTarget(mySnapshot.ghostPossessTargetId);

          const arrows = arrowKeysRef.current;
          socket.emit('ghost:possess-input', {
            forward: arrows.forward,
            backward: arrows.backward,
            left: arrows.left,
            right: arrows.right,
            mouseX: mouseRef.current.x,
          });
        } else if (gameStore.ghostPossessTarget) {
          // Possession ended on server
          gameStore.setGhostPossessTarget(null);
        }

        // Sync cooldown from server snapshot
        if (mySnapshot?.powerCooldownEnd !== undefined) {
          gameStore.setGhostPossessCooldownEnd(mySnapshot.powerCooldownEnd);
        }
      }, MIND_CONTROL_INTERVAL);

      return () => clearInterval(interval);
    }
  }, [phase, socket, arrowKeysRef, mouseRef]);

  // Power deactivation sound + close hacker panel
  useEffect(() => {
    if (phase !== 'playing' || !socket) return;
    const handler = ({ powerType }: { powerType: string }) => {
      playPowerDeactivate();
      if (powerType === PowerType.HACKER) {
        useGameStore.getState().closeHackerPanel();
      }
    };
    socket.on('power:ended', handler as any);
    return () => { socket.off('power:ended', handler as any); };
  }, [phase, socket]);

  // Target selection listeners
  useEffect(() => {
    if (phase !== 'playing' || !socket) return;

    const onNearbyTargets = ({ targets }: { targets: any[] }) => {
      useGameStore.getState().enterTargetingMode(targets);
    };

    const onNoTargets = () => {
      // No targets in range — could show a brief notification in the future
      console.log('[Power] No targets in range');
    };

    const onPowerActivated = ({ playerId, copiedPower }: { playerId: string; copiedPower?: string }) => {
      const gameStore = useGameStore.getState();
      if (copiedPower && playerId === gameStore.localPlayerId) {
        useGameStore.setState({ localPower: copiedPower as PowerType });
      }
    };

    socket.on('power:nearby-targets', onNearbyTargets as any);
    socket.on('power:no-targets', onNoTargets as any);
    socket.on('power:activated', onPowerActivated as any);

    return () => {
      socket.off('power:nearby-targets', onNearbyTargets as any);
      socket.off('power:no-targets', onNoTargets as any);
      socket.off('power:activated', onPowerActivated as any);
    };
  }, [phase, socket]);

  // TODO: remove after testing — debug power cycling with P key
  useEffect(() => {
    if (phase !== 'playing' || !socket) return;

    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'KeyP') {
        socket!.emit('debug:cycle-power');
      }
    }

    const onPowerChanged = ({ power }: { power: string }) => {
      useGameStore.setState({ localPower: power as PowerType });
    };

    window.addEventListener('keydown', onKeyDown);
    socket.on('debug:power-changed', onPowerChanged as any);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      socket!.off('debug:power-changed', onPowerChanged as any);
    };
  }, [phase, socket]);

  return null;
}

export function App() {
  const connect = useNetworkStore((st) => st.connect);
  const phase = useGameStore((st) => st.phase);

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <RouterSync />
      <GameNetworkBridge />

      {/* 3D background scene — always visible behind menus */}
      <GameScene />

      {/* Loading screen overlay — shown while all players load 3D scene */}
      {phase === 'loading' && <LoadingScreen />}

      {/* Game HUD overlay when playing */}
      {phase === 'playing' && <GameHUD />}

      {/* Task mini-game overlay */}
      {phase === 'playing' && <TaskOverlay />}

      {/* Target selection overlay */}
      {phase === 'playing' && <TargetSelector />}

      {/* Teleport map overlay */}
      {phase === 'playing' && <TeleportMapOverlay />}

      {/* Hacker control panel overlay */}
      {phase === 'playing' && <HackerPanel />}

      {/* Underground pipe map overlay */}
      {phase === 'playing' && <PipeMapOverlay />}

      {/* Death screen overlay */}
      {phase === 'playing' && <DeathScreen />}

      {/* Meeting screen overlay */}
      {phase === 'meeting' && <MeetingScreen />}

      {/* Game end results overlay */}
      {phase === 'results' && <GameOverScreen />}

      {/* UI overlay based on current route */}
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/create-room" element={<CreateRoom />} />
        <Route path="/rooms" element={<RoomList />} />
        <Route path="/enter-room/:roomCode" element={<EnterRoom />} />
        <Route path="/lobby/:roomCode" element={<Lobby />} />
        {/* No overlay for /game — only GameScene + HUD visible */}
        <Route path="/game/:roomCode" element={<GameGuard />} />
      </Routes>
    </div>
  );
}
