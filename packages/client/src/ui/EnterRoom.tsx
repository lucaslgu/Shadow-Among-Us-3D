import { useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useNetworkStore } from '../stores/network-store.js';
import * as s from './styles.js';

export function EnterRoom() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const playerName = useNetworkStore((st) => st.playerName);
  const joinRoom = useNetworkStore((st) => st.joinRoom);
  const roomError = useNetworkStore((st) => st.roomError);
  const pendingJoinRoom = useNetworkStore((st) => st.pendingJoinRoom);
  const setPendingJoinRoom = useNetworkStore((st) => st.setPendingJoinRoom);

  const [password, setPassword] = useState('');

  // Block direct URL access: need a name and a valid pending room
  if (playerName.trim().length < 2 || !pendingJoinRoom || pendingJoinRoom.roomCode !== roomCode) {
    return <Navigate to="/" replace />;
  }

  const hostName = pendingJoinRoom.hostName;

  function handleSubmit() {
    if (!password.trim() || !roomCode) return;
    joinRoom(roomCode, password.trim());
  }

  function handleCancel() {
    setPendingJoinRoom(null);
    navigate('/rooms');
  }

  return (
    <div style={s.overlay}>
      <div style={s.card}>
        <button style={s.backButton} onClick={handleCancel}>
          &larr; Back to Room List
        </button>

        <div style={s.title}>Enter Password</div>
        <div style={s.subtitle}>
          Room {roomCode} by {hostName}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={s.label}>Room Password</label>
            <input
              style={s.input}
              type="password"
              placeholder="Enter the room password..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              autoFocus
            />
          </div>

          {roomError && <div style={s.errorText}>{roomError}</div>}

          <button
            style={s.button}
            onClick={handleSubmit}
            onMouseOver={(e) => (e.currentTarget.style.background = s.colors.primaryHover)}
            onMouseOut={(e) => (e.currentTarget.style.background = s.colors.primary)}
          >
            Join Room
          </button>
        </div>
      </div>
    </div>
  );
}
