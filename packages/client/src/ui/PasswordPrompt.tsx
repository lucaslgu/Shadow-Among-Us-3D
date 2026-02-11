import { useState } from 'react';
import * as s from './styles.js';

interface PasswordPromptProps {
  roomCode: string;
  hostName: string;
  onSubmit: (password: string) => void;
  onCancel: () => void;
  error: string | null;
}

export function PasswordPrompt({ roomCode, hostName, onSubmit, onCancel, error }: PasswordPromptProps) {
  const [password, setPassword] = useState('');

  function handleSubmit() {
    if (!password.trim()) return;
    onSubmit(password.trim());
  }

  return (
    <div style={s.overlay}>
      <div style={s.card}>
        <button style={s.backButton} onClick={onCancel}>
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

          {error && <div style={s.errorText}>{error}</div>}

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
