import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════
// Procedural spaceship textures — Canvas-based color + normal maps
// These create realistic hull panels, deck plates, and structural
// surfaces without any external image files.
// ═══════════════════════════════════════════════════════════════

// ── Normal map generation from heightmap via Sobel gradients ──

function heightToNormalMap(heightCanvas: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const hCtx = heightCanvas.getContext('2d')!;
  const hd = hCtx.getImageData(0, 0, w, h).data;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const nCtx = out.getContext('2d')!;
  const img = nCtx.createImageData(w, h);
  const nd = img.data;

  const getH = (px: number, py: number) => {
    px = ((px % w) + w) % w;
    py = ((py % h) + h) % h;
    return hd[(py * w + px) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (getH(x - 1, y) - getH(x + 1, y)) * strength;
      const dy = (getH(x, y - 1) - getH(x, y + 1)) * strength;
      const dz = 1.0;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const i = (y * w + x) * 4;
      nd[i]     = ((dx / len) * 0.5 + 0.5) * 255;
      nd[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      nd[i + 2] = ((dz / len) * 0.5 + 0.5) * 255;
      nd[i + 3] = 255;
    }
  }

  nCtx.putImageData(img, 0, 0);
  return out;
}

function addNoise(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i]     = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(id, 0, 0);
}

function drawRivet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, darkColor: string, lightColor: string) {
  ctx.fillStyle = darkColor;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lightColor;
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

function drawRivetHeight(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = '#cccccc';
  ctx.beginPath();
  ctx.arc(x, y, r + 1, 0, Math.PI * 2);
  ctx.fill();
}

function makeTexture(canvas: HTMLCanvasElement, linear = false): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (linear) tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// ═══════════════════════════════════════════════════════════════
// Wall panel texture — hull plate with seams, rivets, accent strips
// Drawn in neutral gray so material.color can tint per era
// ═══════════════════════════════════════════════════════════════

function createWallTexturesInternal(): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const S = 256;
  const border = 10;
  const rivetR = 3;
  const rivetInset = 20;

  // Rivet positions: 4 corners + 2 mid-top/bottom
  const rivets = [
    [rivetInset, rivetInset], [S - rivetInset, rivetInset],
    [rivetInset, S - rivetInset], [S - rivetInset, S - rivetInset],
    [S / 2, rivetInset], [S / 2, S - rivetInset],
  ];

  // ── Color map (neutral gray tones — era color multiplied in) ──
  const cc = document.createElement('canvas');
  cc.width = S; cc.height = S;
  const c = cc.getContext('2d')!;

  // Base panel
  c.fillStyle = '#b8b8c0';
  c.fillRect(0, 0, S, S);
  addNoise(c, S, S, 8);

  // Panel seam groove (dark)
  c.strokeStyle = '#606068';
  c.lineWidth = 4;
  c.strokeRect(border, border, S - border * 2, S - border * 2);

  // Inner bevel highlight
  c.strokeStyle = '#d0d0d8';
  c.lineWidth = 1;
  c.strokeRect(border + 4, border + 4, S - (border + 4) * 2, S - (border + 4) * 2);

  // Horizontal accent strips (structural ribs)
  c.strokeStyle = '#707078';
  c.lineWidth = 3;
  for (const frac of [0.33, 0.66]) {
    c.beginPath();
    c.moveTo(border + 8, S * frac);
    c.lineTo(S - border - 8, S * frac);
    c.stroke();
  }

  // Vertical center divider (subtle)
  c.strokeStyle = '#909098';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(S / 2, border + 8);
  c.lineTo(S / 2, S - border - 8);
  c.stroke();

  // Rivets
  for (const [rx, ry] of rivets) {
    drawRivet(c, rx, ry, rivetR, '#808088', '#c8c8d0');
  }

  // Random surface scratches
  c.globalAlpha = 0.3;
  c.strokeStyle = '#707078';
  c.lineWidth = 0.5;
  for (let i = 0; i < 12; i++) {
    const x1 = border + 10 + Math.random() * (S - border * 2 - 20);
    const y1 = border + 10 + Math.random() * (S - border * 2 - 20);
    const angle = Math.random() * Math.PI;
    const len = 8 + Math.random() * 35;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x1 + Math.cos(angle) * len, y1 + Math.sin(angle) * len);
    c.stroke();
  }
  c.globalAlpha = 1;

  // ── Height map → Normal map ──
  const hc = document.createElement('canvas');
  hc.width = S; hc.height = S;
  const h = hc.getContext('2d')!;

  // Base height
  h.fillStyle = '#808080';
  h.fillRect(0, 0, S, S);

  // Raised panel interior
  h.fillStyle = '#959595';
  h.fillRect(border + 5, border + 5, S - (border + 5) * 2, S - (border + 5) * 2);

  // Deep seam groove
  h.strokeStyle = '#383838';
  h.lineWidth = 5;
  h.strokeRect(border, border, S - border * 2, S - border * 2);

  // Bevel edge (gradual slope)
  h.strokeStyle = '#606060';
  h.lineWidth = 2;
  h.strokeRect(border + 2, border + 2, S - (border + 2) * 2, S - (border + 2) * 2);

  // Accent strip grooves
  h.strokeStyle = '#585858';
  h.lineWidth = 3;
  for (const frac of [0.33, 0.66]) {
    h.beginPath();
    h.moveTo(border + 8, S * frac);
    h.lineTo(S - border - 8, S * frac);
    h.stroke();
  }

  // Center divider groove
  h.strokeStyle = '#686868';
  h.lineWidth = 2;
  h.beginPath();
  h.moveTo(S / 2, border + 8);
  h.lineTo(S / 2, S - border - 8);
  h.stroke();

  // Raised rivets
  for (const [rx, ry] of rivets) {
    drawRivetHeight(h, rx, ry, rivetR);
  }

  const normalCanvas = heightToNormalMap(hc, 3.5);

  return {
    map: makeTexture(cc),
    normalMap: makeTexture(normalCanvas, true),
  };
}

