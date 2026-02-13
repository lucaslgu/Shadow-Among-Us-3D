import { useParams, Navigate } from 'react-router-dom';
import { useNetworkStore } from '../stores/network-store.js';
import { useGameStore } from '../stores/game-store.js';
import { Chat } from './Chat.js';
import * as s from './styles.js';

const PLAYER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6',
  '#e67e22', '#1abc9c', '#e84393', '#00cec9', '#6c5ce7',
  '#fd79a8', '#ffeaa7', '#dfe6e9', '#636e72', '#b2bec3',
];

export function Lobby() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const playerName = useNetworkStore((st) => st.playerName);
  const playerId = useNetworkStore((st) => st.playerId);
  const currentRoomCode = useNetworkStore((st) => st.currentRoomCode);
  const leaveRoom = useNetworkStore((st) => st.leaveRoom);
  const closeRoom = useNetworkStore((st) => st.closeRoom);
  const lobbyPlayers = useNetworkStore((st) => st.lobbyPlayers);
  const kickPlayer = useNetworkStore((st) => st.kickPlayer);
  const transferHost = useNetworkStore((st) => st.transferHost);
  const readyStates = useNetworkStore((st) => st.readyStates);
  const toggleReady = useNetworkStore((st) => st.toggleReady);
  const startGame = useNetworkStore((st) => st.startGame);
  const roomError = useNetworkStore((st) => st.roomError);
  const socket = useNetworkStore((st) => st.socket);
  const waitingForGame = useNetworkStore((st) => st.waitingForGame);
  const phase = useGameStore((st) => st.phase);

  // Game started — redirect to game route immediately
  if (phase === 'loading' || phase === 'playing') {
    return <Navigate to={`/game/${currentRoomCode ?? roomCode}`} replace />;
  }

  // Block direct URL access: need a name and an active/saved session for this room
  const savedRoomCode = sessionStorage.getItem('shadow_room_code');
  const hasRoomAccess = currentRoomCode === roomCode || savedRoomCode === roomCode;
  if (playerName.trim().length < 2 || !hasRoomAccess) {
    return <Navigate to="/" replace />;
  }

  const me = lobbyPlayers.find((p) => p.id === playerId);
  const isHost = me?.isHost ?? false;
  const myReady = playerId ? (readyStates[playerId] ?? false) : false;
  const allReady = lobbyPlayers.length >= 2 && lobbyPlayers.every((p) => readyStates[p.id]);

  return (
    <div style={s.overlay}>
      {/* Chat sidebar */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 300,
          height: '100vh',
          background: s.colors.surface,
          borderLeft: `1px solid ${s.colors.border}`,
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}
      >
        <div
          style={{
            padding: '16px 16px 12px',
            fontSize: 14,
            fontWeight: 700,
            color: s.colors.text,
            borderBottom: `1px solid ${s.colors.border}`,
          }}
        >
          Chat
        </div>
        <Chat />
      </div>

      {/* Main lobby card — offset to avoid sidebar */}
      <div style={{ ...s.card, width: 480, marginRight: 300 }}>
        <div style={s.title}>Lobby</div>
        <div style={s.subtitle}>Room: {roomCode ?? '...'}</div>

        {/* Waiting for game banner */}
        {waitingForGame && (
          <div
            style={{
              background: 'rgba(251, 191, 36, 0.12)',
              border: `1px solid ${s.colors.warning}`,
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: s.colors.warning }}>
              Game in progress...
            </div>
            <div style={{ fontSize: 12, color: s.colors.textMuted, marginTop: 4 }}>
              Waiting for the current match to end for a new round.
            </div>
          </div>
        )}

        {/* Player List */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 13, color: s.colors.textMuted, marginBottom: 4 }}>
            Players ({lobbyPlayers.length})
          </div>

          {lobbyPlayers.map((player) => {
            const isMe = player.id === playerId;
            const isReady = readyStates[player.id] ?? false;

            return (
              <div
                key={player.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  background: s.colors.bg,
                  borderRadius: 8,
                  border: `1px solid ${isMe ? s.colors.borderFocus : s.colors.border}`,
                }}
              >
                {/* Ready checkmark */}
                <span
                  style={{
                    fontSize: 16,
                    width: 20,
                    textAlign: 'center',
                    color: isReady ? s.colors.success : s.colors.textMuted,
                  }}
                >
                  {isReady ? '\u2713' : '\u25CB'}
                </span>

                {/* Crown icon for host */}
                <span
                  style={{
                    fontSize: 16,
                    width: 20,
                    textAlign: 'center',
                    opacity: player.isHost ? 1 : 0,
                  }}
                  title={player.isHost ? 'Room Admin' : ''}
                >
                  {'\u{1F451}'}
                </span>

                {/* Color dot */}
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: player.color,
                    flexShrink: 0,
                    border: '2px solid rgba(255,255,255,0.2)',
                  }}
                />

                {/* Player name */}
                <span
                  style={{
                    flex: 1,
                    fontSize: 14,
                    fontWeight: isMe ? 700 : 500,
                    color: s.colors.text,
                  }}
                >
                  {player.name}
                  {isMe && (
                    <span style={{ color: s.colors.textMuted, fontWeight: 400, marginLeft: 6 }}>
                      (you)
                    </span>
                  )}
                </span>

                {/* Host actions on other players */}
                {isHost && !isMe && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      style={{
                        padding: '4px 10px',
                        background: 'transparent',
                        border: `1px solid ${s.colors.border}`,
                        borderRadius: 5,
                        color: s.colors.primary,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      onClick={() => transferHost(player.id)}
                      onMouseOver={(e) => (e.currentTarget.style.background = s.colors.surfaceHover)}
                      onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                      title="Transfer admin to this player"
                    >
                      Transfer
                    </button>
                    <button
                      style={{
                        padding: '4px 10px',
                        background: 'transparent',
                        border: `1px solid ${s.colors.danger}33`,
                        borderRadius: 5,
                        color: s.colors.danger,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      onClick={() => kickPlayer(player.id)}
                      onMouseOver={(e) => (e.currentTarget.style.background = '#ef444418')}
                      onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                      title="Kick this player"
                    >
                      Kick
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {lobbyPlayers.length === 0 && (
            <div
              style={{
                padding: 16,
                textAlign: 'center',
                color: s.colors.textMuted,
                fontSize: 13,
              }}
            >
              Waiting for players...
            </div>
          )}
        </div>

        {/* Color Picker */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: s.colors.textMuted, marginBottom: 8 }}>
            Your Color
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PLAYER_COLORS.map((color) => {
              const isMine = me?.color === color;
              const takenBy = lobbyPlayers.find((p) => p.id !== playerId && p.color === color);
              const isTaken = !!takenBy;

              return (
                <button
                  key={color}
                  onClick={() => {
                    if (!isTaken && !isMine) {
                      socket?.emit('player:select-color', { color });
                    }
                  }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: color,
                    border: isMine ? '3px solid #fff' : '3px solid transparent',
                    opacity: isTaken ? 0.25 : 1,
                    cursor: isTaken ? 'not-allowed' : 'pointer',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    color: '#fff',
                    transition: 'border-color 0.15s, opacity 0.15s',
                    outline: 'none',
                  }}
                  title={isTaken ? `Taken by ${takenBy.name}` : isMine ? 'Your color' : 'Select this color'}
                  onMouseOver={(e) => {
                    if (!isTaken && !isMine) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)';
                  }}
                  onMouseOut={(e) => {
                    if (!isMine) e.currentTarget.style.borderColor = 'transparent';
                  }}
                >
                  {isMine ? '\u2713' : ''}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error message */}
        {roomError && <div style={s.errorText}>{roomError}</div>}

        {/* Ready toggle button */}
        <button
          style={{
            ...s.button,
            background: waitingForGame ? s.colors.surfaceHover : myReady ? s.colors.success : s.colors.primary,
            color: waitingForGame ? s.colors.textMuted : undefined,
            cursor: waitingForGame ? 'not-allowed' : 'pointer',
            marginBottom: 8,
          }}
          onClick={() => !waitingForGame && toggleReady()}
          disabled={waitingForGame}
        >
          {waitingForGame ? 'Waiting for match to end...' : myReady ? 'Ready!' : 'Click to Ready Up'}
        </button>

        {/* Start Game (host only) */}
        {isHost && !waitingForGame && (
          <button
            style={{
              ...s.button,
              background: allReady ? s.colors.success : s.colors.surfaceHover,
              color: allReady ? '#fff' : s.colors.textMuted,
              cursor: allReady ? 'pointer' : 'not-allowed',
              marginBottom: 8,
            }}
            onClick={() => allReady && startGame()}
            disabled={!allReady}
          >
            {lobbyPlayers.length < 2
              ? 'Need at least 2 players'
              : allReady
                ? 'Start Game'
                : 'Waiting for all players to ready up...'}
          </button>
        )}

        {isHost && (
          <button
            style={{
              ...s.buttonOutline,
              borderColor: `${s.colors.danger}55`,
              color: s.colors.danger,
              marginBottom: 8,
            }}
            onClick={closeRoom}
            onMouseOver={(e) => (e.currentTarget.style.background = '#ef444418')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Close Room
          </button>
        )}

        <button
          style={s.buttonOutline}
          onClick={leaveRoom}
          onMouseOver={(e) => (e.currentTarget.style.background = s.colors.surfaceHover)}
          onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          Leave Room
        </button>
      </div>
    </div>
  );
}
