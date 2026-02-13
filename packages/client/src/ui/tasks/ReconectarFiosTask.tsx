import { useState, useRef, useCallback } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

const WIRE_COLORS = ['#ef4444', '#3b82f6', '#eab308', '#22c55e', '#a855f7'];
const WIRE_COUNT = 5;

export function ReconectarFiosTask({ onComplete }: TaskComponentProps) {
  const [portOrder] = useState(() =>
    [...Array(WIRE_COUNT).keys()].sort(() => Math.random() - 0.5)
  );
  const [connections, setConnections] = useState<(number | null)[]>(() => Array(WIRE_COUNT).fill(null));
  const [selectedWire, setSelectedWire] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);

  const handleWireClick = useCallback((wireIdx: number) => {
    if (completedRef.current) return;
    // If clicking a connected wire, disconnect it
    if (connections[wireIdx] !== null) {
      setConnections(prev => { const n = [...prev]; n[wireIdx] = null; return n; });
      setSelectedWire(null);
      return;
    }
    setSelectedWire(wireIdx);
  }, [connections]);

  const handlePortClick = useCallback((portIdx: number) => {
    if (completedRef.current || selectedWire === null) return;

    // Check if port is already used
    if (connections.some(c => c === portIdx)) {
      setSelectedWire(null);
      return;
    }

    const newConns = [...connections];
    newConns[selectedWire] = portIdx;
    setConnections(newConns);
    setSelectedWire(null);

    // Check if all connected and correct (wire i connects to port i)
    const allCorrect = newConns.every((port, wire) => port === wire);
    if (allCorrect && newConns.every(p => p !== null)) {
      completedRef.current = true;
      setCompleted(true);
      setTimeout(onComplete, 600);
    }
  }, [selectedWire, connections, onComplete]);

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Reconnect Wires</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 24 }}>
        Connect each wire to the matching color port
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 80, position: 'relative' }}>
        {/* Left: Wires */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: '#6b6b8a', marginBottom: 4, fontWeight: 600 }}>WIRES</div>
          {Array.from({ length: WIRE_COUNT }, (_, i) => {
            const isConnected = connections[i] !== null;
            const isSelected = selectedWire === i;
            return (
              <button
                key={`w-${i}`}
                onClick={() => handleWireClick(i)}
                style={{
                  width: 80, height: 36, borderRadius: 8,
                  background: isConnected ? `${WIRE_COLORS[i]}33` : isSelected ? `${WIRE_COLORS[i]}88` : WIRE_COLORS[i],
                  border: `2px solid ${isSelected ? '#fff' : WIRE_COLORS[i]}`,
                  cursor: completed ? 'default' : 'pointer',
                  fontSize: 12, fontWeight: 700, color: '#fff',
                  opacity: isConnected ? 0.5 : 1,
                }}
              >
                {isConnected ? '---' : `Wire ${i + 1}`}
              </button>
            );
          })}
        </div>

        {/* Right: Ports (shuffled order) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: '#6b6b8a', marginBottom: 4, fontWeight: 600 }}>PORTS</div>
          {portOrder.map(portIdx => {
            const connectedBy = connections.findIndex(c => c === portIdx);
            const hasConnection = connectedBy >= 0;
            return (
              <button
                key={`p-${portIdx}`}
                onClick={() => handlePortClick(portIdx)}
                style={{
                  width: 80, height: 36, borderRadius: 8,
                  background: hasConnection ? `${WIRE_COLORS[portIdx]}33` : '#0a0a12',
                  border: `2px dashed ${WIRE_COLORS[portIdx]}`,
                  cursor: completed ? 'default' : 'pointer',
                  fontSize: 12, fontWeight: 700,
                  color: WIRE_COLORS[portIdx],
                }}
              >
                {hasConnection ? `W${connectedBy + 1}` : `Port`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Connection lines would go here with SVG overlay - simplified for now */}
      <div style={{ marginTop: 24, fontSize: 14, fontWeight: 600, color: completed ? '#4ade80' : '#6b6b8a' }}>
        {completed ? 'All wires reconnected!'
          : selectedWire !== null ? `Wire ${selectedWire + 1} selected — click the matching port`
          : `${connections.filter(c => c !== null).length}/${WIRE_COUNT} connected`
        }
      </div>
    </div>
  );
}
