import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNetworkStore } from '../stores/network-store.js';
import { SoundSettings } from './SoundSettings.js';
import * as s from './styles.js';

export function MainMenu() {
  const connected = useNetworkStore((st) => st.connected);
  const playerName = useNetworkStore((st) => st.playerName);
  const setPlayerName = useNetworkStore((st) => st.setPlayerName);
  const navigate = useNavigate();
  const [nameError, setNameError] = useState('');

  function handleAction(path: string) {
    if (!playerName.trim()) {
      setNameError('Enter your name to continue.');
      return;
    }
    if (playerName.trim().length < 2) {
      setNameError('Name must be at least 2 characters.');
      return;
    }
    setNameError('');
    navigate(path);
  }

  return (
    <div style={s.overlay}>
      <div style={s.card}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={s.title}>Shadow Among Us</div>
          <div style={s.subtitle}>3D Social Deduction</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={s.label}>Player Name</label>
          <input
            style={s.input}
            type="text"
            placeholder="Enter your name..."
            value={playerName}
            maxLength={20}
            onChange={(e) => {
              setPlayerName(e.target.value);
              setNameError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAction('/rooms');
            }}
          />
          {nameError && <div style={s.errorText}>{nameError}</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            style={{
              ...s.button,
              opacity: connected ? 1 : 0.5,
              cursor: connected ? 'pointer' : 'not-allowed',
            }}
            disabled={!connected}
            onClick={() => handleAction('/rooms')}
            onMouseOver={(e) => connected && (e.currentTarget.style.background = s.colors.primaryHover)}
            onMouseOut={(e) => connected && (e.currentTarget.style.background = s.colors.primary)}
          >
            Enter Room
          </button>

          <button
            style={{
              ...s.buttonOutline,
              opacity: connected ? 1 : 0.5,
              cursor: connected ? 'pointer' : 'not-allowed',
            }}
            disabled={!connected}
            onClick={() => handleAction('/create-room')}
            onMouseOver={(e) => connected && (e.currentTarget.style.background = s.colors.surfaceHover)}
            onMouseOut={(e) => connected && (e.currentTarget.style.background = 'transparent')}
          >
            Create Room
          </button>
        </div>

        {/* Sound controls */}
        <SoundSettings />

        <div
          style={{
            marginTop: 16,
            textAlign: 'center',
            fontSize: 12,
            color: connected ? s.colors.success : s.colors.warning,
          }}
        >
          {connected ? 'Connected to server' : 'Connecting...'}
        </div>
      </div>
    </div>
  );
}
