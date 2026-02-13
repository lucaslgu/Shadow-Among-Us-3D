import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MazeCell, DoorInfo } from '@shadow/shared';
import { useGameStore } from '../stores/game-store.js';

// ═══════════════════════════════════════════════════════════════
// BFS Pathfinding (same logic as TaskGuide)
// ═══════════════════════════════════════════════════════════════

function worldToCell(x: number, z: number, gridSize: number, cellSize: number): [number, number] {
  const halfMap = (gridSize * cellSize) / 2;
  const col = Math.floor((x + halfMap) / cellSize);
  const row = Math.floor((z + halfMap) / cellSize);
  return [
    Math.max(0, Math.min(gridSize - 1, row)),
    Math.max(0, Math.min(gridSize - 1, col)),
  ];
}

function cellCenterToWorld(row: number, col: number, gridSize: number, cellSize: number): [number, number] {
  const halfMap = (gridSize * cellSize) / 2;
  const x = col * cellSize - halfMap + cellSize / 2;
  const z = row * cellSize - halfMap + cellSize / 2;
  return [x, z];
}

function buildDoorWallSet(doors: DoorInfo[]): Set<string> {
  const set = new Set<string>();
  for (const door of doors) {
    set.add(`${door.row}_${door.col}_${door.side}`);
    switch (door.side) {
      case 'N': if (door.row > 0) set.add(`${door.row - 1}_${door.col}_S`); break;
      case 'S': set.add(`${door.row + 1}_${door.col}_N`); break;
      case 'E': set.add(`${door.row}_${door.col + 1}_W`); break;
      case 'W': if (door.col > 0) set.add(`${door.row}_${door.col - 1}_E`); break;
    }
  }
  return set;
}

function canPass(
  r1: number, c1: number, r2: number, c2: number,
  cells: MazeCell[], gridSize: number,
  doorWallSet: Set<string>,
): boolean {
  const dr = r2 - r1;
  const dc = c2 - c1;
  const idx1 = r1 * gridSize + c1;
  const cell = cells[idx1];
  if (!cell) return false;

  let hasWall: boolean;
  let wallKey: string;

  if (dr === -1 && dc === 0) {
    hasWall = cell.wallNorth;
    wallKey = `${r1}_${c1}_N`;
  } else if (dr === 1 && dc === 0) {
    hasWall = cell.wallSouth;
    wallKey = `${r1}_${c1}_S`;
  } else if (dr === 0 && dc === 1) {
    hasWall = cell.wallEast;
    wallKey = `${r1}_${c1}_E`;
  } else if (dr === 0 && dc === -1) {
    hasWall = cell.wallWest;
    wallKey = `${r1}_${c1}_W`;
  } else {
    return false;
  }

  if (!hasWall) return true;
  return doorWallSet.has(wallKey);
}

