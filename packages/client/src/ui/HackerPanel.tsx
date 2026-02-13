import { useState, useMemo, useCallback } from 'react';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';
import { playLightOn, playLightOff, playDoorLocked } from '../audio/sound-manager.js';

/**
 * HackerPanel — fullscreen overlay shown when the Hacker power is active.
 * Lists all rooms with their doors, lights, dynamic walls, pipes, and O2 generators.
 * The hacker can remotely lock doors/pipes (40s unbreakable), toggle lights/walls,
 * disable O2 generators, and drain ship oxygen.
 */

const HACKER_GREEN = '#00ff88';
const HACKER_GREEN_DIM = '#00cc66';
const HACKER_BG = 'rgba(0, 10, 5, 0.95)';
const HACKER_CARD_BG = 'rgba(0, 20, 10, 0.8)';
const HACKER_BORDER = 'rgba(0, 255, 136, 0.2)';

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 10px',
  background: 'rgba(0, 40, 20, 0.5)',
  borderRadius: 4,
  border: `1px solid ${HACKER_BORDER}`,
};

function hackerBtn(bg: string, border: string, color: string, disabled = false): React.CSSProperties {
  return {
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 4,
    color,
    padding: '4px 12px',
    fontSize: 11,
    fontFamily: "'Courier New', monospace",
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 700,
    opacity: disabled ? 0.5 : 1,
  };
}

