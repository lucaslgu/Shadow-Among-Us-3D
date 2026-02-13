import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { DoorInfo, MazeRoomInfo } from '@shadow/shared';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';
import { playDoorOpen, playDoorClose, playDoorLocked } from '../audio/sound-manager.js';

const INTERACT_RANGE = 3.5;
const INTERACT_RANGE_SQ = INTERACT_RANGE * INTERACT_RANGE;

/** Build a lookup (row,col) -> room name from the rooms array */
function useRoomLookup() {
  const rooms = useGameStore((s) => s.mazeLayout?.rooms);
  return useMemo(() => {
    const map = new Map<string, string>();
    if (!rooms) return map;
    for (const r of rooms) {
      map.set(`${r.row}_${r.col}`, r.name);
    }
    return map;
  }, [rooms]);
}

/** Get the two room names a door connects based on its side */
function getDoorRoomNames(door: DoorInfo, roomLookup: Map<string, string>): [string | null, string | null] {
  const { row, col, side } = door;
  const sideOffsets: Record<string, [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
  const [dr, dc] = sideOffsets[side] ?? [0, 0];
  const roomA = roomLookup.get(`${row}_${col}`) ?? null;
  const roomB = roomLookup.get(`${row + dr}_${col + dc}`) ?? null;
  return [roomA, roomB];
}

export function DoorInteraction() {
  const mazeLayout = useGameStore((s) => s.mazeLayout);
  const roomLookup = useRoomLookup();

  // Nearest interactable door
  const nearestDoorRef = useRef<DoorInfo | null>(null);
  const [nearestDoor, setNearestDoor] = useState<{ door: DoorInfo; isOpen: boolean; isLocked: boolean } | null>(null);

  // Prevent key repeat
  const interactConsumed = useRef(false);

  // E key listener
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'KeyE' && !interactConsumed.current) {
        interactConsumed.current = true;

        // Yield to task interaction if a nearby task is interactable
        const nearTask = useGameStore.getState().nearestInteractTask;
        if (nearTask && nearTask.state !== 'completed' && !nearTask.isBusy) return;

        const door = nearestDoorRef.current;
        if (door) {
          const mazeSnap = useGameStore.getState().mazeSnapshot;
          const doorState = mazeSnap?.doorStates[door.id];
          if (doorState?.isLocked) {
            playDoorLocked();
          } else {
            if (doorState?.isOpen) playDoorClose(); else playDoorOpen();
            const socket = useNetworkStore.getState().socket;
            if (socket) {
              socket.emit('door:interact', { doorId: door.id });
            }
          }
        }
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'KeyE') {
        interactConsumed.current = false;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Check proximity each frame (read position imperatively to avoid re-renders)
  useFrame(() => {
    const { localPosition, mazeSnapshot } = useGameStore.getState();
    if (!mazeLayout || !mazeSnapshot) {
      nearestDoorRef.current = null;
      return;
    }

    const [px, , pz] = localPosition;
    let best: DoorInfo | null = null;
    let bestDistSq = INTERACT_RANGE_SQ;

    for (const door of mazeLayout.doors) {
      const dx = door.position[0] - px;
      const dz = door.position[2] - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = door;
      }
    }

    nearestDoorRef.current = best;

    // Update React state sparingly (only when door id changes)
    const prevId = nearestDoor?.door.id ?? null;
    const newId = best?.id ?? null;
    if (prevId !== newId) {
      if (best) {
        const doorState = mazeSnapshot.doorStates[best.id];
        setNearestDoor({
          door: best,
          isOpen: doorState?.isOpen ?? false,
          isLocked: doorState?.isLocked ?? false,
        });
      } else {
        setNearestDoor(null);
      }
    } else if (best && nearestDoor) {
      // Update open/locked state for same door
      const doorState = mazeSnapshot.doorStates[best.id];
      const isOpen = doorState?.isOpen ?? false;
      const isLocked = doorState?.isLocked ?? false;
      if (isOpen !== nearestDoor.isOpen || isLocked !== nearestDoor.isLocked) {
        setNearestDoor({ door: best, isOpen, isLocked });
      }
    }
  });

  if (!nearestDoor) return null;

  const { door, isOpen, isLocked } = nearestDoor;
  const [roomA, roomB] = getDoorRoomNames(door, roomLookup);
  const roomLabel = roomA && roomB ? `${roomA} \u2194 ${roomB}` : roomA ?? roomB;

  return (
    <group position={[door.position[0], 2.5, door.position[2]]}>
      <Html center distanceFactor={8} zIndexRange={[50, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(0, 0, 0, 0.75)',
          border: isLocked ? '1px solid #ff4444' : '1px solid #44aaff',
          borderRadius: '8px',
          padding: '8px 16px',
          color: '#ffffff',
          fontFamily: 'monospace',
          fontSize: '14px',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          textShadow: '0 0 6px rgba(0,0,0,0.8)',
          userSelect: 'none',
        }}>
          {isLocked ? (
            <span style={{ color: '#ff4444' }}>Trancada</span>
          ) : (
            <>
              <span style={{
                display: 'inline-block',
                background: '#44aaff',
                color: '#000',
                borderRadius: '4px',
                padding: '2px 6px',
                fontWeight: 'bold',
                marginRight: '6px',
                fontSize: '13px',
              }}>E</span>
              {isOpen ? 'Fechar porta' : 'Abrir porta'}
            </>
          )}
          {roomLabel && (
            <div style={{
              fontSize: '11px',
              color: '#aabbcc',
              marginTop: '4px',
              fontStyle: 'italic',
            }}>
              {roomLabel}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}
