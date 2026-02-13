// ═══════════════════════════════════════════════════════════════
// Maze Data Model — Grid-based labyrinth (18x18 cells, 10 units each)
// Map covers -90..+90 on X and Z axes (180x180 total)
// ═══════════════════════════════════════════════════════════════

export interface MazeCell {
  row: number; // 0..gridSize-1
  col: number; // 0..gridSize-1
  wallNorth: boolean; // edge at Z- side
  wallSouth: boolean; // edge at Z+ side
  wallEast: boolean; // edge at X+ side
  wallWest: boolean; // edge at X- side
}

export interface WallSegment {
  id: string;
  start: [number, number]; // (x, z) world coords
  end: [number, number]; // (x, z) world coords
  isDynamic: boolean; // can open/close?
  hasDoor: boolean; // has a door on this segment?
  doorId?: string; // reference to DoorInfo.id
  isBorder: boolean; // outer wall (never opens)
}

export interface DoorInfo {
  id: string; // "door_R_C_SIDE" e.g. "door_3_4_N"
  row: number;
  col: number;
  side: 'N' | 'S' | 'E' | 'W';
  position: [number, number, number]; // world center of the door
  axis: 'x' | 'z'; // which axis the door spans
  wallId: string; // the WallSegment this door belongs to
}

export interface LightInfo {
  id: string; // "light_R_C" e.g. "light_3_4"
  row: number;
  col: number;
  position: [number, number, number]; // ceiling center of the cell
}

export interface MazeRoomInfo {
  id: string;          // "room_R_C" e.g. "room_3_4"
  row: number;
  col: number;
  name: string;        // display name e.g. "Reator"
  position: [number, number, number]; // world center of room floor
  doorId: string | null; // the door that leads into this room (if any)
}

// Shelter zones — safe areas that negate environmental damage
export interface ShelterZone {
  position: [number, number, number];
  radius: number;
  roomId: string;
}

// Emergency button — central table for meetings
export interface EmergencyButtonInfo {
  id: string;
  position: [number, number, number];
}

// Oxygen generators — players interact to refill ship oxygen
export interface OxygenGeneratorInfo {
  id: string;                         // "oxy_R_C"
  roomId: string;                     // parent room id
  roomName: string;                   // display name of the room
  position: [number, number, number]; // world position
}

// ═══════════════════════════════════════════════════════════════
// Underground Pipe Network — fast-travel system between rooms
// ═══════════════════════════════════════════════════════════════

export interface PipeNode {
  id: string;                         // "pipe_R_C"
  roomId: string;                     // parent room id
  roomName: string;                   // display name of the room
  surfacePosition: [number, number, number]; // entrance on the surface (y=0)
  undergroundPosition: [number, number, number]; // position in underground tunnel network
}

export interface PipeConnection {
  nodeA: string;  // PipeNode id
  nodeB: string;  // PipeNode id
}

/** Simple wall segment for underground pipe tunnel collision */
export interface PipeWall {
  start: [number, number]; // (x, z) underground coords
  end: [number, number];   // (x, z) underground coords
}

// Static layout — sent once at game start
export interface MazeLayout {
  seed: number;
  gridSize: number; // 10
  cellSize: number; // 10
  cells: MazeCell[];
  walls: WallSegment[];
  doors: DoorInfo[];
  lights: LightInfo[];
  rooms: MazeRoomInfo[];
  dynamicWallIds: string[];
  tasks: TaskStationInfo[];
  decorations: DecoObjectInfo[];
  shelterZones: ShelterZone[];
  oxygenGenerators: OxygenGeneratorInfo[];
  emergencyButton: EmergencyButtonInfo;
  pipeNodes: PipeNode[];
  pipeConnections: PipeConnection[];
  pipeWalls: PipeWall[];
}

// Temporary barrier wall created by the MURALHA power
export interface MuralhaWall {
  wallId: string;             // unique identifier per wall (e.g., "socketId_0")
  ownerId: string;            // socketId of the player who created it
  start: [number, number];    // (x, z) world coords
  end: [number, number];      // (x, z) world coords
}

// Mutable state — included in StateSnapshot every tick
export interface MazeSnapshot {
  doorStates: Record<string, DoorState>;
  lightStates: Record<string, boolean>; // true = on
  dynamicWallStates: Record<string, boolean>; // true = closed (solid)
  muralhaWalls: MuralhaWall[]; // active barrier walls
  taskStates: Record<string, TaskStationState>;
}

export interface DoorState {
  isOpen: boolean;
  isLocked: boolean;
  lockedBy: string | null; // socketId of the hacker who locked it
}

// ═══════════════════════════════════════════════════════════════
// Task Stations — interactive task objects placed in rooms
// ═══════════════════════════════════════════════════════════════

export type TaskDifficulty = 'easy' | 'medium' | 'hard';

export type TaskType =
  // Easy (10)
  | 'scanner_bioidentificacao' | 'esvaziar_lixo' | 'amostra_sangue'
  | 'limpar_filtro' | 'registrar_temperatura' | 'alinhar_antena'
  | 'verificar_oxigenio' | 'enviar_relatorio' | 'inspecionar_traje'
  | 'etiquetar_carga'
  // Medium (15)
  | 'painel_energia' | 'canhao_asteroides' | 'leitor_cartao'
  | 'motores' | 'generic' | 'calibrar_bussola' | 'soldar_circuito'
  | 'consertar_tubulacao' | 'decodificar_mensagem' | 'reabastecer_combustivel'
  | 'classificar_minerais' | 'ajustar_frequencia' | 'reconectar_fios'
  | 'analisar_dados' | 'equilibrar_carga'
  // Hard (5)
  | 'desativar_bomba' | 'navegar_asteroide' | 'reparar_reator'
  | 'hackear_terminal' | 'sincronizar_motores';

export interface TaskStationInfo {
  id: string;             // "task_R_C"
  roomId: string;         // "room_R_C"
  row: number;
  col: number;
  taskType: TaskType;
  difficulty: TaskDifficulty;
  displayName: string;    // Portuguese display name
  position: [number, number, number];
}

export type TaskCompletionState = 'pending' | 'in_progress' | 'completed';

export interface TaskStationState {
  completionState: TaskCompletionState;
  activePlayerId: string | null;
  completedByPlayerId: string | null;
}

// ═══════════════════════════════════════════════════════════════
// Decorative Objects — cosmetic props in rooms (no interaction)
// ═══════════════════════════════════════════════════════════════

export type DecoType = 'boneco_desmontavel' | 'pop_it' | 'pelucia' | 'blocos_montar';

export interface DecoObjectInfo {
  id: string;             // "deco_R_C_N"
  roomId: string;
  position: [number, number, number];
  decoType: DecoType;
  scale: number;
  rotationY: number;
}

// ═══════════════════════════════════════════════════════════════
// Collision context — passed to applyMovement for wall collision
// ═══════════════════════════════════════════════════════════════

export interface CollisionContext {
  walls: WallSegment[];
  doorStates: Record<string, DoorState>;
  dynamicWallStates: Record<string, boolean>;
  muralhaWalls?: MuralhaWall[];
  pipeWalls?: PipeWall[];
}
