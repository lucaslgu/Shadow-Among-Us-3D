import { useState, useRef, useEffect } from 'react';
import { useNetworkStore } from '../stores/network-store.js';
import { useGameStore } from '../stores/game-store.js';
import * as s from './styles.js';

export function Chat() {
  const [text, setText] = useState('');
  const socket = useNetworkStore((st) => st.socket);
  const lobbyPlayers = useNetworkStore((st) => st.lobbyPlayers);
  const chatMessages = useGameStore((st) => st.chatMessages);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages.length]);

  function resolveName(playerId: string): string {
    const player = lobbyPlayers.find((p) => p.id === playerId);
    return player?.name ?? playerId.slice(0, 8);
  }

  function send() {
    const trimmed = text.trim();
    if (!trimmed || !socket) return;
    socket.emit('chat:message', { text: trimmed });
    setText('');
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          fontSize: 13,
        }}
      >
        {chatMessages.length === 0 && (
          <div style={{ color: s.colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 40 }}>
            No messages yet
          </div>
        )}
        {chatMessages.map((msg) => (
          <div key={msg.id}>
            <span style={{ color: s.colors.primary, fontWeight: 600 }}>
              {resolveName(msg.playerId)}
            </span>
            <span style={{ color: s.colors.textMuted }}>{': '}</span>
            <span style={{ color: s.colors.text }}>{msg.text}</span>
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', borderTop: `1px solid ${s.colors.border}` }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder="Type a message..."
          maxLength={200}
          style={{
            flex: 1,
            padding: '8px 12px',
            background: 'transparent',
            border: 'none',
            color: s.colors.text,
            fontSize: 13,
            outline: 'none',
          }}
        />
        <button
          onClick={send}
          style={{
            padding: '8px 16px',
            background: s.colors.primary,
            border: 'none',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
