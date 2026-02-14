import type { MazeCell, MazeLayout, WallSegment, DoorInfo, LightInfo, MazeRoomInfo, TaskStationInfo, TaskType, DecoObjectInfo, DecoType, ShelterZone, OxygenGeneratorInfo, EmergencyButtonInfo, PipeNode, PipeConnection, PipeWall } from './maze-types.js';
import { TASK_REGISTRY, TASK_TYPES_BY_DIFFICULTY } from './task-registry.js';

// ═══════════════════════════════════════════════════════════════
// Deterministic PRNG (mulberry32)
// ═══════════════════════════════════════════════════════════════

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seeded shuffle (Fisher-Yates)
function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ═══════════════════════════════════════════════════════════════
// Union-Find for Kruskal's algorithm
// ═══════════════════════════════════════════════════════════════

class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = new Array(size).fill(0);
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb;
    } else if (this.rank[ra] > this.rank[rb]) {
      this.parent[rb] = ra;
    } else {
      this.parent[rb] = ra;
      this.rank[ra]++;
    }
    return true;
  }

  connected(a: number, b: number): boolean {
    return this.find(a) === this.find(b);
  }
}

// ═══════════════════════════════════════════════════════════════
// Maze edge representation
// ═══════════════════════════════════════════════════════════════

interface Edge {
  cellA: number; // flat index of cell A (row * gridSize + col)
  cellB: number; // flat index of cell B
  row: number; // row of cellA
  col: number; // col of cellA
  side: 'S' | 'E'; // only S (south) and E (east) to avoid duplicates
}

// ═══════════════════════════════════════════════════════════════
// Cell-to-world coordinate helpers
// ═══════════════════════════════════════════════════════════════