// ═══════════════════════════════════════════════════════════════
// Floor deck plate texture — diamond tread plate with panel grid
// ═══════════════════════════════════════════════════════════════

function createFloorTexturesInternal(): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const S = 256;
  const tileSize = S / 4;
  const boltR = 2.5;

  // ── Color map ──
  const cc = document.createElement('canvas');
  cc.width = S; cc.height = S;
  const c = cc.getContext('2d')!;

  // Base metal
  c.fillStyle = '#a0a0a8';
  c.fillRect(0, 0, S, S);
  addNoise(c, S, S, 10);

  // Diamond tread pattern (staggered rows)
  c.fillStyle = '#b0b0b8';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const offsetX = (row % 2) * (tileSize / 4);
      const cx = col * (tileSize / 2) + tileSize / 4 + offsetX;
      const cy = row * (tileSize / 2) + tileSize / 4;
      const dw = tileSize * 0.18;
      const dh = tileSize * 0.08;
      c.beginPath();
      c.moveTo(cx, cy - dh);
      c.lineTo(cx + dw, cy);
      c.lineTo(cx, cy + dh);
      c.lineTo(cx - dw, cy);
      c.closePath();
      c.fill();
    }
  }

  // Panel grid seams
  c.strokeStyle = '#606068';
  c.lineWidth = 3;
  c.strokeRect(1, 1, S - 2, S - 2);
  c.beginPath();
  c.moveTo(S / 2, 0); c.lineTo(S / 2, S);
  c.moveTo(0, S / 2); c.lineTo(S, S / 2);
  c.stroke();

  // Bolts at grid intersections
  const boltPositions = [
    [4, 4], [S / 2, 4], [S - 4, 4],
    [4, S / 2], [S / 2, S / 2], [S - 4, S / 2],
    [4, S - 4], [S / 2, S - 4], [S - 4, S - 4],
  ];
  for (const [bx, by] of boltPositions) {
    drawRivet(c, bx, by, boltR, '#808088', '#c0c0c8');
  }

  // Wear marks
  c.globalAlpha = 0.15;
  c.fillStyle = '#505058';
  c.beginPath();
  c.ellipse(S * 0.3, S * 0.7, 20, 12, 0.3, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(S * 0.75, S * 0.25, 15, 10, -0.5, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1;

  // ── Height map → Normal map ──
  const hc = document.createElement('canvas');
  hc.width = S; hc.height = S;
  const h = hc.getContext('2d')!;

  h.fillStyle = '#808080';
  h.fillRect(0, 0, S, S);

  // Raised diamonds
  h.fillStyle = '#a8a8a8';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const offsetX = (row % 2) * (tileSize / 4);
      const cx = col * (tileSize / 2) + tileSize / 4 + offsetX;
      const cy = row * (tileSize / 2) + tileSize / 4;
      const dw = tileSize * 0.18;
      const dh = tileSize * 0.08;
      h.beginPath();
      h.moveTo(cx, cy - dh);
      h.lineTo(cx + dw, cy);
      h.lineTo(cx, cy + dh);
      h.lineTo(cx - dw, cy);
      h.closePath();
      h.fill();
    }
  }

  // Seam grooves
  h.strokeStyle = '#404040';
  h.lineWidth = 4;
  h.strokeRect(1, 1, S - 2, S - 2);
  h.beginPath();
  h.moveTo(S / 2, 0); h.lineTo(S / 2, S);
  h.moveTo(0, S / 2); h.lineTo(S, S / 2);
  h.stroke();

  // Raised bolts
  for (const [bx, by] of boltPositions) {
    drawRivetHeight(h, bx, by, boltR);
  }

  const normalCanvas = heightToNormalMap(hc, 2.5);

  return {
    map: makeTexture(cc),
    normalMap: makeTexture(normalCanvas, true),
  };
}

