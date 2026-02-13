import { useState, useRef, useEffect, useCallback } from 'react';
import type { TaskComponentProps } from '../TaskOverlay.js';

const GRID_COLS = 8;
const GRID_ROWS = 6;
const TARGET_COUNT = 6;
const CELL_SIZE = 44;
const SCROLL_SPEED = 0.5; // cells per second
const HIGHLIGHT_DURATION = 2000; // ms a target stays visible

const HEX_CHARS = '0123456789ABCDEF';

interface GridCell {
  char: string;
  isTarget: boolean;
  targetOrder: number; // -1 if not target
  highlightStart: number; // timestamp when it starts glowing
}

export function HackearTerminalTask({ onComplete }: TaskComponentProps) {
  const [grid] = useState<GridCell[][]>(() => {
    const rows: GridCell[][] = [];
    // Create extra rows for scrolling
    for (let r = 0; r < GRID_ROWS * 3; r++) {
      const row: GridCell[] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        row.push({
          char: HEX_CHARS[Math.floor(Math.random() * 16)],
          isTarget: false,
          targetOrder: -1,
          highlightStart: 0,
        });
      }
      rows.push(row);
    }

    // Place targets at staggered positions
    let order = 0;
    for (let t = 0; t < TARGET_COUNT; t++) {
      const r = 2 + Math.floor(t * ((GRID_ROWS * 3 - 4) / TARGET_COUNT));
      const c = Math.floor(Math.random() * GRID_COLS);
      rows[r][c].isTarget = true;
      rows[r][c].targetOrder = order++;
      rows[r][c].highlightStart = t * 3000 + 1000; // stagger appearance
    }
    return rows;
  });

  const [scrollOffset, setScrollOffset] = useState(0);
  const [nextTarget, setNextTarget] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState(false);
  const startTimeRef = useRef(Date.now());
  const rafRef = useRef<number>(0);
  const completedRef = useRef(false);

  // Scroll animation
  useEffect(() => {
    function animate() {
      if (completedRef.current) return;
      const elapsed = Date.now() - startTimeRef.current;
      setScrollOffset(elapsed * SCROLL_SPEED / 1000);
      rafRef.current = requestAnimationFrame(animate);
    }
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleCellClick = useCallback((rowIdx: number, colIdx: number) => {
    if (completedRef.current) return;
    const cell = grid[rowIdx][colIdx];
    const elapsed = Date.now() - startTimeRef.current;

    if (cell.isTarget && cell.targetOrder === nextTarget) {
      // Check if it's currently highlighted
      if (elapsed >= cell.highlightStart && elapsed <= cell.highlightStart + HIGHLIGHT_DURATION) {
        const next = nextTarget + 1;
        setNextTarget(next);
        cell.isTarget = false; // Mark as clicked
        if (next >= TARGET_COUNT) {
          completedRef.current = true;
          setCompleted(true);
          setTimeout(onComplete, 500);
        }
      } else {
        // Clicked target but not highlighted yet
        setError(true);
        setNextTarget(0);
        setTimeout(() => setError(false), 400);
      }
    } else if (cell.isTarget || !cell.isTarget) {
      // Wrong cell
      setError(true);
      setNextTarget(0);
      // Reset all targets
      for (const row of grid) {
        for (const c of row) {
          if (c.targetOrder >= 0) c.isTarget = true;
        }
      }
      setTimeout(() => setError(false), 400);
    }
  }, [grid, nextTarget, onComplete]);

  const elapsed = Date.now() - startTimeRef.current;
  const visibleStartRow = Math.floor(scrollOffset);

  return (
    <div style={{ textAlign: 'center', userSelect: 'none' }}>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, color: '#a855f7' }}>Hack Terminal</div>
      <div style={{ fontSize: 14, color: '#6b6b8a', marginBottom: 12 }}>
        Click the highlighted characters in the correct order
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
        {Array.from({ length: TARGET_COUNT }, (_, i) => (
          <div key={i} style={{
            width: 10, height: 10, borderRadius: '50%',
            background: i < nextTarget ? '#4ade80' : '#2a2a45',
          }} />
        ))}
      </div>

      {error && (
        <div style={{ fontSize: 14, color: '#ef4444', fontWeight: 600, marginBottom: 8 }}>
          Error! Restarting sequence...
        </div>
      )}

      {/* Grid viewport */}
      <div style={{
        width: GRID_COLS * CELL_SIZE, height: GRID_ROWS * CELL_SIZE,
        overflow: 'hidden', margin: '0 auto', borderRadius: 12,
        border: `1px solid ${completed ? '#4ade80' : '#2a2a45'}`,
        background: '#050510', position: 'relative',
      }}>
        <div style={{
          transform: `translateY(-${(scrollOffset % 1) * CELL_SIZE}px)`,
        }}>
          {Array.from({ length: GRID_ROWS + 1 }, (_, visRow) => {
            const rowIdx = (visibleStartRow + visRow) % grid.length;
            const row = grid[rowIdx];
            return (
              <div key={visRow} style={{ display: 'flex' }}>
                {row.map((cell, c) => {
                  const isHighlighted = cell.isTarget &&
                    elapsed >= cell.highlightStart &&
                    elapsed <= cell.highlightStart + HIGHLIGHT_DURATION;
                  const isNextTarget = cell.isTarget && cell.targetOrder === nextTarget && isHighlighted;

                  return (
                    <div
                      key={c}
                      onClick={() => handleCellClick(rowIdx, c)}
                      style={{
                        width: CELL_SIZE, height: CELL_SIZE,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 16, fontWeight: 700,
                        fontFamily: "'Courier New', monospace",
                        color: isNextTarget ? '#4ade80' : isHighlighted ? '#eab308' : '#2a2a55',
                        background: isNextTarget ? 'rgba(74,222,128,0.15)'
                          : isHighlighted ? 'rgba(234,179,8,0.08)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'color 0.2s',
                        border: '1px solid #0a0a1a',
                      }}
                    >
                      {cell.char}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {completed && (
        <div style={{ marginTop: 16, fontSize: 18, fontWeight: 700, color: '#4ade80' }}>
          Terminal hacked!
        </div>
      )}
    </div>
  );
}