function cellToWorld(
  row: number,
  col: number,
  gridSize: number,
  cellSize: number,
): { minX: number; maxX: number; minZ: number; maxZ: number; centerX: number; centerZ: number } {
  const halfMap = (gridSize * cellSize) / 2;
  const minX = col * cellSize - halfMap;
  const maxX = (col + 1) * cellSize - halfMap;
  const minZ = row * cellSize - halfMap;
  const maxZ = (row + 1) * cellSize - halfMap;
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

// ═══════════════════════════════════════════════════════════════
// Wall count helper
// ═══════════════════════════════════════════════════════════════

function countWalls(cell: MazeCell): number {
  return (cell.wallNorth ? 1 : 0) + (cell.wallSouth ? 1 : 0) +
         (cell.wallEast ? 1 : 0) + (cell.wallWest ? 1 : 0);
}

// ═══════════════════════════════════════════════════════════════
// Main generator
// ═══════════════════════════════════════════════════════════════

export const GRID_SIZE = 18;
export const CELL_SIZE = 10;
export const MAP_HALF_EXTENT = (GRID_SIZE * CELL_SIZE) / 2; // 90
const WALL_KEEP_RATIO = 0.55; // keep ~55% of internal walls — more walls = more rooms
const DYNAMIC_RATIO = 0.25;   // 25% of non-door internal walls are dynamic
const DOOR_WIDTH = 2.5;       // must match DOOR_GAP in MazeRenderer

// Themed room name pool (shuffled per seed, assigned in order)
const ROOM_NAME_POOL = [
  // Core station rooms
  'Reactor', 'Laboratory', 'Infirmary', 'Armory', 'Communications',
  'Control', 'Archive', 'Generator', 'Cafeteria', 'Observatory',
  'Storage', 'Cold Chamber', 'Machinery', 'Workshop', 'Terminal',
  'Quarantine', 'Medical Center', 'Warehouse', 'Security', 'Greenhouse',
  'Server Room', 'Dormitory', 'Decontamination', 'North Wing',
  'South Wing', 'Sector Alpha', 'Sector Beta', 'Meeting Room', 'Hangar', 'Cryogenics',
  // Engineering & utility
  'Propulsion', 'Navigation', 'Bridge', 'Arsenal', 'Hydroponics',
  'Recycling', 'Oxygen', 'Hatch', 'Airlock', 'Hab Module',
  'Terrace', 'Deck', 'Med Bay', 'Garage', 'Silo',
  'Studio', 'Library', 'Dark Chamber', 'Furnace', 'Dock',
  'East Wing', 'West Wing', 'Sector Gamma', 'Sector Delta', 'Substation',
  'Antenna', 'Radar', 'Pod Bay', 'Refuge', 'Incinerator',
  'Shielding', 'Boiler', 'Extraction', 'Compressor', 'Distillery',
  // Extended wings
  'Sector Epsilon', 'Sector Zeta', 'Sector Eta', 'Sector Theta',
  'Central Wing', 'Upper Wing', 'Lower Wing', 'Outer Wing',
  'Turbine', 'Fusion', 'Ventilation', 'Filters', 'Collection',
  'Foundry', 'Assembly', 'Conveyor', 'Press', 'Welding',
  'Docking', 'Cargo', 'Unloading', 'Storehouse', 'Vault',
  'Catwalk', 'Lookout', 'Watch Tower', 'Beacon', 'Sentinel',
  'Cistern', 'Aqueduct', 'Thermal Chamber', 'Solar Panel', 'Battery',
  'Zone Zero', 'Prototype', 'Testing', 'Simulator', 'Holodeck',
  'Vivarium', 'Aviary', 'Herbarium', 'Aquarium', 'Seedbed',
  'Infirmary B', 'Chem Lab', 'Physics Lab', 'Bio Lab',
  'Storage B', 'Terminal B', 'Corridor 7', 'Corridor 12',
  'Ext Module', 'Cabin', 'Capsule', 'Nursery', 'Stockroom',
];

// Room name → task type mapping (thematic)
const ROOM_TASK_MAP: Record<string, TaskType> = {
  // scanner_bioidentificacao
  'Infirmary': 'scanner_bioidentificacao',
  'Medical Center': 'scanner_bioidentificacao',
  'Quarantine': 'scanner_bioidentificacao',
  'Decontamination': 'scanner_bioidentificacao',
  'Med Bay': 'scanner_bioidentificacao',
  // esvaziar_lixo
  'Cafeteria': 'esvaziar_lixo',
  'Storage': 'esvaziar_lixo',
  'Warehouse': 'esvaziar_lixo',
  'Cold Chamber': 'esvaziar_lixo',
  'Recycling': 'esvaziar_lixo',
  'Incinerator': 'esvaziar_lixo',
  // painel_energia
  'Generator': 'painel_energia',
  'Substation': 'painel_energia',
  'Boiler': 'painel_energia',
  'Solar Panel': 'painel_energia',
  'Battery': 'painel_energia',
  // canhao_asteroides
  'Armory': 'canhao_asteroides',
  'Hangar': 'canhao_asteroides',
  // leitor_cartao
  'Archive': 'leitor_cartao',
  'Control': 'leitor_cartao',
  'Security': 'leitor_cartao',
  'Meeting Room': 'leitor_cartao',
  'Navigation': 'leitor_cartao',
  // motores
  'Machinery': 'motores',
  'Workshop': 'motores',
  'Cryogenics': 'motores',
  // amostra_sangue
  'Vivarium': 'amostra_sangue',
  'Infirmary B': 'amostra_sangue',
  // limpar_filtro
  'Filters': 'limpar_filtro',
  'Ventilation': 'limpar_filtro',
  // registrar_temperatura
  'Thermal Chamber': 'registrar_temperatura',
  // alinhar_antena
  'Beacon': 'alinhar_antena',
  'Sentinel': 'alinhar_antena',
  // verificar_oxigenio
  'Oxygen': 'verificar_oxigenio',
  // enviar_relatorio
  'Bridge': 'enviar_relatorio',
  'Communications': 'enviar_relatorio',
  // inspecionar_traje
  'Dormitory': 'inspecionar_traje',
  'Cabin': 'inspecionar_traje',
  // etiquetar_carga
  'Cargo': 'etiquetar_carga',
  'Unloading': 'etiquetar_carga',
  'Storehouse': 'etiquetar_carga',
  // calibrar_bussola
  'Observatory': 'calibrar_bussola',
  // soldar_circuito
  'Welding': 'soldar_circuito',
  'Assembly': 'soldar_circuito',
  // consertar_tubulacao
  'Cistern': 'consertar_tubulacao',
  'Aqueduct': 'consertar_tubulacao',
  'Hydroponics': 'consertar_tubulacao',
  // decodificar_mensagem
  'Library': 'decodificar_mensagem',
  'Terminal B': 'decodificar_mensagem',
  // reabastecer_combustivel
  'Propulsion': 'reabastecer_combustivel',
  // classificar_minerais
  'Foundry': 'classificar_minerais',
  'Collection': 'classificar_minerais',
  // ajustar_frequencia
  'Radar': 'ajustar_frequencia',
  // reconectar_fios
  'Chem Lab': 'reconectar_fios',
  'Laboratory': 'reconectar_fios',
  // analisar_dados
  'Conveyor': 'analisar_dados',
  // equilibrar_carga
  'Press': 'equilibrar_carga',
  // desativar_bomba
  'Arsenal': 'desativar_bomba',
  'Shielding': 'desativar_bomba',
  // navegar_asteroide
  'Lookout': 'navegar_asteroide',
  'Watch Tower': 'navegar_asteroide',
  // reparar_reator
  'Reactor': 'reparar_reator',
  'Fusion': 'reparar_reator',
  // hackear_terminal
  'Server Room': 'hackear_terminal',
  'Prototype': 'hackear_terminal',
  // sincronizar_motores
  'Turbine': 'sincronizar_motores',
  'Compressor': 'sincronizar_motores',
};

const DECO_TYPES: DecoType[] = ['boneco_desmontavel', 'pop_it', 'pelucia', 'blocos_montar'];

// Room-specific decorations — themed rooms get their own deco types instead of generic toys
const ROOM_DECO_MAP: Record<string, { types: DecoType[]; count: [number, number] }> = {
  'Library': { types: ['bookshelf', 'book_stack'], count: [2, 3] },        // 2-3 decos
  'Infirmary': { types: ['medical_bed', 'iv_stand', 'medicine_cabinet'], count: [2, 3] },
};

export function generateMaze(seed: number, playerCount: number = 4): MazeLayout {
  const rng = mulberry32(seed);
  const totalCells = GRID_SIZE * GRID_SIZE;

  // Initialize all cells with all walls
  const cells: MazeCell[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      cells.push({
        row,
        col,
        wallNorth: true,
        wallSouth: true,
        wallEast: true,
        wallWest: true,
      });
    }
  }

  // Build list of internal edges (only S and E to avoid duplicates)
  const edges: Edge[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const idx = row * GRID_SIZE + col;
      // South edge (connects to row+1)
      if (row < GRID_SIZE - 1) {
        edges.push({
          cellA: idx,
          cellB: (row + 1) * GRID_SIZE + col,
          row,
          col,
          side: 'S',
        });
      }
      // East edge (connects to col+1)
      if (col < GRID_SIZE - 1) {
        edges.push({
          cellA: idx,
          cellB: row * GRID_SIZE + (col + 1),
          row,
          col,
          side: 'E',
        });
      }
    }
  }

  // Shuffle edges
  shuffle(edges, rng);

  // Kruskal's: remove edges to create spanning tree (ensures connectivity)
  const uf = new UnionFind(totalCells);
  const removedEdges = new Set<number>(); // indices of edges removed

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (uf.union(e.cellA, e.cellB)) {
      removedEdges.add(i);
    }
  }

  // Remove additional edges beyond the spanning tree to create more open space
  const keptEdgeIndices: number[] = [];
  for (let i = 0; i < edges.length; i++) {
    if (!removedEdges.has(i)) {
      keptEdgeIndices.push(i);
    }
  }
  shuffle(keptEdgeIndices, rng);

  // Remove extra edges until we reach the desired wall-keep ratio
  const targetKeptWalls = Math.floor(edges.length * WALL_KEEP_RATIO);
  const currentKeptWalls = keptEdgeIndices.length;
  const extraToRemove = Math.max(0, currentKeptWalls - targetKeptWalls);

  for (let i = 0; i < extraToRemove && i < keptEdgeIndices.length; i++) {
    removedEdges.add(keptEdgeIndices[i]);
  }

  // Apply removed edges to cells
  for (const idx of removedEdges) {
    const e = edges[idx];
    const cellA = cells[e.cellA];
    const cellB = cells[e.cellB];
    if (e.side === 'S') {
      cellA.wallSouth = false;
      cellB.wallNorth = false;
    } else {
      cellA.wallEast = false;
      cellB.wallWest = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Clear center 2x2 area (rows 8-9, cols 8-9) for meeting table
  // Creates a 20x20 unit open plaza at the center of the map
  // ═══════════════════════════════════════════════════════════════

  const CENTER_ROWS = [8, 9];
  const CENTER_COLS = [8, 9];
  const centerCellIndices = new Set<number>();

  for (const cr of CENTER_ROWS) {
    for (const cc of CENTER_COLS) {
      centerCellIndices.add(cr * GRID_SIZE + cc);
    }
  }

  // Remove all internal walls between center cells
  for (const cr of CENTER_ROWS) {
    for (const cc of CENTER_COLS) {
      const cell = cells[cr * GRID_SIZE + cc];
      // South wall: if neighbor below is also center
      if (CENTER_ROWS.includes(cr + 1) && CENTER_COLS.includes(cc)) {
        cell.wallSouth = false;
        cells[(cr + 1) * GRID_SIZE + cc].wallNorth = false;
      }
      // East wall: if neighbor right is also center
      if (CENTER_ROWS.includes(cr) && CENTER_COLS.includes(cc + 1)) {
        cell.wallEast = false;
        cells[cr * GRID_SIZE + (cc + 1)].wallWest = false;
      }
    }
  }

  // Create entry points: remove one wall per side of the 2x2 block
  // North side (row 8): remove north wall of (8,8) and (8,9)
  cells[8 * GRID_SIZE + 8].wallNorth = false;
  if (8 > 0) cells[7 * GRID_SIZE + 8].wallSouth = false;
  cells[8 * GRID_SIZE + 9].wallNorth = false;
  if (8 > 0) cells[7 * GRID_SIZE + 9].wallSouth = false;
  // South side (row 9): remove south wall of (9,8) and (9,9)
  cells[9 * GRID_SIZE + 8].wallSouth = false;
  if (9 < GRID_SIZE - 1) cells[10 * GRID_SIZE + 8].wallNorth = false;
  cells[9 * GRID_SIZE + 9].wallSouth = false;
  if (9 < GRID_SIZE - 1) cells[10 * GRID_SIZE + 9].wallNorth = false;
  // West side (col 8): remove west wall of (8,8) and (9,8)
  cells[8 * GRID_SIZE + 8].wallWest = false;
  if (8 > 0) cells[8 * GRID_SIZE + 7].wallEast = false;
  cells[9 * GRID_SIZE + 8].wallWest = false;
  if (8 > 0) cells[9 * GRID_SIZE + 7].wallEast = false;
  // East side (col 9): remove east wall of (8,9) and (9,9)
  cells[8 * GRID_SIZE + 9].wallEast = false;
  if (9 < GRID_SIZE - 1) cells[8 * GRID_SIZE + 10].wallWest = false;
  cells[9 * GRID_SIZE + 9].wallEast = false;
  if (9 < GRID_SIZE - 1) cells[9 * GRID_SIZE + 10].wallWest = false;

  // ═══════════════════════════════════════════════════════════════
  // Identify room cells (3+ walls) and create forced door edges
  // Rooms = cells enclosed by 4 walls. Cells with 3 walls get
  // their missing wall restored (with a door). Cells with <3 walls
  // are corridors — no lights, no doors.
  // ═══════════════════════════════════════════════════════════════

  // Canonical door edge keys: "row_col_S" or "row_col_E"
  const forcedDoorEdges = new Set<string>();
  const roomCells = new Set<number>(); // flat indices of room cells

  // Step 1: Snapshot — identify room candidates BEFORE any restoration
  const roomCandidates: { idx: number; row: number; col: number; openSide: 'N' | 'S' | 'E' | 'W' }[] = [];

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const idx = row * GRID_SIZE + col;
      const cell = cells[idx];
      const wc = countWalls(cell);

      if (wc >= 3) {
        // Skip center cells — they are the meeting plaza
        if (centerCellIndices.has(idx)) continue;
        roomCells.add(idx);

        if (wc === 3) {
          // Find the single open side
          let openSide: 'N' | 'S' | 'E' | 'W' = 'N';
          if (!cell.wallNorth) openSide = 'N';
          else if (!cell.wallSouth) openSide = 'S';
          else if (!cell.wallEast) openSide = 'E';
          else if (!cell.wallWest) openSide = 'W';

          roomCandidates.push({ idx, row, col, openSide });
        }
        // wc === 4 shouldn't happen after Kruskal (would be isolated),
        // but if it does the room still gets a light, just no door
      }
    }
  }

  // Step 2: Restore walls for 3-wall rooms (add door-wall)
  for (const { idx, row, col, openSide } of roomCandidates) {
    const cell = cells[idx];

    // Check if this wall was already restored by a neighboring room
    const isAlreadyClosed = (() => {
      switch (openSide) {
        case 'N': return cell.wallNorth;
        case 'S': return cell.wallSouth;
        case 'E': return cell.wallEast;
        case 'W': return cell.wallWest;
      }
    })();

    if (isAlreadyClosed) {
      // Neighbor room already restored this wall — room is enclosed, skip
      continue;
    }

    // Restore wall on both cells and register forced door edge
    switch (openSide) {
      case 'N':
        cell.wallNorth = true;
        if (row > 0) {
          cells[(row - 1) * GRID_SIZE + col].wallSouth = true;
          forcedDoorEdges.add(`${row - 1}_${col}_S`);
        }
        break;
      case 'S':
        cell.wallSouth = true;
        if (row < GRID_SIZE - 1) {
          cells[(row + 1) * GRID_SIZE + col].wallNorth = true;
        }
        forcedDoorEdges.add(`${row}_${col}_S`);
        break;
      case 'E':
        cell.wallEast = true;
        if (col < GRID_SIZE - 1) {
          cells[row * GRID_SIZE + (col + 1)].wallWest = true;
        }
        forcedDoorEdges.add(`${row}_${col}_E`);
        break;
      case 'W':
        cell.wallWest = true;
        if (col > 0) {
          cells[row * GRID_SIZE + (col - 1)].wallEast = true;
          forcedDoorEdges.add(`${row}_${col - 1}_E`);
        }
        break;
    }
  }

  // ── Build wall segments ──
  const walls: WallSegment[] = [];
  const doors: DoorInfo[] = [];
  const dynamicWallIds: string[] = [];
  let wallCounter = 0;

  // Helper: create wall segment from cell edge
  function addWallSegment(
    row: number,
    col: number,
    side: 'N' | 'S' | 'E' | 'W',
    isBorder: boolean,
  ): void {
    const bounds = cellToWorld(row, col, GRID_SIZE, CELL_SIZE);
    let start: [number, number];
    let end: [number, number];
    let axis: 'x' | 'z';

    switch (side) {
      case 'N':
        start = [bounds.minX, bounds.minZ];
        end = [bounds.maxX, bounds.minZ];
        axis = 'x';
        break;
      case 'S':
        start = [bounds.minX, bounds.maxZ];
        end = [bounds.maxX, bounds.maxZ];
        axis = 'x';
        break;
      case 'E':
        start = [bounds.maxX, bounds.minZ];
        end = [bounds.maxX, bounds.maxZ];
        axis = 'z';
        break;
      case 'W':
        start = [bounds.minX, bounds.minZ];
        end = [bounds.minX, bounds.maxZ];
        axis = 'z';
        break;
    }

    if (!isBorder) {
      // Check if this edge is a forced door (room entry)
      const canonicalKey = `${row}_${col}_${side}`;
      if (forcedDoorEdges.has(canonicalKey)) {
        // Split into 3 segments: left wall | door opening | right wall
        const doorId = `door_${row}_${col}_${side}`;
        const midX = (start[0] + end[0]) / 2;
        const midZ = (start[1] + end[1]) / 2;
        const doorPos: [number, number, number] = [midX, 2, midZ];
        const half = DOOR_WIDTH / 2;

        let leftEnd: [number, number];
        let doorStart: [number, number];
        let doorEnd: [number, number];
        let rightStart: [number, number];

        if (axis === 'x') {
          leftEnd = [midX - half, midZ];
          doorStart = [midX - half, midZ];
          doorEnd = [midX + half, midZ];
          rightStart = [midX + half, midZ];
        } else {
          leftEnd = [midX, midZ - half];
          doorStart = [midX, midZ - half];
          doorEnd = [midX, midZ + half];
          rightStart = [midX, midZ + half];
        }

        const doorWallId = `wall_${wallCounter++}`;
        doors.push({ id: doorId, row, col, side, position: doorPos, axis, wallId: doorWallId });

        // Left wall (static)
        walls.push({
          id: `wall_${wallCounter++}`, start, end: leftEnd,
          isDynamic: false, hasDoor: false, isBorder: false,
        });
        // Door section (mutable — opens/closes)
        walls.push({
          id: doorWallId, start: doorStart, end: doorEnd,
          isDynamic: false, hasDoor: true, doorId, isBorder: false,
        });
        // Right wall (static)
        walls.push({
          id: `wall_${wallCounter++}`, start: rightStart, end,
          isDynamic: false, hasDoor: false, isBorder: false,
        });
        return;
      }

      // Only allow dynamic walls on corridor-only edges (neither cell is a room)
      const cellIdx = row * GRID_SIZE + col;
      let neighborIdx = -1;
      if (side === 'S' && row < GRID_SIZE - 1) neighborIdx = (row + 1) * GRID_SIZE + col;
      if (side === 'E' && col < GRID_SIZE - 1) neighborIdx = row * GRID_SIZE + (col + 1);
      const touchesRoom = roomCells.has(cellIdx) || (neighborIdx >= 0 && roomCells.has(neighborIdx));

      if (!touchesRoom && rng() < DYNAMIC_RATIO) {
        const wallId = `wall_${wallCounter++}`;
        walls.push({
          id: wallId, start, end,
          isDynamic: true, hasDoor: false, isBorder: false,
        });
        dynamicWallIds.push(wallId);
        return;
      }
    }

    // Static wall (border or non-dynamic internal)
    walls.push({
      id: `wall_${wallCounter++}`, start, end,
      isDynamic: false, hasDoor: false, isBorder,
    });
  }

  // Track which edges we've already processed to avoid duplicates
  const processedEdges = new Set<string>();

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const cell = cells[row * GRID_SIZE + col];

      // North wall — only process if this is the top row (border)
      if (row === 0 && cell.wallNorth) {
        addWallSegment(row, col, 'N', true);
      }

      // West wall — only process if this is the left column (border)
      if (col === 0 && cell.wallWest) {
        addWallSegment(row, col, 'W', true);
      }

      // South wall
      if (cell.wallSouth) {
        const edgeKey = `${row}_${col}_S`;
        if (!processedEdges.has(edgeKey)) {
          processedEdges.add(edgeKey);
          // Also mark the matching north edge of the cell below
          if (row < GRID_SIZE - 1) {
            processedEdges.add(`${row + 1}_${col}_N`);
          }
          const isBorder = row === GRID_SIZE - 1;
          addWallSegment(row, col, 'S', isBorder);
        }
      }

      // East wall
      if (cell.wallEast) {
        const edgeKey = `${row}_${col}_E`;
        if (!processedEdges.has(edgeKey)) {
          processedEdges.add(edgeKey);
          // Also mark the matching west edge of the cell to the right
          if (col < GRID_SIZE - 1) {
            processedEdges.add(`${row}_${col + 1}_W`);
          }
          const isBorder = col === GRID_SIZE - 1;
          addWallSegment(row, col, 'E', isBorder);
        }
      }
    }
  }

  // ── Build lights (only in room cells) ──
  const lights: LightInfo[] = [];
  for (const idx of roomCells) {
    const row = Math.floor(idx / GRID_SIZE);
    const col = idx % GRID_SIZE;
    const bounds = cellToWorld(row, col, GRID_SIZE, CELL_SIZE);
    lights.push({
      id: `light_${row}_${col}`,
      row,
      col,
      position: [bounds.centerX, 3.8, bounds.centerZ],
    });
  }

  // ── Build room info with themed names ──
  const shuffledNames = [...ROOM_NAME_POOL];
  shuffle(shuffledNames, rng);

  // Build a lookup: cell index → doorId (from doors array)
  const cellDoorMap = new Map<number, string>();
  for (const door of doors) {
    const cellIdx = door.row * GRID_SIZE + door.col;
    // The door belongs to the cell whose wall it's on. Find which cell is the room.
    if (roomCells.has(cellIdx)) {
      cellDoorMap.set(cellIdx, door.id);
    } else {
      // Check the neighbor cell on the other side of the door
      let neighborIdx = -1;
      if (door.side === 'S' && door.row < GRID_SIZE - 1) neighborIdx = (door.row + 1) * GRID_SIZE + door.col;
      if (door.side === 'E' && door.col < GRID_SIZE - 1) neighborIdx = door.row * GRID_SIZE + (door.col + 1);
      if (door.side === 'N' && door.row > 0) neighborIdx = (door.row - 1) * GRID_SIZE + door.col;
      if (door.side === 'W' && door.col > 0) neighborIdx = door.row * GRID_SIZE + (door.col - 1);
      if (neighborIdx >= 0 && roomCells.has(neighborIdx)) {
        cellDoorMap.set(neighborIdx, door.id);
      }
    }
  }

  const rooms: MazeRoomInfo[] = [];
  let nameIdx = 0;
  for (const idx of roomCells) {
    const row = Math.floor(idx / GRID_SIZE);
    const col = idx % GRID_SIZE;
    const bounds = cellToWorld(row, col, GRID_SIZE, CELL_SIZE);
    rooms.push({
      id: `room_${row}_${col}`,
      row,
      col,
      name: shuffledNames[nameIdx % shuffledNames.length],
      position: [bounds.centerX, 0, bounds.centerZ],
      doorId: cellDoorMap.get(idx) ?? null,
    });
    nameIdx++;
  }

  // ── Build task stations (scaled to player count) ──
  const TASKS_PER_PLAYER = 5;
  const totalTasks = Math.min(rooms.length, Math.max(10, playerCount * TASKS_PER_PLAYER));

  // Difficulty distribution: 40% easy, 40% medium, 20% hard
  const easyCount  = Math.round(totalTasks * 0.40);
  const hardCount  = Math.round(totalTasks * 0.20);
  const mediumCount = totalTasks - easyCount - hardCount;

  // Build a type pool sampling cyclically from each difficulty bucket
  const easyTypes  = shuffle([...TASK_TYPES_BY_DIFFICULTY.easy], rng);
  const mediumTypes = shuffle([...TASK_TYPES_BY_DIFFICULTY.medium], rng);
  const hardTypes  = shuffle([...TASK_TYPES_BY_DIFFICULTY.hard], rng);

  const taskTypePool: TaskType[] = [];
  for (let i = 0; i < easyCount; i++)   taskTypePool.push(easyTypes[i % easyTypes.length]);
  for (let i = 0; i < mediumCount; i++) taskTypePool.push(mediumTypes[i % mediumTypes.length]);
  for (let i = 0; i < hardCount; i++)   taskTypePool.push(hardTypes[i % hardTypes.length]);
  shuffle(taskTypePool, rng);

  // Select rooms: prioritize themed rooms first, then fill with others
  const roomsShuffled = shuffle([...rooms], rng);
  const themedRooms = roomsShuffled.filter(r => r.name in ROOM_TASK_MAP);
  const unthemedRooms = roomsShuffled.filter(r => !(r.name in ROOM_TASK_MAP));
  const candidateRooms = [...themedRooms, ...unthemedRooms].slice(0, totalTasks);

  let poolCursor = 0;
  const tasks: TaskStationInfo[] = [];
  for (const room of candidateRooms) {
    // Use thematic mapping when available, otherwise pick from pool
    const taskType: TaskType = (room.name in ROOM_TASK_MAP)
      ? ROOM_TASK_MAP[room.name]
      : taskTypePool[poolCursor++ % taskTypePool.length];
    const meta = TASK_REGISTRY[taskType];
    const offsetAngle = rng() * Math.PI * 2;
    const offsetDist = 2.5;
    tasks.push({
      id: `task_${room.row}_${room.col}`,
      roomId: room.id,
      row: room.row,
      col: room.col,
      taskType,
      difficulty: meta.difficulty,
      displayName: meta.displayName,
      position: [
        room.position[0] + Math.cos(offsetAngle) * offsetDist,
        0,
        room.position[2] + Math.sin(offsetAngle) * offsetDist,
      ],
    });
  }

  // ── Build decorative objects (0-2 per room, themed rooms get more) ──
  const decorations: DecoObjectInfo[] = [];
  let decoIdx = 0;
  for (const room of rooms) {
    const themed = ROOM_DECO_MAP[room.name];
    const decoCount = themed
      ? themed.count[0] + Math.floor(rng() * (themed.count[1] - themed.count[0] + 1))
      : Math.floor(rng() * 3); // 0, 1, or 2
    const decoPool = themed ? themed.types : DECO_TYPES;
    for (let d = 0; d < decoCount; d++) {
      const angle = rng() * Math.PI * 2;
      const dist = 1 + rng() * 2;
      decorations.push({
        id: `deco_${room.row}_${room.col}_${decoIdx++}`,
        roomId: room.id,
        position: [
          room.position[0] + Math.cos(angle) * dist,
          0,
          room.position[2] + Math.sin(angle) * dist,
        ],
        decoType: decoPool[Math.floor(rng() * decoPool.length)],
        scale: themed ? 0.8 + rng() * 0.4 : 0.5 + rng(),
        rotationY: rng() * Math.PI * 2,
      });
    }
  }

  // ── Build shelter zones (3-4 safe rooms) ──
  const shelterCount = Math.min(4, Math.max(3, Math.floor(rooms.length * 0.3)));
  const shelterCandidates = shuffle([...rooms], rng);
  const shelterZones: ShelterZone[] = shelterCandidates.slice(0, shelterCount).map(r => ({
    position: r.position as [number, number, number],
    radius: CELL_SIZE / 2 - 0.5, // ~4.5 meters (most of the cell)
    roomId: r.id,
  }));

  // ── Build oxygen generators (2-3 per map, in specific rooms) ──
  const OXYGEN_ROOM_NAMES = new Set([
    'Oxygen', 'Generator', 'Reactor', 'Machinery', 'Ventilation',
    'Filters', 'Airlock', 'Propulsion', 'Substation', 'Compressor',
    'Boiler', 'Server Room', 'Extraction',
  ]);
  const oxygenCandidates = rooms.filter(r => OXYGEN_ROOM_NAMES.has(r.name));
  // Fallback: if fewer than 2 candidates, pick random rooms
  if (oxygenCandidates.length < 2) {
    const fallback = shuffle([...rooms], rng);
    for (const r of fallback) {
      if (!oxygenCandidates.some(c => c.id === r.id)) {
        oxygenCandidates.push(r);
        if (oxygenCandidates.length >= 3) break;
      }
    }
  }
  const oxygenCount = Math.min(3, oxygenCandidates.length);
  const oxygenRooms = shuffle([...oxygenCandidates], rng).slice(0, oxygenCount);
  const oxygenGenerators: OxygenGeneratorInfo[] = oxygenRooms.map(r => {
    const offsetAngle = rng() * Math.PI * 2;
    const offsetDist = 2.0;
    return {
      id: `oxy_${r.row}_${r.col}`,
      roomId: r.id,
      roomName: r.name,
      position: [
        r.position[0] + Math.cos(offsetAngle) * offsetDist,
        0,
        r.position[2] + Math.sin(offsetAngle) * offsetDist,
      ] as [number, number, number],
    };
  });

  // ── Build underground pipe network (one node per room) ──
  const pipeRoomCandidates: MazeRoomInfo[] = rooms;

  // Underground layout: at Y=-10, same XZ scale as surface
  const UNDERGROUND_Y = -10;
  const UNDERGROUND_SCALE = 1.0;
  // Position pipe entries at the CORNER opposite the door (far from the entrance)
  const WALL_MARGIN = 1.5; // distance from wall to manhole center
  const HALF_CELL = CELL_SIZE / 2;
  const doorLookup = new Map<string, DoorInfo>();
  for (const d of doors) doorLookup.set(d.id, d);

  const pipeNodes: PipeNode[] = pipeRoomCandidates.map(room => {
    const cell = cells[room.row * GRID_SIZE + room.col];
    const rx = room.position[0];
    const rz = room.position[2];
    const edge = HALF_CELL - WALL_MARGIN;

    // Determine door side from the room's assigned door
    let doorSide: 'N' | 'S' | 'E' | 'W' | null = null;
    if (room.doorId) {
      const doorInfo = doorLookup.get(room.doorId);
      if (doorInfo) doorSide = doorInfo.side;
    }

    // Fallback: detect the opening from cell walls
    if (!doorSide) {
      if (!cell.wallNorth) doorSide = 'N';
      else if (!cell.wallSouth) doorSide = 'S';
      else if (!cell.wallEast) doorSide = 'E';
      else if (!cell.wallWest) doorSide = 'W';
    }

    // Place pipe at the corner opposite the door
    // Deterministic left/right pick via room row+col hash
    const cornerSign = ((room.row + room.col) % 2 === 0) ? 1 : -1;
    let sx = rx;
    let sz = rz;

    switch (doorSide) {
      case 'N': // door on Z- side → pipe at Z+ corner
        sz = rz + edge;
        sx = rx + cornerSign * edge;
        break;
      case 'S': // door on Z+ side → pipe at Z- corner
        sz = rz - edge;
        sx = rx + cornerSign * edge;
        break;
      case 'E': // door on X+ side → pipe at X- corner
        sx = rx - edge;
        sz = rz + cornerSign * edge;
        break;
      case 'W': // door on X- side → pipe at X+ corner
        sx = rx + edge;
        sz = rz + cornerSign * edge;
        break;
      default: // no door found — fallback to south-east corner
        sx = rx + edge;
        sz = rz + edge;
        break;
    }

    return {
      id: `pipe_${room.row}_${room.col}`,
      roomId: room.id,
      roomName: room.name,
      surfacePosition: [sx, 0, sz] as [number, number, number],
      undergroundPosition: [
        rx * UNDERGROUND_SCALE,
        UNDERGROUND_Y,
        rz * UNDERGROUND_SCALE,
      ] as [number, number, number],
    };
  });

  // Connect nodes with MST + ~10% extra short edges for loops
  const pipeConnections: PipeConnection[] = [];
  if (pipeNodes.length >= 2) {
    const pipeUf = new UnionFind(pipeNodes.length);
    // Only consider edges between nearby rooms (within ~3 cells underground) to keep O(n) per node
    const MAX_EDGE_DIST = CELL_SIZE * UNDERGROUND_SCALE * 3.5;
    const pipeEdges: Array<{ i: number; j: number; dist: number }> = [];
    for (let i = 0; i < pipeNodes.length; i++) {
      for (let j = i + 1; j < pipeNodes.length; j++) {
        const dx = pipeNodes[i].undergroundPosition[0] - pipeNodes[j].undergroundPosition[0];
        const dz = pipeNodes[i].undergroundPosition[2] - pipeNodes[j].undergroundPosition[2];
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < MAX_EDGE_DIST) {
          pipeEdges.push({ i, j, dist });
        }
      }
    }
    pipeEdges.sort((a, b) => a.dist - b.dist);

    // Spanning tree (MST)
    const extraEdges: typeof pipeEdges = [];
    for (const edge of pipeEdges) {
      if (pipeUf.union(edge.i, edge.j)) {
        pipeConnections.push({ nodeA: pipeNodes[edge.i].id, nodeB: pipeNodes[edge.j].id });
      } else {
        extraEdges.push(edge);
      }
    }

    // If some nodes are unreachable with short edges, add longer edges
    const unreached: number[] = [];
    for (let i = 0; i < pipeNodes.length; i++) {
      if (pipeUf.find(i) !== pipeUf.find(0)) unreached.push(i);
    }
    if (unreached.length > 0) {
      // Build long edges only for unreached nodes
      const longEdges: Array<{ i: number; j: number; dist: number }> = [];
      for (const u of unreached) {
        for (let j = 0; j < pipeNodes.length; j++) {
          if (pipeUf.find(u) === pipeUf.find(j)) continue;
          const dx = pipeNodes[u].undergroundPosition[0] - pipeNodes[j].undergroundPosition[0];
          const dz = pipeNodes[u].undergroundPosition[2] - pipeNodes[j].undergroundPosition[2];
          longEdges.push({ i: u, j, dist: Math.sqrt(dx * dx + dz * dz) });
        }
      }
      longEdges.sort((a, b) => a.dist - b.dist);
      for (const edge of longEdges) {
        if (pipeUf.union(edge.i, edge.j)) {
          pipeConnections.push({ nodeA: pipeNodes[edge.i].id, nodeB: pipeNodes[edge.j].id });
        }
      }
    }

    // Add ~10% extra short connections for alternative routes
    const extraCount = Math.min(Math.ceil(pipeNodes.length * 0.1), extraEdges.length);
    for (let i = 0; i < extraCount; i++) {
      pipeConnections.push({ nodeA: pipeNodes[extraEdges[i].i].id, nodeB: pipeNodes[extraEdges[i].j].id });
    }
  }

  // ── Emergency button at the center of the map ──
  const emergencyButton: EmergencyButtonInfo = {
    id: 'emergency_button',
    position: [0, 0, 0],
  };

  // ── Generate underground pipe tunnel collision walls ──
  const pipeWalls = generatePipeWalls(pipeNodes, pipeConnections);

  return {
    seed,
    gridSize: GRID_SIZE,
    cellSize: CELL_SIZE,
    cells,
    walls,
    doors,
    lights,
    rooms,
    dynamicWallIds,
    tasks,
    decorations,
    shelterZones,
    oxygenGenerators,
    emergencyButton,
    pipeNodes,
    pipeConnections,
    pipeWalls,
  };
}