// ═══════════════════════════════════════════════════════════════
// Beam / structural member texture — industrial I-beam surface
// ═══════════════════════════════════════════════════════════════

function createBeamTexturesInternal(): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const S = 128;

  // ── Color map ──
  const cc = document.createElement('canvas');
  cc.width = S; cc.height = S;
  const c = cc.getContext('2d')!;

  c.fillStyle = '#909098';
  c.fillRect(0, 0, S, S);
  addNoise(c, S, S, 6);

  // Edge chamfer lines
  c.strokeStyle = '#606068';
  c.lineWidth = 3;
  c.strokeRect(3, 3, S - 6, S - 6);

  // Center rib
  c.fillStyle = '#a0a0a8';
  c.fillRect(S * 0.35, 0, S * 0.3, S);

  // Bolt holes along edges
  for (let i = 0; i < 4; i++) {
    const y = S * (0.15 + i * 0.25);
    drawRivet(c, 10, y, 2, '#707078', '#b0b0b8');
    drawRivet(c, S - 10, y, 2, '#707078', '#b0b0b8');
  }

  // ── Height map ──
  const hc = document.createElement('canvas');
  hc.width = S; hc.height = S;
  const h = hc.getContext('2d')!;

  h.fillStyle = '#808080';
  h.fillRect(0, 0, S, S);

  // Raised center rib
  h.fillStyle = '#a0a0a0';
  h.fillRect(S * 0.35, 0, S * 0.3, S);

  // Edge grooves
  h.strokeStyle = '#505050';
  h.lineWidth = 3;
  h.strokeRect(3, 3, S - 6, S - 6);

  // Raised bolts
  for (let i = 0; i < 4; i++) {
    const y = S * (0.15 + i * 0.25);
    drawRivetHeight(h, 10, y, 2);
    drawRivetHeight(h, S - 10, y, 2);
  }

  const normalCanvas = heightToNormalMap(hc, 2);

  return {
    map: makeTexture(cc),
    normalMap: makeTexture(normalCanvas, true),
  };
}

// ═══════════════════════════════════════════════════════════════
// Lazy singletons — created once on first access
// ═══════════════════════════════════════════════════════════════

let _wall: ReturnType<typeof createWallTexturesInternal> | null = null;
let _floor: ReturnType<typeof createFloorTexturesInternal> | null = null;
let _beam: ReturnType<typeof createBeamTexturesInternal> | null = null;

export function getWallTextures() {
  if (!_wall) _wall = createWallTexturesInternal();
  return _wall;
}

export function getFloorTextures() {
  if (!_floor) _floor = createFloorTexturesInternal();
  return _floor;
}

export function getBeamTextures() {
  if (!_beam) _beam = createBeamTexturesInternal();
  return _beam;
}
