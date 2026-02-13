import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';

const STYLES = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 1000,
    background: 'rgba(0, 0, 0, 0.92)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    color: '#e2e2f0',
    overflow: 'auto',
  },
  header: {
    padding: '24px 0 16px',
    textAlign: 'center' as const,
    width: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
  },
  timer: {
    fontSize: 20,
    fontWeight: 700,
    color: '#fbbf24',
    marginTop: 6,
  },
  chatSection: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    padding: '0 16px',
    overflow: 'auto',
  },
  chatInput: {
    width: '100%',
    maxWidth: 600,
    padding: '8px 16px',
    marginTop: 8,
    marginBottom: 12,
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid #333',
    borderRadius: 8,
    color: '#e2e2f0',
    fontSize: 14,
    outline: 'none',
  },
  playerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
    gap: 10,
    width: '100%',
    maxWidth: 700,
    padding: '16px',
  },
  playerCard: (selected: boolean, isAlive: boolean) => ({
    background: selected ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.06)',
    border: `2px solid ${selected ? '#ef4444' : isAlive ? '#333' : '#1a1a1a'}`,
    borderRadius: 10,
    padding: '12px 8px',
    textAlign: 'center' as const,
    cursor: isAlive ? 'pointer' : 'default',
    opacity: isAlive ? 1 : 0.4,
    transition: 'border-color 0.15s, background 0.15s',
  }),
  colorDot: (color: string) => ({
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: color,
    margin: '0 auto 6px',
    border: '2px solid rgba(255,255,255,0.2)',
  }),
  skipButton: (selected: boolean) => ({
    padding: '12px 24px',
    borderRadius: 8,
    background: selected ? 'rgba(107, 107, 138, 0.4)' : 'rgba(255,255,255,0.06)',
    border: `2px solid ${selected ? '#6b6b8a' : '#333'}`,
    color: '#e2e2f0',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 8,
  }),
  confirmButton: {
    padding: '12px 32px',
    borderRadius: 8,
    background: '#ef4444',
    border: 'none',
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 12,
    marginBottom: 16,
  },
  resultText: {
    fontSize: 22,
    fontWeight: 700,
    marginTop: 24,
    marginBottom: 16,
    textAlign: 'center' as const,
  },
};

