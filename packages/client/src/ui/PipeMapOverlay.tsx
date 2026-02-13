import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useGameStore } from '../stores/game-store.js';
import type { PipeNode } from '@shadow/shared';

// ── Constants ──

const PIPE_GREEN = '#00ff88';
const PIPE_GREEN_DIM = '#00aa55';
const BG_COLOR = 'rgba(4, 12, 6, 0.95)';
const NODE_RADIUS = 18;
const PLAYER_MARKER_RADIUS = 6;

/**
 * PipeMapOverlay — shows the underground pipe network schematic when
 * the local player is underground. Displays current position and exit
 * locations as a navigation aid. Players must walk through tunnels.
 */
export function PipeMapOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  const isUnderground = useGameStore((st) => {
    const id = st.localPlayerId;
    if (!id) return false;
    return st.players[id]?.isUnderground ?? false;
  });
  const currentPipeNodeId = useGameStore((st) => {
    const id = st.localPlayerId;
    if (!id) return null;
    return st.players[id]?.currentPipeNodeId ?? null;
  });
  const mazeLayout = useGameStore((st) => st.mazeLayout);

  const pipeNodes = mazeLayout?.pipeNodes;
  const pipeConnections = mazeLayout?.pipeConnections;

  // Pre-compute bounding box and projection for the node positions
  const projection = useMemo(() => {
    if (!pipeNodes || pipeNodes.length === 0) return null;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const n of pipeNodes) {
      const [x, , z] = n.undergroundPosition;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    const rangeX = maxX - minX || 1;
    const rangeZ = maxZ - minZ || 1;
    const padding = 60;

    return { minX, maxX, minZ, maxZ, rangeX, rangeZ, padding };
  }, [pipeNodes]);

  // Map world position (x, z) to canvas pixel position
  const worldToCanvas = useCallback((wx: number, wz: number, canvasW: number, canvasH: number) => {
    if (!projection) return { cx: 0, cy: 0 };
    const { minX, minZ, rangeX, rangeZ, padding } = projection;
    const drawW = canvasW - padding * 2;
    const drawH = canvasH - padding * 2;
    return {
      cx: padding + ((wx - minX) / rangeX) * drawW,
      cy: padding + ((wz - minZ) / rangeZ) * drawH,
    };
  }, [projection]);

  // Map node to canvas pixel position
  const nodeToCanvas = useCallback((node: PipeNode, canvasW: number, canvasH: number) => {
    const [x, , z] = node.undergroundPosition;
    return worldToCanvas(x, z, canvasW, canvasH);
  }, [worldToCanvas]);

  // Render loop
  useEffect(() => {
    if (!isUnderground || !pipeNodes || !pipeConnections || !projection) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 350;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const cw = canvas.width;
    const ch = canvas.height;

    function draw() {
      const state = useGameStore.getState();
      const myId = state.localPlayerId;
      const myS = myId ? state.players[myId] : null;
      const currentNodeId = myS?.currentPipeNodeId;

      ctx!.clearRect(0, 0, cw, ch);

      // Background
      ctx!.fillStyle = BG_COLOR;
      ctx!.beginPath();
      ctx!.roundRect(0, 0, cw, ch, 12 * dpr);
      ctx!.fill();

      // Border
      ctx!.strokeStyle = PIPE_GREEN_DIM;
      ctx!.lineWidth = 2 * dpr;
      ctx!.beginPath();
      ctx!.roundRect(0, 0, cw, ch, 12 * dpr);
      ctx!.stroke();

      // Title
      ctx!.fillStyle = PIPE_GREEN;
      ctx!.font = `bold ${11 * dpr}px 'Courier New', monospace`;
      ctx!.textAlign = 'center';
      ctx!.fillText('PIPE NETWORK', cw / 2, 20 * dpr);

      // Subtitle
      ctx!.fillStyle = PIPE_GREEN_DIM;
      ctx!.font = `${8 * dpr}px 'Courier New', monospace`;
      ctx!.fillText('Walk to an exit | E to climb up', cw / 2, 32 * dpr);

      // Draw connections
      ctx!.strokeStyle = 'rgba(0, 170, 85, 0.4)';
      ctx!.lineWidth = 3 * dpr;
      for (const conn of pipeConnections!) {
        const nodeA = pipeNodes!.find(n => n.id === conn.nodeA);
        const nodeB = pipeNodes!.find(n => n.id === conn.nodeB);
        if (!nodeA || !nodeB) continue;
        const a = nodeToCanvas(nodeA, cw, ch);
        const b = nodeToCanvas(nodeB, cw, ch);
        ctx!.beginPath();
        ctx!.moveTo(a.cx, a.cy);
        ctx!.lineTo(b.cx, b.cy);
        ctx!.stroke();
      }

      // Draw nodes
      for (const node of pipeNodes!) {
        const { cx, cy } = nodeToCanvas(node, cw, ch);
        const isCurrent = node.id === currentNodeId;
        const r = NODE_RADIUS * dpr / 2;

        // Glow for current node
        if (isCurrent) {
          ctx!.save();
          ctx!.beginPath();
          ctx!.arc(cx, cy, r * 2.5, 0, Math.PI * 2);
          ctx!.fillStyle = 'rgba(0, 255, 136, 0.2)';
          ctx!.fill();
          ctx!.restore();
        }

        // Node circle
        ctx!.beginPath();
        ctx!.arc(cx, cy, r, 0, Math.PI * 2);
        ctx!.fillStyle = isCurrent ? '#0a3a1a' : '#0a1a10';
        ctx!.fill();
        ctx!.strokeStyle = isCurrent ? PIPE_GREEN : PIPE_GREEN_DIM;
        ctx!.lineWidth = (isCurrent ? 2.5 : 1.5) * dpr;
        ctx!.stroke();

        // Exit arrow (small upward arrow icon inside node)
        ctx!.fillStyle = isCurrent ? PIPE_GREEN : PIPE_GREEN_DIM;
        ctx!.font = `${8 * dpr}px 'Courier New', monospace`;
        ctx!.textAlign = 'center';
        ctx!.textBaseline = 'middle';
        ctx!.fillText('\u2191', cx, cy); // ↑ arrow

        // Room name label
        ctx!.fillStyle = isCurrent ? '#ffffff' : PIPE_GREEN;
        ctx!.font = `${8 * dpr}px 'Courier New', monospace`;
        ctx!.textAlign = 'center';
        ctx!.textBaseline = 'top';
        ctx!.fillText(node.roomName, cx, cy + r + 3 * dpr);
      }

      // Draw player position marker (real-time from localPosition)
      const localPos = state.localPosition;
      const { cx: plrCx, cy: plrCy } = worldToCanvas(localPos[0], localPos[2], cw, ch);
      const plrR = PLAYER_MARKER_RADIUS * dpr;

      // Pulsing glow
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 300);
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(plrCx, plrCy, plrR * 3, 0, Math.PI * 2);
      ctx!.fillStyle = `rgba(0, 255, 136, ${0.15 * pulse})`;
      ctx!.fill();
      ctx!.restore();

      // Player dot
      ctx!.beginPath();
      ctx!.arc(plrCx, plrCy, plrR, 0, Math.PI * 2);
      ctx!.fillStyle = PIPE_GREEN;
      ctx!.fill();
      ctx!.strokeStyle = '#ffffff';
      ctx!.lineWidth = 1.5 * dpr;
      ctx!.stroke();

      // "YOU" label
      ctx!.fillStyle = '#ffffff';
      ctx!.font = `bold ${7 * dpr}px 'Courier New', monospace`;
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'bottom';
      ctx!.fillText('YOU', plrCx, plrCy - plrR - 2 * dpr);

      rafRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [isUnderground, pipeNodes, pipeConnections, projection, nodeToCanvas, worldToCanvas]);

  if (!isUnderground || !pipeNodes || pipeNodes.length === 0 || !pipeConnections) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      right: 20,
      zIndex: 25,
      pointerEvents: 'none',
    }}>
      <canvas
        ref={canvasRef}
        style={{
          borderRadius: 12,
          boxShadow: '0 0 30px rgba(0, 255, 136, 0.15)',
        }}
      />
    </div>
  );
}
