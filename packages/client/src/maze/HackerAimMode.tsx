import { useRef, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';
import { playLightOn, playLightOff, playDoorLocked } from '../audio/sound-manager.js';

/**
 * HackerAimMode — shown when the local player is a Hacker with power active.
 * Renders a crosshair overlay and performs raycasting against doors/lights.
 * On click, emits 'hacker:action' to the server.
 */

const RAYCAST_DISTANCE = 30;

// Interactable object userData tag
interface HackerTarget {
  hackerTargetType: 'door' | 'light';
  hackerTargetId: string;
}

function isHackerTarget(userData: Record<string, unknown>): boolean {
  return typeof userData.hackerTargetType === 'string' && typeof userData.hackerTargetId === 'string';
}

export function HackerAimMode() {
  const localPower = useGameStore((s) => s.localPower);
  const players = useGameStore((s) => s.players);
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const { camera, scene } = useThree();

  const raycaster = useRef(new THREE.Raycaster());
  const highlightRef = useRef<THREE.Mesh | null>(null);
  const currentTarget = useRef<{ type: 'door' | 'light'; id: string } | null>(null);

  // Check if hacker power is active
  const isActive = localPower === 'hacker' && localPlayerId && players[localPlayerId]?.powerActive;

  // Handle click
  const handleClick = useCallback(() => {
    if (!currentTarget.current) return;
    const socket = useNetworkStore.getState().socket;
    if (!socket) return;

    // Play sound based on target type
    if (currentTarget.current.type === 'light') {
      const mazeSnap = useGameStore.getState().mazeSnapshot;
      const isOn = mazeSnap?.lightStates[currentTarget.current.id] !== false;
      if (isOn) playLightOff(); else playLightOn();
    } else if (currentTarget.current.type === 'door') {
      playDoorLocked();
    }

    socket.emit('hacker:action', {
      targetType: currentTarget.current.type,
      targetId: currentTarget.current.id,
    });
  }, []);

  // Raycast each frame to find target under crosshair
  useFrame(() => {
    if (!isActive) {
      currentTarget.current = null;
      if (highlightRef.current) highlightRef.current.visible = false;
      return;
    }

    // Cast ray from camera center (screen center = NDC 0,0)
    raycaster.current.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.current.far = RAYCAST_DISTANCE;

    const intersects = raycaster.current.intersectObjects(scene.children, true);

    let found = false;
    for (const hit of intersects) {
      // Walk up the parent chain to find tagged object
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (isHackerTarget(obj.userData)) {
          const data = obj.userData as unknown as HackerTarget;
          currentTarget.current = {
            type: data.hackerTargetType,
            id: data.hackerTargetId,
          };

          // Position highlight
          if (highlightRef.current) {
            highlightRef.current.position.copy(hit.point);
            highlightRef.current.visible = true;
          }
          found = true;
          break;
        }
        obj = obj.parent;
      }
      if (found) break;
    }

    if (!found) {
      currentTarget.current = null;
      if (highlightRef.current) highlightRef.current.visible = false;
    }
  });

  if (!isActive) return null;

  return (
    <>
      {/* Highlight sphere at raycast hit point */}
      <mesh ref={highlightRef} visible={false}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial color="#00ff88" transparent opacity={0.5} depthTest={false} />
      </mesh>

      {/* Crosshair overlay */}
      <Html fullscreen zIndexRange={[100, 0]} style={{ pointerEvents: 'none' }}>
        <div
          onClick={handleClick}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'all',
            cursor: 'crosshair',
          }}
        >
          {/* Crosshair */}
          <svg width="48" height="48" viewBox="0 0 48 48" style={{ filter: 'drop-shadow(0 0 4px #00ff88)' }}>
            <circle cx="24" cy="24" r="12" fill="none" stroke="#00ff88" strokeWidth="2" opacity="0.8" />
            <line x1="24" y1="6" x2="24" y2="18" stroke="#00ff88" strokeWidth="2" opacity="0.6" />
            <line x1="24" y1="30" x2="24" y2="42" stroke="#00ff88" strokeWidth="2" opacity="0.6" />
            <line x1="6" y1="24" x2="18" y2="24" stroke="#00ff88" strokeWidth="2" opacity="0.6" />
            <line x1="30" y1="24" x2="42" y2="24" stroke="#00ff88" strokeWidth="2" opacity="0.6" />
            <circle cx="24" cy="24" r="2" fill="#00ff88" opacity="0.9" />
          </svg>

          {/* Label */}
          <div style={{
            position: 'absolute',
            bottom: '30%',
            color: '#00ff88',
            fontFamily: 'monospace',
            fontSize: '14px',
            textShadow: '0 0 8px #00ff88',
            opacity: currentTarget.current ? 1 : 0.4,
          }}>
            {currentTarget.current
              ? `[HACK] ${currentTarget.current.type.toUpperCase()}: ${currentTarget.current.id}`
              : '[HACKER MODE] Aim at a door or light'}
          </div>
        </div>
      </Html>
    </>
  );
}