// ═══════════════════════════════════════════════════════════════
// Underground pipe tunnel wall generation (collision boundaries)
// ═══════════════════════════════════════════════════════════════

const PIPE_TUNNEL_RADIUS = 3.0;

function generatePipeWalls(nodes: PipeNode[], connections: PipeConnection[]): PipeWall[] {
  if (nodes.length === 0) return [];

  const nodeMap = new Map<string, PipeNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // Track connections at each node for junction closure walls
  const nodeConnections = new Map<string, Array<{ dirX: number; dirZ: number; angle: number }>>();
  for (const n of nodes) nodeConnections.set(n.id, []);

  const walls: PipeWall[] = [];
  const R = PIPE_TUNNEL_RADIUS;

  // Generate tunnel side walls for each connection, pulled inward by R from each node center.
  // This leaves a junction area of radius R around each node for cross-tunnel navigation.
  for (const conn of connections) {
    const a = nodeMap.get(conn.nodeA);
    const b = nodeMap.get(conn.nodeB);
    if (!a || !b) continue;

    const ax = a.undergroundPosition[0], az = a.undergroundPosition[2];
    const bx = b.undergroundPosition[0], bz = b.undergroundPosition[2];
    const dx = bx - ax, dz = bz - az;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < R * 2.5) continue; // Too short for walls

    const dirX = dx / len, dirZ = dz / len;
    const perpX = -dirZ, perpZ = dirX;

    // Track direction at each node
    nodeConnections.get(a.id)!.push({ dirX, dirZ, angle: Math.atan2(dirZ, dirX) });
    nodeConnections.get(b.id)!.push({ dirX: -dirX, dirZ: -dirZ, angle: Math.atan2(-dirZ, -dirX) });

    // Walls pulled inward by R from each node center
    const sax = ax + dirX * R, saz = az + dirZ * R;
    const sbx = bx - dirX * R, sbz = bz - dirZ * R;

    // Left wall
    walls.push({
      start: [sax + perpX * R, saz + perpZ * R],
      end: [sbx + perpX * R, sbz + perpZ * R],
    });
    // Right wall
    walls.push({
      start: [sax - perpX * R, saz - perpZ * R],
      end: [sbx - perpX * R, sbz - perpZ * R],
    });
  }

  // Generate straight closure walls at each node to seal gaps between tunnel openings.
  // For each pair of adjacent tunnels (sorted by angle), a straight wall connects
  // the left edge of one tunnel to the right edge of the next.
  for (const node of nodes) {
    const conns = nodeConnections.get(node.id)!;
    if (conns.length === 0) continue;

    const nx = node.undergroundPosition[0], nz = node.undergroundPosition[2];
    conns.sort((a, b) => a.angle - b.angle);

    for (let i = 0; i < conns.length; i++) {
      const curr = conns[i];
      const next = conns[(i + 1) % conns.length];

      // Left edge of current tunnel opening at junction boundary
      const currLeftX = nx + curr.dirX * R - curr.dirZ * R;
      const currLeftZ = nz + curr.dirZ * R + curr.dirX * R;

      // Right edge of next tunnel opening at junction boundary
      const nextRightX = nx + next.dirX * R + next.dirZ * R;
      const nextRightZ = nz + next.dirZ * R - next.dirX * R;

      // Skip if the two edges are essentially the same point (perpendicular tunnels meet cleanly)
      const gapX = nextRightX - currLeftX;
      const gapZ = nextRightZ - currLeftZ;
      if (gapX * gapX + gapZ * gapZ < 0.01) continue;

      // Straight closure wall
      walls.push({ start: [currLeftX, currLeftZ], end: [nextRightX, nextRightZ] });
    }
  }

  return walls;
}

