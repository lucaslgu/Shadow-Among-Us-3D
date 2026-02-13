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
  const nearestDoorDistSqRef = useRef(Infinity);
  const [nearestDoor, setNearestDoor] = useState<{ door: DoorInfo; isOpen: boolean; isLocked: boolean; playerInRoom: boolean; lockedAt: number } | null>(null);

  // Tick for cooldown countdown (re-render every second while locked with cooldown)
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!nearestDoor?.isLocked || !nearestDoor.lockedAt) return;
    const remaining = 15_000 - (Date.now() - nearestDoor.lockedAt);
    if (remaining <= 0) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    const timeout = setTimeout(() => clearInterval(id), remaining + 500);
    return () => { clearInterval(id); clearTimeout(timeout); };
  }, [nearestDoor?.isLocked, nearestDoor?.lockedAt]);

  // Prevent key repeat
  const interactConsumed = useRef(false);
  const lockConsumed = useRef(false);

  // E key (open/close) + R key (lock/unlock) listeners
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'KeyE' && !interactConsumed.current) {
        interactConsumed.current = true;

        // Yield to task interaction if a nearby task is interactable AND closer than the door
        const nearTask = useGameStore.getState().nearestInteractTask;
        if (nearTask && nearTask.state !== 'completed' && !nearTask.isBusy
            && nearTask.distanceSq <= nearestDoorDistSqRef.current) return;

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

      // R key: lock/unlock door
      if (e.code === 'KeyR' && !lockConsumed.current) {
        lockConsumed.current = true;
        const door = nearestDoorRef.current;
        if (door) {
          const socket = useNetworkStore.getState().socket;
          if (socket) {
            const mazeSnap = useGameStore.getState().mazeSnapshot;
            const doorState = mazeSnap?.doorStates[door.id];
            // Hacker locks are unbreakable — can't unlock
            if (doorState?.isLocked && doorState.hackerLockExpiresAt > 0 && doorState.hackerLockExpiresAt > Date.now()) return;
            // 15-second cooldown before normal locks can be unlocked
            if (doorState?.isLocked && doorState.lockedAt > 0 && Date.now() - doorState.lockedAt < 15_000) {
              playDoorLocked(); // feedback: still locked
              return;
            }
            if (doorState?.isLocked) {
              playDoorOpen(); // unlock sound
            } else {
              playDoorLocked(); // lock sound
            }
            socket.emit('door:lock', { doorId: door.id });
          }
        }
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'KeyE') {
        interactConsumed.current = false;
      }
      if (e.code === 'KeyR') {
        lockConsumed.current = false;
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
    nearestDoorDistSqRef.current = best ? bestDistSq : Infinity;

    // Determine if player is inside a room (for lock eligibility)
    let playerInRoom = false;
    if (best && mazeLayout) {
      const halfMap = (mazeLayout.gridSize * mazeLayout.cellSize) / 2;
      const playerCol = Math.floor((px + halfMap) / mazeLayout.cellSize);
      const playerRow = Math.floor((pz + halfMap) / mazeLayout.cellSize);
      const sideOffsets: Record<string, [number, number]> = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
      const [dr, dc] = sideOffsets[best.side] ?? [0, 0];
      if (playerRow === best.row && playerCol === best.col) {
        playerInRoom = mazeLayout.rooms.some((r) => r.row === best!.row && r.col === best!.col);
      } else if (playerRow === best.row + dr && playerCol === best.col + dc) {
        playerInRoom = mazeLayout.rooms.some((r) => r.row === best!.row + dr && r.col === best!.col + dc);
      }
    }

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
          playerInRoom,
          lockedAt: doorState?.lockedAt ?? 0,
        });
      } else {
        setNearestDoor(null);
      }
    } else if (best && nearestDoor) {
      // Update open/locked/playerInRoom state for same door
      const doorState = mazeSnapshot.doorStates[best.id];
      const isOpen = doorState?.isOpen ?? false;
      const isLocked = doorState?.isLocked ?? false;
      const lockedAt = doorState?.lockedAt ?? 0;
      if (isOpen !== nearestDoor.isOpen || isLocked !== nearestDoor.isLocked || playerInRoom !== nearestDoor.playerInRoom || lockedAt !== nearestDoor.lockedAt) {
        setNearestDoor({ door: best, isOpen, isLocked, playerInRoom, lockedAt });
      }
    }
  });

  if (!nearestDoor) return null;

  const { door, isOpen, isLocked, playerInRoom } = nearestDoor;
  const [roomA, roomB] = getDoorRoomNames(door, roomLookup);
  const roomLabel = roomA && roomB ? `${roomA} \u2194 ${roomB}` : roomA ?? roomB;

  // Can only lock from inside a room, can unlock from either side
  const canLock = !isLocked && !isOpen && playerInRoom;
  const lockCooldownRemaining = isLocked && nearestDoor.lockedAt > 0
    ? Math.max(0, 15 - Math.floor((Date.now() - nearestDoor.lockedAt) / 1000))
    : 0;
  const isHackerLocked = isLocked && (useGameStore.getState().mazeSnapshot?.doorStates[door.id]?.hackerLockExpiresAt ?? 0) > Date.now();
  const canUnlock = isLocked && !isHackerLocked && lockCooldownRemaining <= 0;

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
            <>
              <span style={{ color: '#ff4444' }}>Locked</span>
              {lockCooldownRemaining > 0 && (
                <span style={{ marginLeft: 8, color: '#ffaa44', fontSize: '12px' }}>
                  ({lockCooldownRemaining}s)
                </span>
              )}
              {canUnlock && (
                <span style={{ marginLeft: 8 }}>
                  <span style={{
                    display: 'inline-block',
                    background: '#ffaa22',
                    color: '#000',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontWeight: 'bold',
                    marginRight: '4px',
                    fontSize: '13px',
                  }}>R</span>
                  Unlock
                </span>
              )}
            </>
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
              {isOpen ? 'Close' : 'Open'}
              {canLock && (
                <span style={{ marginLeft: 10 }}>
                  <span style={{
                    display: 'inline-block',
                    background: '#ffaa22',
                    color: '#000',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontWeight: 'bold',
                    marginRight: '4px',
                    fontSize: '13px',
                  }}>R</span>
                  Lock
                </span>
              )}
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
