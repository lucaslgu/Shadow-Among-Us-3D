import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useNetworkStore } from '../stores/network-store.js';
import * as s from './styles.js';

export function CreateRoom() {
  const playerName = useNetworkStore((st) => st.playerName);
  const createRoom = useNetworkStore((st) => st.createRoom);
  const roomError = useNetworkStore((st) => st.roomError);
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [showPassword, setShowPassword] = useState(false);

  if (playerName.trim().length < 2) return <Navigate to="/" replace />;

  function handleCreate() {
    createRoom(password.trim() || undefined, maxPlayers);
  }

  return (
    <div style={s.overlay}>
      <div style={s.card}>
        <button style={s.backButton} onClick={() => navigate('/')}>
          &larr; Back to Menu
        </button>

        <div style={s.title}>Create Room</div>
        <div style={s.subtitle}>Configure your game room</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Max Players */}
          <div>
            <label style={s.label}>Max Players</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="range"
                min={4}
                max={15}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                style={{ flex: 1, accentColor: s.colors.primary }}
              />
              <span
                style={{
                  minWidth: 32,
                  textAlign: 'center',
                  fontSize: 16,
                  fontWeight: 600,
                  color: s.colors.text,
                }}
              >
                {maxPlayers}
              </span>
            </div>
          </div>

          {/* Password Toggle */}
          <div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                color: s.colors.text,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => {
                  setShowPassword(e.target.checked);
                  if (!e.target.checked) setPassword('');
                }}
                style={{ accentColor: s.colors.primary }}
              />
              Password protect this room
            </label>
          </div>

          {/* Password Input */}
          {showPassword && (
            <div>
              <label style={s.label}>Room Password</label>
              <input
                style={s.input}
                type="text"
                placeholder="Enter a password..."
                value={password}
                maxLength={30}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
              />
            </div>
          )}

          {roomError && <div style={s.errorText}>{roomError}</div>}

          <button
            style={s.button}
            onClick={handleCreate}
            onMouseOver={(e) => (e.currentTarget.style.background = s.colors.primaryHover)}
            onMouseOut={(e) => (e.currentTarget.style.background = s.colors.primary)}
          >
            Create Room
          </button>
        </div>
      </div>
    </div>
  );
}