function bfsToNearest(
  startR: number, startC: number,
  targets: Set<string>,
  cells: MazeCell[], gridSize: number,
  doorWallSet: Set<string>,
): [number, number][] | null {
  const startKey = `${startR}_${startC}`;
  if (targets.has(startKey)) return [[startR, startC]];

  const queue: [number, number][] = [[startR, startC]];
  const visited = new Set<string>();
  const parent = new Map<string, string | null>();

  visited.add(startKey);
  parent.set(startKey, null);

  const DIRS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  while (queue.length > 0) {
    const [r, c] = queue.shift()!;

    for (const [dr, dc] of DIRS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
      const nk = `${nr}_${nc}`;
      if (visited.has(nk)) continue;
      if (!canPass(r, c, nr, nc, cells, gridSize, doorWallSet)) continue;

      visited.add(nk);
      parent.set(nk, `${r}_${c}`);

      if (targets.has(nk)) {
        const path: [number, number][] = [];
        let curr: string | null = nk;
        while (curr !== null) {
          const parts = curr.split('_').map(Number);
          path.unshift([parts[0], parts[1]]);
          curr = parent.get(curr) ?? null;
        }
        return path;
      }

      queue.push([nr, nc]);
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// OxygenPathGuide — golden dashed line to nearest O2 generator
// ═══════════════════════════════════════════════════════════════

const PATH_Y = 0.08;
const UPDATE_INTERVAL = 0.5;
const MAX_PATH_POINTS = 200;
const O2_THRESHOLD = 50; // show path when oxygen ≤ this

export function OxygenPathGuide() {
  const lineObjRef = useRef<THREE.Line | null>(null);
  const timerRef = useRef(0);

  const mazeLayout = useGameStore((s) => s.mazeLayout);
  const isGhost = useGameStore((s) => s.isGhost);

  const doorWallSet = useMemo(() => {
    if (!mazeLayout?.doors) return new Set<string>();
    return buildDoorWallSet(mazeLayout.doors);
  }, [mazeLayout]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_PATH_POINTS * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, []);

  const material = useMemo(() => {
    return new THREE.LineDashedMaterial({
      color: '#ffaa22',
      dashSize: 0.8,
      gapSize: 0.4,
      linewidth: 1,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
  }, []);

  useFrame((_, delta) => {
    if (!mazeLayout || isGhost) {
      geometry.setDrawRange(0, 0);
      return;
    }

    timerRef.current += delta;
    if (timerRef.current < UPDATE_INTERVAL) {
      (material as any).dashOffset -= delta * 2.5;
      if (lineObjRef.current) lineObjRef.current.computeLineDistances();
      return;
    }
    timerRef.current = 0;

    const store = useGameStore.getState();
    const { localPosition, shipOxygen } = store;

    // Only show when oxygen is low
    if (shipOxygen > O2_THRESHOLD) {
      geometry.setDrawRange(0, 0);
      return;
    }

    const generators = mazeLayout.oxygenGenerators;
    if (!generators || generators.length === 0) {
      geometry.setDrawRange(0, 0);
      return;
    }

    const [px, , pz] = localPosition;
    const { gridSize, cellSize, cells } = mazeLayout;

    // Build target cells from all oxygen generators
    const targetCells = new Set<string>();
    const cellToGen = new Map<string, typeof generators[0]>();

    for (const gen of generators) {
      const [tr, tc] = worldToCell(gen.position[0], gen.position[2], gridSize, cellSize);
      const key = `${tr}_${tc}`;
      targetCells.add(key);
      cellToGen.set(key, gen);
    }

    if (targetCells.size === 0) {
      geometry.setDrawRange(0, 0);
      return;
    }

    // BFS to nearest generator
    const [startR, startC] = worldToCell(px, pz, gridSize, cellSize);
    const cellPath = bfsToNearest(startR, startC, targetCells, cells, gridSize, doorWallSet);

    if (!cellPath || cellPath.length < 2) {
      geometry.setDrawRange(0, 0);
      return;
    }

    // Convert to world coords
    const lastCellKey = `${cellPath[cellPath.length - 1][0]}_${cellPath[cellPath.length - 1][1]}`;
    const targetGen = cellToGen.get(lastCellKey);

    const positions = geometry.attributes.position as THREE.BufferAttribute;
    const arr = positions.array as Float32Array;
    let idx = 0;

    // Player position
    arr[idx++] = px;
    arr[idx++] = PATH_Y;
    arr[idx++] = pz;

    // Cell centers
    for (let i = 1; i < cellPath.length - 1 && idx < (MAX_PATH_POINTS - 1) * 3; i++) {
      const [wr, wc] = cellPath[i];
      const [wx, wz] = cellCenterToWorld(wr, wc, gridSize, cellSize);
      arr[idx++] = wx;
      arr[idx++] = PATH_Y;
      arr[idx++] = wz;
    }

    // Generator position
    if (targetGen && idx < MAX_PATH_POINTS * 3) {
      arr[idx++] = targetGen.position[0];
      arr[idx++] = PATH_Y;
      arr[idx++] = targetGen.position[2];
    } else {
      const [lr, lc] = cellPath[cellPath.length - 1];
      const [lx, lz] = cellCenterToWorld(lr, lc, gridSize, cellSize);
      arr[idx++] = lx;
      arr[idx++] = PATH_Y;
      arr[idx++] = lz;
    }

    const pointCount = idx / 3;
    positions.needsUpdate = true;
    geometry.setDrawRange(0, pointCount);

    if (lineObjRef.current) lineObjRef.current.computeLineDistances();
    (material as any).dashOffset -= delta * 2.5;
  });

  const lineObject = useMemo(() => {
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    line.computeLineDistances();
    return line;
  }, [geometry, material]);

  lineObjRef.current = lineObject;

  if (!mazeLayout) return null;

  return <primitive object={lineObject} />;
}
