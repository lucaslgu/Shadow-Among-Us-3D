import { useRef, useEffect } from 'react';
import { useGameStore } from '../stores/game-store.js';
import { MAP_HALF_EXTENT } from '@shadow/shared';
import type { MazeLayout } from '@shadow/shared';
import * as s from './styles.js';

// ── Constants ──

const DPR = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1;
const WORLD_SIZE = MAP_HALF_EXTENT * 2;
const HALF_WORLD = MAP_HALF_EXTENT;
const INTERNAL_SIZE = 2560;

// ── Colors ──

const BG_COLOR = 'rgba(6, 6, 14, 0.95)';
const ROOM_COLOR = '#14142a';
const ROOM_HIGHLIGHT = '#1c1c3a';
const WALL_COLOR = '#4a4a70';
const ROOM_TEXT_COLOR = '#7878a0';
const PREDICTION_COLOR = '#22d3ee';
const PREDICTION_GLOW = 'rgba(34, 211, 238, 0.3)';

const ERA_COLORS: Record<string, string> = {
  stable: '#4ade80',
  chaosInferno: '#ef4444',
  chaosIce: '#60a5fa',
  chaosGravity: '#a855f7',
};
const ERA_LABELS: Record<string, string> = {
  stable: 'Estável',
  chaosInferno: 'Inferno',
  chaosIce: 'Gelo',
  chaosGravity: 'Gravidade',
};

// ── Helpers ──

function worldToCache(wx: number, wz: number): [number, number] {
  return [
    ((wx + HALF_WORLD) / WORLD_SIZE) * INTERNAL_SIZE,
    ((wz + HALF_WORLD) / WORLD_SIZE) * INTERNAL_SIZE,
  ];
}

// ── Static layer cache ──

function renderStaticLayer(layout: MazeLayout): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = INTERNAL_SIZE;
  canvas.height = INTERNAL_SIZE;
  const ctx = canvas.getContext('2d')!;
  const scale = INTERNAL_SIZE / WORLD_SIZE;
  const cellPx = layout.cellSize * scale;
  const fontSize = Math.max(14, Math.round(16));

  // Room fills
  for (const room of layout.rooms) {
    const [rx, rz] = worldToCache(
      room.position[0] - layout.cellSize / 2,
      room.position[2] - layout.cellSize / 2,
    );
    ctx.fillStyle = ROOM_COLOR;
    ctx.fillRect(rx, rz, cellPx, cellPx);
    const inset = 3;
    ctx.fillStyle = ROOM_HIGHLIGHT;
    ctx.fillRect(rx + inset, rz + inset, cellPx - inset * 2, cellPx - inset * 2);
  }

  // Room names
  ctx.fillStyle = ROOM_TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const maxTextWidth = cellPx * 0.85;
  for (const room of layout.rooms) {
    const [rx, rz] = worldToCache(room.position[0], room.position[2]);
    let fs = fontSize;
    ctx.font = `bold ${fs}px monospace`;
    while (fs > 8 && ctx.measureText(room.name).width > maxTextWidth) {
      fs--;
      ctx.font = `bold ${fs}px monospace`;
    }
    ctx.fillText(room.name, rx, rz);
  }

  // Static walls
  ctx.strokeStyle = WALL_COLOR;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const wall of layout.walls) {
    if (wall.isDynamic || wall.hasDoor) continue;
    const [sx, sz] = worldToCache(wall.start[0], wall.start[1]);
    const [ex, ez] = worldToCache(wall.end[0], wall.end[1]);
    ctx.beginPath();
    ctx.moveTo(sx, sz);
    ctx.lineTo(ex, ez);
    ctx.stroke();
  }

  return canvas;
}

// ── Component ──

