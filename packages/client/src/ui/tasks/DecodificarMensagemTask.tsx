import { useState, useEffect, useRef } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function DecodificarMensagemTask({ onComplete }: TaskComponentProps) {
  const [offset] = useState(() => 1 + Math.floor(Math.random() * 24)); // 1-24
  const [targetWord] = useState(() => {
    const words = ['SHIP', 'SHADOW', 'HULL', 'ENGINE', 'ORBIT', 'ASTRO', 'PULSE', 'SIGMA'];
    return words[Math.floor(Math.random() * words.length)];
  });
  const [wheelOffset, setWheelOffset] = useState(0);
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);

  // Encrypt the target word
  const encrypted = targetWord.split('').map(ch => {
    const idx = ALPHABET.indexOf(ch);
    return ALPHABET[(idx + offset) % 26];
  }).join('');

  useEffect(() => {
    if (completedRef.current) return;
    if (((wheelOffset % 26) + 26) % 26 === offset) {
      completedRef.current = true;
      setCompleted(true);
      setTimeout(onComplete, 600);
    }
  }, [wheelOffset, offset, onComplete]);

  function decrypt(ch: string, off: number): string {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) return ch;
    return ALPHABET[((idx - off) % 26 + 26) % 26];
  }

  const currentDecrypt = encrypted.split('').map(ch => decrypt(ch, ((wheelOffset % 26) + 26) % 26)).join('');

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Decode Message</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 24 }}>
        Turn the wheel to decode the encrypted message
      </div>

      {/* Encrypted text */}
      <div style={{
        background: '#0a0a12', border: '1px solid #2a2a45', borderRadius: 12,
        padding: 16, marginBottom: 16,
      }}>
        <div style={{ fontSize: 12, color: '#6b6b8a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
          Encrypted
        </div>
        <div style={{
          fontSize: 32, fontWeight: 700, fontFamily: "'Courier New', monospace",
          color: '#ef4444', letterSpacing: 8,
        }}>{encrypted}</div>
      </div>

      {/* Decoded text (live) */}
      <div style={{
        background: '#0a0a12', border: `1px solid ${completed ? '#4ade80' : '#2a2a45'}`,
        borderRadius: 12, padding: 16, marginBottom: 24,
      }}>
        <div style={{ fontSize: 12, color: '#6b6b8a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
          Decoded
        </div>
        <div style={{
          fontSize: 32, fontWeight: 700, fontFamily: "'Courier New', monospace",
          color: completed ? '#4ade80' : '#44aaff', letterSpacing: 8,
        }}>{currentDecrypt}</div>
      </div>

      {/* Wheel control */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <button onClick={() => setWheelOffset(w => w - 1)} disabled={completed}
          style={{
            width: 48, height: 48, borderRadius: '50%', border: '2px solid #44aaff',
            background: '#0a0a12', color: '#44aaff', fontSize: 24, fontWeight: 700,
            cursor: 'pointer',
          }}>-</button>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', border: '3px solid #44aaff',
          background: '#0a0a18', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 700, color: '#44aaff',
          fontFamily: "'Courier New', monospace",
        }}>
          {((wheelOffset % 26) + 26) % 26}
        </div>
        <button onClick={() => setWheelOffset(w => w + 1)} disabled={completed}
          style={{
            width: 48, height: 48, borderRadius: '50%', border: '2px solid #44aaff',
            background: '#0a0a12', color: '#44aaff', fontSize: 24, fontWeight: 700,
            cursor: 'pointer',
          }}>+</button>
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: completed ? '#4ade80' : '#6b6b8a' }}>
        {completed ? 'Message decoded!' : 'Adjust the cipher offset'}
      </div>
    </div>
  );
}
