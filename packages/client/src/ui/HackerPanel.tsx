import { useState, useMemo, useCallback } from 'react';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';
import { playLightOn, playLightOff, playDoorLocked } from '../audio/sound-manager.js';
import * as s from './styles.js';

/**
 * HackerPanel — fullscreen overlay shown when the Hacker power is active.
 * Lists all rooms with their doors, lights, and dynamic walls.
 * The hacker can remotely lock/unlock doors, toggle lights, and raise/lower walls.
 */

const HACKER_GREEN = '#00ff88';
const HACKER_GREEN_DIM = '#00cc66';
const HACKER_BG = 'rgba(0, 10, 5, 0.95)';
const HACKER_CARD_BG = 'rgba(0, 20, 10, 0.8)';
const HACKER_BORDER = 'rgba(0, 255, 136, 0.2)';

export function HackerPanel() {
  const localPower = useGameStore((st) => st.localPower);
  const localPlayerId = useGameStore((st) => st.localPlayerId);
  const players = useGameStore((st) => st.players);
  const mazeLayout = useGameStore((st) => st.mazeLayout);
  const mazeSnapshot = useGameStore((st) => st.mazeSnapshot);
  const hackerPanelOpen = useGameStore((st) => st.hackerPanelOpen);
  const [search, setSearch] = useState('');
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);

  const isActive = localPower === 'hacker'
    && localPlayerId
    && players[localPlayerId]?.powerActive
    && hackerPanelOpen;

  // Build room data with associated doors, lights, and dynamic walls
  const roomData = useMemo(() => {
    if (!mazeLayout || !mazeSnapshot) return [];

    // Map doors to rooms
    const doorsByRoom = new Map<string, typeof mazeLayout.doors>();
    for (const door of mazeLayout.doors) {
      // Find which room this door belongs to
      const roomId = `room_${door.row}_${door.col}`;
      const room = mazeLayout.rooms.find(r => r.id === roomId);
      const targetRoomId = room ? roomId : findNeighborRoom(door, mazeLayout.rooms);
      if (targetRoomId) {
        const list = doorsByRoom.get(targetRoomId) ?? [];
        list.push(door);
        doorsByRoom.set(targetRoomId, list);
      }
    }

    // Map lights to rooms
    const lightsByRoom = new Map<string, typeof mazeLayout.lights>();
    for (const light of mazeLayout.lights) {
      const roomId = `room_${light.row}_${light.col}`;
      const list = lightsByRoom.get(roomId) ?? [];
      list.push(light);
      lightsByRoom.set(roomId, list);
    }

    // Map dynamic walls to nearest room
    const dynWallsByRoom = new Map<string, string[]>();
    for (const wallId of mazeLayout.dynamicWallIds) {
      const wall = mazeLayout.walls.find(w => w.id === wallId);
      if (!wall) continue;
      const wallCenterX = (wall.start[0] + wall.end[0]) / 2;
      const wallCenterZ = (wall.start[1] + wall.end[1]) / 2;
      // Find nearest room
      let nearestRoom = mazeLayout.rooms[0];
      let nearestDistSq = Infinity;
      for (const room of mazeLayout.rooms) {
        const dx = room.position[0] - wallCenterX;
        const dz = room.position[2] - wallCenterZ;
        const distSq = dx * dx + dz * dz;
        if (distSq < nearestDistSq) {
          nearestDistSq = distSq;
          nearestRoom = room;
        }
      }
      if (nearestDistSq < 15 * 15) { // Only associate if within 15 units
        const list = dynWallsByRoom.get(nearestRoom.id) ?? [];
        list.push(wallId);
        dynWallsByRoom.set(nearestRoom.id, list);
      }
    }

    return mazeLayout.rooms.map(room => ({
      id: room.id,
      name: room.name,
      row: room.row,
      col: room.col,
      position: room.position,
      doors: doorsByRoom.get(room.id) ?? [],
      lights: lightsByRoom.get(room.id) ?? [],
      dynamicWalls: dynWallsByRoom.get(room.id) ?? [],
    })).filter(r => r.doors.length > 0 || r.lights.length > 0 || r.dynamicWalls.length > 0);
  }, [mazeLayout, mazeSnapshot]);

  // Filter by search
  const filteredRooms = useMemo(() => {
    if (!search.trim()) return roomData;
    const q = search.trim().toLowerCase();
    return roomData.filter(r => r.name.toLowerCase().includes(q));
  }, [roomData, search]);

  const handleHackerAction = useCallback((targetType: 'door' | 'light' | 'wall', targetId: string) => {
    const socket = useNetworkStore.getState().socket;
    if (!socket) return;

    if (targetType === 'light') {
      const isOn = mazeSnapshot?.lightStates[targetId] !== false;
      if (isOn) playLightOff(); else playLightOn();
    } else if (targetType === 'door') {
      playDoorLocked();
    }

    socket.emit('hacker:action', { targetType, targetId });
  }, [mazeSnapshot]);

  const handleClose = useCallback(() => {
    const socket = useNetworkStore.getState().socket;
    if (socket) {
      socket.emit('power:deactivate');
    }
    useGameStore.getState().closeHackerPanel();
  }, []);

  if (!isActive) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        background: HACKER_BG,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Courier New', monospace",
        color: HACKER_GREEN,
        overflow: 'hidden',
      }}
    >
      {/* Scanline effect */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,136,0.03) 2px, rgba(0,255,136,0.03) 4px)',
        zIndex: 1,
      }} />

      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: `1px solid ${HACKER_BORDER}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 2,
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2, textShadow: `0 0 10px ${HACKER_GREEN}` }}>
            {'>'} SHIP CONTROL SYSTEM
          </div>
          <div style={{ fontSize: 11, color: HACKER_GREEN_DIM, marginTop: 2 }}>
            Remote access to doors, lights and walls | [Q] or [ESC] to exit
          </div>
        </div>
        <button
          onClick={handleClose}
          style={{
            background: 'rgba(255, 0, 0, 0.2)',
            border: '1px solid #ff4444',
            borderRadius: 4,
            color: '#ff4444',
            padding: '6px 16px',
            fontSize: 12,
            fontFamily: "'Courier New', monospace",
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          [X] CLOSE
        </button>
      </div>

      {/* Search bar */}
      <div style={{ padding: '12px 24px', zIndex: 2, flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Search room..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 14px',
            background: 'rgba(0, 30, 15, 0.8)',
            border: `1px solid ${HACKER_BORDER}`,
            borderRadius: 6,
            color: HACKER_GREEN,
            fontSize: 13,
            fontFamily: "'Courier New', monospace",
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Stats bar */}
      <div style={{
        padding: '0 24px 12px',
        display: 'flex',
        gap: 24,
        fontSize: 11,
        color: HACKER_GREEN_DIM,
        zIndex: 2,
        flexShrink: 0,
      }}>
        <span>Rooms: {filteredRooms.length}</span>
        <span>Doors: {filteredRooms.reduce((sum, r) => sum + r.doors.length, 0)}</span>
        <span>Lights: {filteredRooms.reduce((sum, r) => sum + r.lights.length, 0)}</span>
        <span>Walls: {filteredRooms.reduce((sum, r) => sum + r.dynamicWalls.length, 0)}</span>
      </div>

      {/* Room list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 24px 24px',
        zIndex: 2,
      }}>
        <style>{`
          .hacker-scroll::-webkit-scrollbar { width: 6px; }
          .hacker-scroll::-webkit-scrollbar-track { background: rgba(0,20,10,0.5); border-radius: 3px; }
          .hacker-scroll::-webkit-scrollbar-thumb { background: ${HACKER_GREEN_DIM}; border-radius: 3px; }
        `}</style>
        <div className="hacker-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredRooms.map((room) => {
            const isExpanded = expandedRoom === room.id;
            return (
              <div
                key={room.id}
                style={{
                  background: HACKER_CARD_BG,
                  border: `1px solid ${isExpanded ? HACKER_GREEN : HACKER_BORDER}`,
                  borderRadius: 6,
                  overflow: 'hidden',
                  transition: 'border-color 0.15s',
                }}
              >
                {/* Room header */}
                <div
                  onClick={() => setExpandedRoom(isExpanded ? null : room.id)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>
                      {room.name}
                    </span>
                    <span style={{ fontSize: 10, color: HACKER_GREEN_DIM }}>
                      [{room.row},{room.col}]
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {room.doors.length > 0 && (
                      <span style={{ fontSize: 10, color: HACKER_GREEN_DIM }}>
                        {'\uD83D\uDEAA'}{room.doors.length}
                      </span>
                    )}
                    {room.lights.length > 0 && (
                      <span style={{ fontSize: 10, color: HACKER_GREEN_DIM }}>
                        {'\uD83D\uDCA1'}{room.lights.length}
                      </span>
                    )}
                    {room.dynamicWalls.length > 0 && (
                      <span style={{ fontSize: 10, color: HACKER_GREEN_DIM }}>
                        {'\u{1F9F1}'}{room.dynamicWalls.length}
                      </span>
                    )}
                    <span style={{ fontSize: 12 }}>
                      {isExpanded ? '\u25B2' : '\u25BC'}
                    </span>
                  </div>
                </div>

                {/* Expanded controls */}
                {isExpanded && mazeSnapshot && (
                  <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Doors */}
                    {room.doors.map((door) => {
                      const doorState = mazeSnapshot.doorStates[door.id];
                      const isLocked = doorState?.isLocked ?? false;
                      const isOpen = doorState?.isOpen ?? false;
                      const lockedByMe = doorState?.lockedBy === localPlayerId;

                      return (
                        <div key={door.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          background: 'rgba(0, 40, 20, 0.5)',
                          borderRadius: 4,
                          border: `1px solid ${HACKER_BORDER}`,
                        }}>
                          <div>
                            <span style={{ fontSize: 12, marginRight: 6 }}>{'\uD83D\uDEAA'}</span>
                            <span style={{ fontSize: 12 }}>Door {door.side}</span>
                            <span style={{ fontSize: 10, color: HACKER_GREEN_DIM, marginLeft: 8 }}>
                              {isLocked ? (lockedByMe ? 'LOCKED (by you)' : 'LOCKED') : isOpen ? 'OPEN' : 'CLOSED'}
                            </span>
                          </div>
                          <button
                            onClick={() => handleHackerAction('door', door.id)}
                            style={{
                              background: isLocked && lockedByMe
                                ? 'rgba(0, 255, 136, 0.2)'
                                : isLocked
                                ? 'rgba(255, 0, 0, 0.2)'
                                : 'rgba(255, 136, 0, 0.2)',
                              border: `1px solid ${isLocked && lockedByMe ? HACKER_GREEN : isLocked ? '#ff4444' : '#ff8800'}`,
                              borderRadius: 4,
                              color: isLocked && lockedByMe ? HACKER_GREEN : isLocked ? '#ff4444' : '#ff8800',
                              padding: '4px 12px',
                              fontSize: 11,
                              fontFamily: "'Courier New', monospace",
                              cursor: isLocked && !lockedByMe ? 'not-allowed' : 'pointer',
                              fontWeight: 700,
                              opacity: isLocked && !lockedByMe ? 0.5 : 1,
                            }}
                          >
                            {isLocked && lockedByMe ? 'UNLOCK' : isLocked ? 'LOCKED BY OTHER' : 'LOCK'}
                          </button>
                        </div>
                      );
                    })}

                    {/* Lights */}
                    {room.lights.map((light) => {
                      const isOn = mazeSnapshot.lightStates[light.id] !== false;

                      return (
                        <div key={light.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          background: 'rgba(0, 40, 20, 0.5)',
                          borderRadius: 4,
                          border: `1px solid ${HACKER_BORDER}`,
                        }}>
                          <div>
                            <span style={{ fontSize: 12, marginRight: 6 }}>{'\uD83D\uDCA1'}</span>
                            <span style={{ fontSize: 12 }}>Light</span>
                            <span style={{ fontSize: 10, color: isOn ? '#ffdd44' : '#666', marginLeft: 8 }}>
                              {isOn ? 'ON' : 'OFF'}
                            </span>
                          </div>
                          <button
                            onClick={() => handleHackerAction('light', light.id)}
                            style={{
                              background: isOn ? 'rgba(255, 200, 0, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                              border: `1px solid ${isOn ? '#ffdd44' : '#666'}`,
                              borderRadius: 4,
                              color: isOn ? '#ffdd44' : '#aaa',
                              padding: '4px 12px',
                              fontSize: 11,
                              fontFamily: "'Courier New', monospace",
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            {isOn ? 'TURN OFF' : 'TURN ON'}
                          </button>
                        </div>
                      );
                    })}

                    {/* Dynamic Walls */}
                    {room.dynamicWalls.map((wallId) => {
                      const isClosed = mazeSnapshot.dynamicWallStates[wallId] !== false;

                      return (
                        <div key={wallId} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          background: 'rgba(0, 40, 20, 0.5)',
                          borderRadius: 4,
                          border: `1px solid ${HACKER_BORDER}`,
                        }}>
                          <div>
                            <span style={{ fontSize: 12, marginRight: 6 }}>{'\u{1F9F1}'}</span>
                            <span style={{ fontSize: 12 }}>Wall</span>
                            <span style={{ fontSize: 10, color: isClosed ? '#ff8844' : '#44ff88', marginLeft: 8 }}>
                              {isClosed ? 'RAISED' : 'LOWERED'}
                            </span>
                          </div>
                          <button
                            onClick={() => handleHackerAction('wall', wallId)}
                            style={{
                              background: isClosed ? 'rgba(68, 255, 136, 0.2)' : 'rgba(255, 136, 68, 0.2)',
                              border: `1px solid ${isClosed ? '#44ff88' : '#ff8844'}`,
                              borderRadius: 4,
                              color: isClosed ? '#44ff88' : '#ff8844',
                              padding: '4px 12px',
                              fontSize: 11,
                              fontFamily: "'Courier New', monospace",
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            {isClosed ? 'LOWER' : 'RAISE'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Helper: find the neighboring room for a door that doesn't directly match a room cell
function findNeighborRoom(
  door: { row: number; col: number; side: string },
  rooms: Array<{ id: string; row: number; col: number }>,
): string | null {
  let nRow = door.row;
  let nCol = door.col;
  switch (door.side) {
    case 'N': nRow = door.row - 1; break;
    case 'S': nRow = door.row + 1; break;
    case 'E': nCol = door.col + 1; break;
    case 'W': nCol = door.col - 1; break;
  }
  const neighbor = rooms.find(r => r.row === nRow && r.col === nCol);
  return neighbor?.id ?? null;
}