export function PredictionOverlay() {
  const open = useGameStore((st) => st.predictionOverlayOpen);
  const predictionData = useGameStore((st) => st.predictionData);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staticCacheRef = useRef<HTMLCanvasElement | null>(null);
  const cachedLayoutRef = useRef<MazeLayout | null>(null);
  const rafRef = useRef(0);

  // Draw loop
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const padding = 60;
    const maxDim = Math.min(window.innerWidth, window.innerHeight) - padding * 2;
    const displaySize = Math.max(400, maxDim);
    const canvasSize = Math.round(displaySize * DPR);
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;
    staticCacheRef.current = null;
    cachedLayoutRef.current = null;

    function draw() {
      const state = useGameStore.getState();
      const { mazeLayout, mazeSnapshot, localPosition, localPlayerId, playerInfo, predictionData: pd } = state;

      ctx!.clearRect(0, 0, canvasSize, canvasSize);
      ctx!.fillStyle = BG_COLOR;
      ctx!.fillRect(0, 0, canvasSize, canvasSize);

      if (!mazeLayout) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Static cache
      if (mazeLayout !== cachedLayoutRef.current) {
        staticCacheRef.current = renderStaticLayer(mazeLayout);
        cachedLayoutRef.current = mazeLayout;
      }

      const scale = canvasSize / WORLD_SIZE;

      ctx!.save();
      ctx!.translate(canvasSize / 2, canvasSize / 2);
      ctx!.translate(-HALF_WORLD * scale, -HALF_WORLD * scale);

      // Static layer
      if (staticCacheRef.current) {
        ctx!.drawImage(staticCacheRef.current, 0, 0, WORLD_SIZE * scale, WORLD_SIZE * scale);
      }

      // Dynamic walls
      if (mazeSnapshot) {
        ctx!.strokeStyle = '#3a4a5a';
        ctx!.lineWidth = Math.max(2, 3 * DPR);
        ctx!.lineCap = 'round';
        for (const wall of mazeLayout.walls) {
          if (!wall.isDynamic && !wall.hasDoor) continue;
          if (wall.isDynamic && mazeSnapshot.dynamicWallStates[wall.id] === false) continue;
          if (wall.hasDoor && wall.doorId) {
            const ds = mazeSnapshot.doorStates[wall.doorId];
            if (ds?.isOpen && !ds.isLocked) continue;
          }
          const wx1 = (wall.start[0] + HALF_WORLD) * scale;
          const wz1 = (wall.start[1] + HALF_WORLD) * scale;
          const wx2 = (wall.end[0] + HALF_WORLD) * scale;
          const wz2 = (wall.end[1] + HALF_WORLD) * scale;
          ctx!.beginPath();
          ctx!.moveTo(wx1, wz1);
          ctx!.lineTo(wx2, wz2);
          ctx!.stroke();
        }
      }

      // Draw current positions of other players
      if (pd?.currentPositions) {
        for (const [playerId, pos] of Object.entries(pd.currentPositions)) {
          const cx = (pos.x + HALF_WORLD) * scale;
          const cz = (pos.z + HALF_WORLD) * scale;
          const dotSize = 8 * DPR;

          // Glow
          ctx!.save();
          ctx!.globalAlpha = 0.3;
          ctx!.beginPath();
          ctx!.arc(cx, cz, dotSize * 2, 0, Math.PI * 2);
          ctx!.fillStyle = pos.color;
          ctx!.fill();
          ctx!.restore();

          // Solid dot
          ctx!.beginPath();
          ctx!.arc(cx, cz, dotSize, 0, Math.PI * 2);
          ctx!.fillStyle = pos.color;
          ctx!.fill();
          ctx!.strokeStyle = '#ffffff';
          ctx!.lineWidth = 2;
          ctx!.stroke();

          // Name label
          ctx!.fillStyle = '#ffffff';
          ctx!.font = `bold ${12 * DPR}px monospace`;
          ctx!.textAlign = 'center';
          ctx!.fillText(pos.name, cx, cz - dotSize - 6);

          // Draw predicted position + dashed line
          const predicted = pd.predictedPositions?.[playerId];
          if (predicted) {
            const px = (predicted.x + HALF_WORLD) * scale;
            const pz = (predicted.z + HALF_WORLD) * scale;

            // Dashed line from current to predicted
            ctx!.save();
            ctx!.setLineDash([6, 4]);
            ctx!.strokeStyle = pos.color;
            ctx!.globalAlpha = 0.5;
            ctx!.lineWidth = 2;
            ctx!.beginPath();
            ctx!.moveTo(cx, cz);
            ctx!.lineTo(px, pz);
            ctx!.stroke();
            ctx!.restore();

            // Predicted position (semi-transparent ring)
            ctx!.save();
            ctx!.globalAlpha = 0.5;
            ctx!.beginPath();
            ctx!.arc(px, pz, dotSize * 1.3, 0, Math.PI * 2);
            ctx!.fillStyle = pos.color;
            ctx!.fill();
            ctx!.restore();

            // "?" label on predicted position
            ctx!.fillStyle = '#ffffff';
            ctx!.font = `bold ${14 * DPR}px monospace`;
            ctx!.textAlign = 'center';
            ctx!.textBaseline = 'middle';
            ctx!.fillText('?', px, pz);
          }
        }
      }

      // Draw local player position
      const lpx = (localPosition[0] + HALF_WORLD) * scale;
      const lpz = (localPosition[2] + HALF_WORLD) * scale;
      const myColor = (localPlayerId && playerInfo[localPlayerId]?.color) || '#4ade80';
      const playerSize = 10 * DPR;

      ctx!.save();
      ctx!.globalAlpha = 0.3;
      ctx!.beginPath();
      ctx!.arc(lpx, lpz, playerSize * 2, 0, Math.PI * 2);
      ctx!.fillStyle = myColor;
      ctx!.fill();
      ctx!.restore();

      ctx!.beginPath();
      ctx!.arc(lpx, lpz, playerSize, 0, Math.PI * 2);
      ctx!.fillStyle = myColor;
      ctx!.fill();
      ctx!.strokeStyle = '#ffffff';
      ctx!.lineWidth = 3;
      ctx!.stroke();

      ctx!.fillStyle = '#ffffff';
      ctx!.font = `bold ${12 * DPR}px monospace`;
      ctx!.textAlign = 'center';
      ctx!.fillText('VOCÊ', lpx, lpz - playerSize - 6);

      ctx!.restore();

      rafRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [open]);

  // ESC / Q to close
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Escape' || e.code === 'KeyQ') {
        useGameStore.getState().closePredictionOverlay();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;

  const hasPredictions = predictionData && Object.keys(predictionData.predictedPositions).length > 0;

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.75)',
      zIndex: 35,
    }}>
      {/* Title */}
      <div style={{
        color: PREDICTION_COLOR,
        fontFamily: 'monospace', fontSize: 16, fontWeight: 700,
        letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8,
      }}>
        PREVISÃO — Mapa de Predição
      </div>

      {/* Era timeline bar */}
      {predictionData?.upcomingEras && <EraTimeline eras={predictionData.upcomingEras} />}

      {/* Loading indicator */}
      {!hasPredictions && (
        <div style={{
          color: s.colors.textMuted, fontFamily: 'monospace', fontSize: 13,
          marginBottom: 8,
        }}>
          Carregando previsões...
        </div>
      )}

      {/* Charges info */}
      <PredictionChargesInfo />

      {/* Map canvas */}
      <canvas ref={canvasRef} style={{
        borderRadius: 10,
        border: `2px solid ${PREDICTION_COLOR}`,
        boxShadow: `0 0 40px ${PREDICTION_GLOW}`,
      }} />

      {/* Instructions */}
      <div style={{
        color: s.colors.textMuted, fontFamily: 'monospace',
        fontSize: 12, marginTop: 10, letterSpacing: 1,
      }}>
        [ESC] ou [Q] para fechar — fecha automaticamente em 15s
      </div>
    </div>
  );
}