function ChatMessages() {
  const chatMessages = useGameStore((s) => s.chatMessages);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  return (
    <div style={{ maxHeight: 250, overflow: 'auto', marginBottom: 8 }}>
      {chatMessages.map((msg) => (
        <div key={msg.id} style={{ fontSize: 13, marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: '#8bb4ff' }}>{msg.playerName}: </span>
          <span style={{ color: '#ccc' }}>{msg.text}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function ChatInput() {
  const [text, setText] = useState('');

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const socket = useNetworkStore.getState().socket;
    if (socket) socket.emit('chat:message', { text: trimmed });
    setText('');
  }

  return (
    <input
      style={STYLES.chatInput}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
      placeholder="Type a message..."
      maxLength={200}
      autoFocus
    />
  );
}

export function MeetingScreen() {
  const phase = useGameStore((s) => s.phase);
  const meetingPhase = useGameStore((s) => s.meetingPhase);
  const meetingReporterId = useGameStore((s) => s.meetingReporterId);
  const playerInfo = useGameStore((s) => s.playerInfo);
  const players = useGameStore((s) => s.players);
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const hasVoted = useGameStore((s) => s.hasVoted);
  const voteResult = useGameStore((s) => s.voteResult);
  const isGhost = useGameStore((s) => s.isGhost);

  const [selectedTarget, setSelectedTarget] = useState<string | null | undefined>(undefined);
  const [timer, setTimer] = useState(0);

  // Timer countdown
  useEffect(() => {
    if (phase !== 'meeting' || !meetingPhase) return;
    const duration = meetingPhase === 'discussion' ? 30 : meetingPhase === 'voting' ? 30 : 5;
    setTimer(duration);
    const interval = setInterval(() => {
      setTimer((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, meetingPhase]);

  // Reset selection when entering voting phase
  useEffect(() => {
    if (meetingPhase === 'voting') {
      setSelectedTarget(undefined);
    }
  }, [meetingPhase]);

  if (phase !== 'meeting' || !meetingPhase) return null;

  const reporterName = meetingReporterId ? (playerInfo[meetingReporterId]?.name ?? 'Someone') : 'Someone';

  const phaseTitle = meetingPhase === 'discussion' ? 'DISCUSSION'
    : meetingPhase === 'voting' ? 'VOTING'
    : 'RESULT';

  const phaseColor = meetingPhase === 'discussion' ? '#4ade80'
    : meetingPhase === 'voting' ? '#fbbf24'
    : '#ef4444';

  // Build alive player list
  const playerEntries = Object.entries(players)
    .filter(([id]) => id !== localPlayerId) // exclude self
    .map(([id, snap]) => ({
      id,
      name: playerInfo[id]?.name ?? id.slice(0, 8),
      color: playerInfo[id]?.color ?? snap.color,
      isAlive: snap.isAlive,
    }));

  function handleVote() {
    if (selectedTarget === undefined || hasVoted || isGhost) return;
    const socket = useNetworkStore.getState().socket;
    if (!socket) return;
    socket.emit('vote:cast', { targetId: selectedTarget ?? null });
  }

  return (
    <div style={STYLES.overlay}>
      <div style={STYLES.header}>
        <div style={{ ...STYLES.title, color: phaseColor }}>{phaseTitle}</div>
        <div style={{ fontSize: 14, color: '#8bb4ff', marginTop: 4 }}>
          {meetingPhase !== 'result' ? `${reporterName} called a meeting` : ''}
        </div>
        {meetingPhase !== 'result' && (
          <div style={STYLES.timer}>{timer}s</div>
        )}
      </div>

      {/* Discussion phase: chat */}
      {meetingPhase === 'discussion' && (
        <div style={STYLES.chatSection}>
          <ChatMessages />
          <ChatInput />
        </div>
      )}

      {/* Voting phase: player cards */}
      {meetingPhase === 'voting' && !isGhost && (
        <>
          {hasVoted ? (
            <div style={{ fontSize: 16, color: '#4ade80', fontWeight: 700, marginTop: 24 }}>
              Vote registered! Waiting for other players...
            </div>
          ) : (
            <>
              <div style={{ fontSize: 14, color: '#aaa', margin: '8px 0' }}>
                Select who you want to eject:
              </div>
              <div style={STYLES.playerGrid}>
                {playerEntries.map((p) => (
                  <div
                    key={p.id}
                    style={STYLES.playerCard(selectedTarget === p.id, p.isAlive)}
                    onClick={() => p.isAlive && setSelectedTarget(p.id)}
                  >
                    <div style={STYLES.colorDot(p.color)} />
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  </div>
                ))}
              </div>
              <button
                style={STYLES.skipButton(selectedTarget === null)}
                onClick={() => setSelectedTarget(null)}
              >
                SKIP VOTE
              </button>
              {selectedTarget !== undefined && (
                <button style={STYLES.confirmButton} onClick={handleVote}>
                  CONFIRM VOTE
                </button>
              )}
            </>
          )}
        </>
      )}

      {/* Voting phase: ghost view */}
      {meetingPhase === 'voting' && isGhost && (
        <div style={{ fontSize: 16, color: '#6b6b8a', marginTop: 24 }}>
          Ghosts cannot vote.
        </div>
      )}

      {/* Result phase */}
      {meetingPhase === 'result' && voteResult && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          {voteResult.ejectedId ? (
            <>
              <div style={{ ...STYLES.resultText, color: '#ef4444' }}>
                {playerInfo[voteResult.ejectedId]?.name ?? 'Player'} was ejected!
              </div>
              <div style={STYLES.colorDot(playerInfo[voteResult.ejectedId]?.color ?? '#666')} />
            </>
          ) : (
            <div style={{ ...STYLES.resultText, color: '#6b6b8a' }}>
              No one was ejected.
            </div>
          )}

          {/* Vote breakdown */}
          <div style={{ marginTop: 16 }}>
            {Object.entries(voteResult.votes).map(([voterId, targetId]) => (
              <div key={voterId} style={{ fontSize: 13, color: '#aaa', marginBottom: 2 }}>
                <span style={{ fontWeight: 600, color: playerInfo[voterId]?.color ?? '#fff' }}>
                  {playerInfo[voterId]?.name ?? voterId.slice(0, 6)}
                </span>
                {' voted for '}
                <span style={{ fontWeight: 600, color: targetId ? (playerInfo[targetId]?.color ?? '#fff') : '#6b6b8a' }}>
                  {targetId ? (playerInfo[targetId]?.name ?? targetId.slice(0, 6)) : 'Skip'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
