import React, { useState, useEffect, useRef } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

// Pipe directions: each tile has connections on N/E/S/W
// Rotation: 0=default, 1=90, 2=180, 3=270 degrees CW
type PipeType = 'straight' | 'corner' | 'tee' | 'cross';

interface Tile { type: PipeType; rotation: number; targetRotation: number; }

const GRID = 4;

// Connections for each pipe type at rotation 0
const PIPE_CONNECTIONS: Record<PipeType, boolean[]> = {
  straight: [true, false, true, false],  // N-S
  corner:   [true, true, false, false],  // N-E
  tee:      [true, true, false, true],   // N-E-W
  cross:    [true, true, true, true],    // all
};

function getConnections(type: PipeType, rotation: number): [boolean, boolean, boolean, boolean] {
  const base = PIPE_CONNECTIONS[type];
  const r = ((rotation % 4) + 4) % 4;
  // Rotate connections: N→E→S→W for each 90° CW rotation
  const rotated = [false, false, false, false];
  for (let i = 0; i < 4; i++) {
    rotated[(i + r) % 4] = base[i];
  }
  return rotated as [boolean, boolean, boolean, boolean];
}

function generatePuzzle(): Tile[] {
  const types: PipeType[] = ['straight', 'corner', 'tee', 'cross'];
  const tiles: Tile[] = [];
  for (let i = 0; i < GRID * GRID; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const targetRotation = Math.floor(Math.random() * 4);
    // Scramble: add random offset
    const scramble = (targetRotation + 1 + Math.floor(Math.random() * 3)) % 4;
    tiles.push({ type, rotation: scramble, targetRotation });
  }
  return tiles;
}

function checkFlow(tiles: Tile[]): boolean {
  // Check if left edge connects to right edge
  // Simplified: check all tiles match their target rotation
  return tiles.every(t => t.rotation % 4 === t.targetRotation);
}

export function ConsertarTubulacaoTask({ onComplete }: TaskComponentProps) {
  const [tiles, setTiles] = useState<Tile[]>(() => generatePuzzle());
  const [completed, setCompleted] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    if (completedRef.current) return;
    if (checkFlow(tiles)) {
      completedRef.current = true;
      setCompleted(true);
      setTimeout(onComplete, 600);
    }
  }, [tiles, onComplete]);

  function rotateTile(index: number) {
    if (completedRef.current) return;
    setTiles(prev => {
      const next = [...prev];
      next[index] = { ...next[index], rotation: (next[index].rotation + 1) % 4 };
      return next;
    });
  }

  const TILE_SIZE = 64;
  const PIPE_COLOR = '#44aaff';

  function renderPipe(tile: Tile, matched: boolean) {
    const conns = getConnections(tile.type, tile.rotation);
    const half = TILE_SIZE / 2;
    const color = matched ? '#4ade80' : PIPE_COLOR;

    // SVG lines from center to each connected edge
    const lines: React.ReactNode[] = [];
    if (conns[0]) lines.push(<line key="n" x1={half} y1={half} x2={half} y2={0} stroke={color} strokeWidth={8} />);
    if (conns[1]) lines.push(<line key="e" x1={half} y1={half} x2={TILE_SIZE} y2={half} stroke={color} strokeWidth={8} />);
    if (conns[2]) lines.push(<line key="s" x1={half} y1={half} x2={half} y2={TILE_SIZE} stroke={color} strokeWidth={8} />);
    if (conns[3]) lines.push(<line key="w" x1={half} y1={half} x2={0} y2={half} stroke={color} strokeWidth={8} />);

    return (
      <svg width={TILE_SIZE} height={TILE_SIZE}>
        {lines}
        <circle cx={half} cy={half} r={6} fill={color} />
      </svg>
    );
  }

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Consertar Tubulação</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 24 }}>
        Clique nos azulejos para girar e conectar os tubos
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${GRID}, ${TILE_SIZE}px)`,
        gap: 2, justifyContent: 'center', marginBottom: 24,
      }}>
        {tiles.map((tile, i) => {
          const matched = tile.rotation % 4 === tile.targetRotation;
          return (
            <div
              key={i}
              onClick={() => rotateTile(i)}
              style={{
                width: TILE_SIZE, height: TILE_SIZE,
                background: matched ? 'rgba(74,222,128,0.08)' : '#0a0a12',
                border: `1px solid ${matched ? '#4ade8044' : '#2a2a45'}`,
                cursor: completed ? 'default' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {renderPipe(tile, matched)}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: completed ? '#4ade80' : '#6b6b8a' }}>
        {completed ? 'Tubulação conectada!' : 'Gire os azulejos para alinhar os tubos'}
      </div>
    </div>
  );
}
