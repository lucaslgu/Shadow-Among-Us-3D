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
import { useInput } from './hooks/useInput.js';
import { InputSender } from './networking/input-sender.js';
import { applyMovement, yawToQuaternion, PowerType } from '@shadow/shared';

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

  if (currentRoomCode !== roomCode || (phase !== 'playing' && phase !== 'results')) {
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
    if (phase === 'playing' && socket) {
      const sender = new InputSender(
        socket,
        () => keysRef.current,
        () => mouseRef.current,
        (input) => {
          const gameStore = useGameStore.getState();
          gameStore.addPendingInput(input);
          // Client-side prediction
          const newPos = applyMovement(gameStore.localPosition, input, 1 / 20);
          const newRot = yawToQuaternion(input.mouseX);
          gameStore.updateLocalPosition(newPos, newRot);

          // Check for Q key (power toggle)
          if (actionRef.current.power) {
            actionRef.current.power = false;
            socket.emit('power:activate', {});
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
        }
      }, MIND_CONTROL_INTERVAL);
      mindControlIntervalRef.current = interval;

      return () => {
        clearInterval(interval);
        mindControlIntervalRef.current = null;
      };
    }
  }, [phase, socket, arrowKeysRef, mouseRef]);

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

      {/* Game HUD overlay when playing */}
      {phase === 'playing' && <GameHUD />}

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