// ═══════════════════════════════════════════════════════════════
// Initialize mutable maze state (all doors closed/unlocked, lights on)
// ═══════════════════════════════════════════════════════════════

import type { MazeSnapshot, DoorState, PipeLockState, TaskStationState } from './maze-types.js';

export function createInitialMazeSnapshot(layout: MazeLayout): MazeSnapshot {
  const doorStates: Record<string, DoorState> = {};
  for (const door of layout.doors) {
    doorStates[door.id] = {
      isOpen: false,
      isLocked: false,
      lockedBy: null,
      hackerLockExpiresAt: 0,
      lockedAt: 0,
    };
  }

  const lightStates: Record<string, boolean> = {};
  for (const light of layout.lights) {
    lightStates[light.id] = true; // all lights on
  }

  const dynamicWallStates: Record<string, boolean> = {};
  for (const wallId of layout.dynamicWallIds) {
    dynamicWallStates[wallId] = true; // all dynamic walls start closed
  }

  const taskStates: Record<string, TaskStationState> = {};
  for (const task of layout.tasks) {
    taskStates[task.id] = {
      completionState: 'pending',
      activePlayerId: null,
      completedByPlayerId: null,
    };
  }

  const pipeLockStates: Record<string, PipeLockState> = {};
  for (const pipe of (layout.pipeNodes ?? [])) {
    pipeLockStates[pipe.id] = {
      isLocked: false,
      lockedBy: null,
      hackerLockExpiresAt: 0,
    };
  }

  return { doorStates, lightStates, dynamicWallStates, muralhaWalls: [], taskStates, pipeLockStates, disabledGenerators: {}, shipOxygen: 100 };
}