function EraTimeline({ eras }: { eras: Array<{ era: string; startsIn: number; duration: number; description: string }> }) {
  return (
    <div style={{
      display: 'flex', gap: 8, marginBottom: 10,
      padding: '6px 14px', background: 'rgba(0,0,0,0.5)',
      borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
    }}>
      {eras.map((e, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 100 }}>
          <div style={{
            fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
            color: ERA_COLORS[e.era] ?? '#ccc', textTransform: 'uppercase',
          }}>
            {ERA_LABELS[e.era] ?? e.era}
          </div>
          <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.5)' }}>
            {e.startsIn <= 0 ? 'AGORA' : `em ${Math.round(e.startsIn)}s`} ({e.duration}s)
          </div>
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)', maxWidth: 120, textAlign: 'center' }}>
            {e.description}
          </div>
        </div>
      ))}
    </div>
  );
}

function PredictionChargesInfo() {
  const localPlayerId = useGameStore((st) => st.localPlayerId);
  const players = useGameStore((st) => st.players);
  const mySnap = localPlayerId ? players[localPlayerId] : null;
  const charges = mySnap?.powerUsesLeft ?? 0;

  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
      <span style={{ color: s.colors.textMuted, fontFamily: 'monospace', fontSize: 12 }}>
        Cargas:
      </span>
      {[0, 1].map((i) => (
        <div key={i} style={{
          width: 14, height: 14, borderRadius: '50%',
          border: `2px solid ${PREDICTION_COLOR}`,
          background: i < charges ? PREDICTION_COLOR : 'transparent',
          transition: 'background 0.2s',
        }} />
      ))}
    </div>
  );
}