export function HackerPanel() {
  const localPower = useGameStore((st) => st.localPower);
  const localPlayerId = useGameStore((st) => st.localPlayerId);
  const players = useGameStore((st) => st.players);
  const mazeLayout = useGameStore((st) => st.mazeLayout);
  const mazeSnapshot = useGameStore((st) => st.mazeSnapshot);
  const hackerPanelOpen = useGameStore((st) => st.hackerPanelOpen);
  const [search, setSearch] = useState('');
  const [expandedRoom, setExpandedRoom] = useState<string | null>(null);
  const [drainCount, setDrainCount] = useState(0);

  const isActive = localPower === 'hacker'
    && localPlayerId
    && players[localPlayerId]?.powerActive
    && hackerPanelOpen;

  // Build room data with associated doors, lights, dynamic walls, pipes, generators
  const roomData = useMemo(() => {
    if (!mazeLayout || !mazeSnapshot) return [];

    // Map doors to rooms
    const doorsByRoom = new Map<string, typeof mazeLayout.doors>();
    for (const door of mazeLayout.doors) {
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
      if (nearestDistSq < 15 * 15) {
        const list = dynWallsByRoom.get(nearestRoom.id) ?? [];
        list.push(wallId);
        dynWallsByRoom.set(nearestRoom.id, list);
      }
    }

    // Map pipes to rooms
    const pipesByRoom = new Map<string, typeof mazeLayout.pipeNodes>();
    for (const pipe of (mazeLayout.pipeNodes ?? [])) {
      const list = pipesByRoom.get(pipe.roomId) ?? [];
      list.push(pipe);
      pipesByRoom.set(pipe.roomId, list);
    }

    // Map generators to rooms
    const gensByRoom = new Map<string, typeof mazeLayout.oxygenGenerators>();
    for (const gen of (mazeLayout.oxygenGenerators ?? [])) {
      const list = gensByRoom.get(gen.roomId) ?? [];
      list.push(gen);
      gensByRoom.set(gen.roomId, list);
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
      pipes: pipesByRoom.get(room.id) ?? [],
      generators: gensByRoom.get(room.id) ?? [],
    })).filter(r => r.doors.length > 0 || r.lights.length > 0 || r.dynamicWalls.length > 0 || r.pipes.length > 0 || r.generators.length > 0);
  }, [mazeLayout, mazeSnapshot]);

  // Filter by search
  const filteredRooms = useMemo(() => {
    if (!search.trim()) return roomData;
    const q = search.trim().toLowerCase();
    return roomData.filter(r => r.name.toLowerCase().includes(q));
  }, [roomData, search]);

  const handleHackerAction = useCallback((targetType: 'door' | 'light' | 'wall' | 'pipe' | 'oxygen_generator' | 'oxygen_drain', targetId: string) => {
    const socket = useNetworkStore.getState().socket;
    if (!socket) return;

    if (targetType === 'light') {
      const isOn = mazeSnapshot?.lightStates[targetId] !== false;
      if (isOn) playLightOff(); else playLightOn();
    } else if (targetType === 'door' || targetType === 'pipe') {
      playDoorLocked();
    }

    if (targetType === 'oxygen_drain') {
      setDrainCount(c => c + 1);
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

  const now = Date.now();

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
            Remote access to doors, pipes, lights, walls and oxygen | [Q] or [ESC] to exit
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

      {/* Stats bar + O2 drain */}
      <div style={{
        padding: '0 24px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 11,
        color: HACKER_GREEN_DIM,
        zIndex: 2,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <span>Rooms: {filteredRooms.length}</span>
          <span>Doors: {filteredRooms.reduce((sum, r) => sum + r.doors.length, 0)}</span>
          <span>Pipes: {filteredRooms.reduce((sum, r) => sum + r.pipes.length, 0)}</span>
          <span>Lights: {filteredRooms.reduce((sum, r) => sum + r.lights.length, 0)}</span>
          <span>O2 Gens: {filteredRooms.reduce((sum, r) => sum + r.generators.length, 0)}</span>
        </div>
        <button
          onClick={() => handleHackerAction('oxygen_drain', '')}
          disabled={drainCount >= 2}
          style={{
            background: drainCount >= 2 ? 'rgba(100, 100, 100, 0.2)' : 'rgba(255, 0, 0, 0.2)',
            border: `1px solid ${drainCount >= 2 ? '#666' : '#ff4444'}`,
            borderRadius: 4,
            color: drainCount >= 2 ? '#666' : '#ff4444',
            padding: '4px 12px',
            fontSize: 11,
            fontFamily: "'Courier New', monospace",
            cursor: drainCount >= 2 ? 'not-allowed' : 'pointer',
            fontWeight: 700,
          }}
        >
          DRAIN O2 -15% ({2 - drainCount} left)
        </button>
      </div>

      {/* Room list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 24px 24px',
        zIndex: 2,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                    {room.pipes.length > 0 && (
                      <span style={{ fontSize: 10, color: HACKER_GREEN_DIM }}>
                        {'\u{1F6C1}'}{room.pipes.length}
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
                    {room.generators.length > 0 && (
                      <span style={{ fontSize: 10, color: HACKER_GREEN_DIM }}>
                        O2:{room.generators.length}
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
                      const isHackerLocked = isLocked && (doorState?.hackerLockExpiresAt ?? 0) > now;
                      const hackerSecs = isHackerLocked ? Math.ceil(((doorState?.hackerLockExpiresAt ?? 0) - now) / 1000) : 0;

                      return (
                        <div key={door.id} style={ROW_STYLE}>
                          <div>
                            <span style={{ fontSize: 12, marginRight: 6 }}>{'\uD83D\uDEAA'}</span>
                            <span style={{ fontSize: 12 }}>Door {door.side}</span>
                            <span style={{ fontSize: 10, color: HACKER_GREEN_DIM, marginLeft: 8 }}>
                              {isHackerLocked ? `LOCKED (${hackerSecs}s)` : isLocked ? 'LOCKED' : isOpen ? 'OPEN' : 'CLOSED'}
                            </span>
                          </div>
                          <button
                            onClick={() => !isLocked && handleHackerAction('door', door.id)}
                            style={hackerBtn(
                              isLocked ? 'rgba(255, 0, 0, 0.2)' : 'rgba(255, 136, 0, 0.2)',
                              isLocked ? '#ff4444' : '#ff8800',
                              isLocked ? '#ff4444' : '#ff8800',
                              isLocked,
                            )}
                          >
                            {isHackerLocked ? `LOCKED ${hackerSecs}s` : isLocked ? 'LOCKED' : 'LOCK 40s'}
                          </button>
                        </div>
                      );
                    })}

                    {/* Pipes */}
                    {room.pipes.map((pipe) => {
                      const pipeLock = mazeSnapshot.pipeLockStates?.[pipe.id];
                      const isLocked = pipeLock?.isLocked ?? false;
                      const isHackerLocked = isLocked && (pipeLock?.hackerLockExpiresAt ?? 0) > now;
                      const hackerSecs = isHackerLocked ? Math.ceil(((pipeLock?.hackerLockExpiresAt ?? 0) - now) / 1000) : 0;

                      return (
                        <div key={pipe.id} style={ROW_STYLE}>
                          <div>
                            <span style={{ fontSize: 12, marginRight: 6 }}>{'\u{1F6C1}'}</span>
                            <span style={{ fontSize: 12 }}>Pipe</span>
                            <span style={{ fontSize: 10, color: HACKER_GREEN_DIM, marginLeft: 8 }}>
                              {isHackerLocked ? `LOCKED (${hackerSecs}s)` : isLocked ? 'LOCKED' : 'OPEN'}
                            </span>
                          </div>
                          <button
                            onClick={() => !isLocked && handleHackerAction('pipe', pipe.id)}
                            style={hackerBtn(
                              isLocked ? 'rgba(255, 0, 0, 0.2)' : 'rgba(0, 200, 255, 0.2)',
                              isLocked ? '#ff4444' : '#00ccff',
                              isLocked ? '#ff4444' : '#00ccff',
                              isLocked,
                            )}
                          >
                            {isHackerLocked ? `LOCKED ${hackerSecs}s` : isLocked ? 'LOCKED' : 'LOCK 40s'}
                          </button>
                        </div>
                      );
                    })}

                    {/* Lights */}
                    {room.lights.map((light) => {
                      const isOn = mazeSnapshot.lightStates[light.id] !== false;

                      return (
                        <div key={light.id} style={ROW_STYLE}>
                          <div>
                            <span style={{ fontSize: 12, marginRight: 6 }}>{'\uD83D\uDCA1'}</span>
                            <span style={{ fontSize: 12 }}>Light</span>
                            <span style={{ fontSize: 10, color: isOn ? '#ffdd44' : '#666', marginLeft: 8 }}>
                              {isOn ? 'ON' : 'OFF'}
                            </span>
                          </div>
                          <button
                            onClick={() => handleHackerAction('light', light.id)}
                            style={hackerBtn(
                              isOn ? 'rgba(255, 200, 0, 0.2)' : 'rgba(100, 100, 100, 0.2)',
                              isOn ? '#ffdd44' : '#666',
                              isOn ? '#ffdd44' : '#aaa',
                            )}
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
                        <div key={wallId} style={ROW_STYLE}>
                          <div>
                            <span style={{ fontSize: 12, marginRight: 6 }}>{'\u{1F9F1}'}</span>
                            <span style={{ fontSize: 12 }}>Wall</span>
                            <span style={{ fontSize: 10, color: isClosed ? '#ff8844' : '#44ff88', marginLeft: 8 }}>
                              {isClosed ? 'RAISED' : 'LOWERED'}
                            </span>
                          </div>
                          <button
                            onClick={() => handleHackerAction('wall', wallId)}
                            style={hackerBtn(
                              isClosed ? 'rgba(68, 255, 136, 0.2)' : 'rgba(255, 136, 68, 0.2)',
                              isClosed ? '#44ff88' : '#ff8844',
                              isClosed ? '#44ff88' : '#ff8844',
                            )}
                          >
                            {isClosed ? 'LOWER' : 'RAISE'}
                          </button>
                        </div>
                      );
                    })}

                    {/* O2 Generators */}
                    {room.generators.map((gen) => {
                      const disabledUntil = mazeSnapshot.disabledGenerators?.[gen.id] ?? 0;
                      const isDisabled = disabledUntil > now;
                      const disabledSecs = isDisabled ? Math.ceil((disabledUntil - now) / 1000) : 0;

                      return (
                        <div key={gen.id} style={ROW_STYLE}>
                          <div>
                            <span style={{ fontSize: 12, marginRight: 6 }}>O2</span>
                            <span style={{ fontSize: 12 }}>Generator</span>
                            <span style={{ fontSize: 10, color: isDisabled ? '#ff4444' : '#44ff88', marginLeft: 8 }}>
                              {isDisabled ? `DISABLED (${disabledSecs}s)` : 'ACTIVE'}
                            </span>
                          </div>
                          <button
                            onClick={() => !isDisabled && handleHackerAction('oxygen_generator', gen.id)}
                            style={hackerBtn(
                              isDisabled ? 'rgba(255, 0, 0, 0.2)' : 'rgba(255, 100, 0, 0.2)',
                              isDisabled ? '#ff4444' : '#ff6600',
                              isDisabled ? '#ff4444' : '#ff6600',
                              isDisabled,
                            )}
                          >
                            {isDisabled ? `DISABLED ${disabledSecs}s` : 'DISABLE 40s'}
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
