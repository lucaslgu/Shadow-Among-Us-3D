import type { TaskType, TaskDifficulty } from './maze-types.js';

export type TaskVisualCategory =
  | 'scanner'
  | 'container'
  | 'panel'
  | 'turret'
  | 'terminal'
  | 'pedestal'
  | 'engine';

export interface TaskMeta {
  taskType: TaskType;
  displayName: string;
  difficulty: TaskDifficulty;
  visualCategory: TaskVisualCategory;
}

export const TASK_REGISTRY: Record<TaskType, TaskMeta> = {
  // ── Easy (10) ──
  scanner_bioidentificacao: { taskType: 'scanner_bioidentificacao', displayName: 'Bio-ID Scanner',              difficulty: 'easy', visualCategory: 'scanner' },
  esvaziar_lixo:           { taskType: 'esvaziar_lixo',           displayName: 'Empty Trash',                  difficulty: 'easy', visualCategory: 'container' },
  amostra_sangue:          { taskType: 'amostra_sangue',          displayName: 'Blood Sample',                 difficulty: 'easy', visualCategory: 'scanner' },
  limpar_filtro:           { taskType: 'limpar_filtro',           displayName: 'Clean Filter',                 difficulty: 'easy', visualCategory: 'container' },
  registrar_temperatura:   { taskType: 'registrar_temperatura',   displayName: 'Log Temperature',              difficulty: 'easy', visualCategory: 'panel' },
  alinhar_antena:          { taskType: 'alinhar_antena',          displayName: 'Align Antenna',                difficulty: 'easy', visualCategory: 'pedestal' },
  verificar_oxigenio:      { taskType: 'verificar_oxigenio',      displayName: 'Check Oxygen',                 difficulty: 'easy', visualCategory: 'container' },
  enviar_relatorio:        { taskType: 'enviar_relatorio',        displayName: 'Send Report',                  difficulty: 'easy', visualCategory: 'terminal' },
  inspecionar_traje:       { taskType: 'inspecionar_traje',       displayName: 'Inspect Suit',                 difficulty: 'easy', visualCategory: 'scanner' },
  etiquetar_carga:         { taskType: 'etiquetar_carga',         displayName: 'Label Cargo',                  difficulty: 'easy', visualCategory: 'container' },

  // ── Medium (15) ──
  painel_energia:          { taskType: 'painel_energia',          displayName: 'Power Panel',                  difficulty: 'medium', visualCategory: 'panel' },
  canhao_asteroides:       { taskType: 'canhao_asteroides',       displayName: 'Asteroid Cannon',              difficulty: 'medium', visualCategory: 'turret' },
  leitor_cartao:           { taskType: 'leitor_cartao',           displayName: 'Card Reader',                  difficulty: 'medium', visualCategory: 'pedestal' },
  motores:                 { taskType: 'motores',                 displayName: 'Engines',                      difficulty: 'medium', visualCategory: 'engine' },
  generic:                 { taskType: 'generic',                 displayName: 'Maintenance Terminal',          difficulty: 'medium', visualCategory: 'terminal' },
  calibrar_bussola:        { taskType: 'calibrar_bussola',        displayName: 'Calibrate Compass',            difficulty: 'medium', visualCategory: 'pedestal' },
  soldar_circuito:         { taskType: 'soldar_circuito',         displayName: 'Solder Circuit',               difficulty: 'medium', visualCategory: 'terminal' },
  consertar_tubulacao:     { taskType: 'consertar_tubulacao',     displayName: 'Fix Pipes',                    difficulty: 'medium', visualCategory: 'container' },
  decodificar_mensagem:    { taskType: 'decodificar_mensagem',    displayName: 'Decode Message',               difficulty: 'medium', visualCategory: 'terminal' },
  reabastecer_combustivel: { taskType: 'reabastecer_combustivel', displayName: 'Refuel',                       difficulty: 'medium', visualCategory: 'engine' },
  classificar_minerais:    { taskType: 'classificar_minerais',    displayName: 'Sort Minerals',                difficulty: 'medium', visualCategory: 'container' },
  ajustar_frequencia:      { taskType: 'ajustar_frequencia',      displayName: 'Tune Frequency',               difficulty: 'medium', visualCategory: 'panel' },
  reconectar_fios:         { taskType: 'reconectar_fios',         displayName: 'Reconnect Wires',              difficulty: 'medium', visualCategory: 'panel' },
  analisar_dados:          { taskType: 'analisar_dados',          displayName: 'Analyze Data',                 difficulty: 'medium', visualCategory: 'terminal' },
  equilibrar_carga:        { taskType: 'equilibrar_carga',        displayName: 'Balance Cargo',                difficulty: 'medium', visualCategory: 'pedestal' },

  // ── Hard (5) ──
  desativar_bomba:         { taskType: 'desativar_bomba',         displayName: 'Defuse Bomb',                  difficulty: 'hard', visualCategory: 'panel' },
  navegar_asteroide:       { taskType: 'navegar_asteroide',       displayName: 'Navigate Asteroid Field',      difficulty: 'hard', visualCategory: 'turret' },
  reparar_reator:          { taskType: 'reparar_reator',          displayName: 'Repair Reactor',               difficulty: 'hard', visualCategory: 'engine' },
  hackear_terminal:        { taskType: 'hackear_terminal',        displayName: 'Hack Terminal',                difficulty: 'hard', visualCategory: 'terminal' },
  sincronizar_motores:     { taskType: 'sincronizar_motores',     displayName: 'Sync Engines',                 difficulty: 'hard', visualCategory: 'engine' },
};

// Helpers
export const TASK_TYPES_BY_DIFFICULTY: Record<TaskDifficulty, TaskType[]> = {
  easy:   Object.values(TASK_REGISTRY).filter(m => m.difficulty === 'easy').map(m => m.taskType),
  medium: Object.values(TASK_REGISTRY).filter(m => m.difficulty === 'medium').map(m => m.taskType),
  hard:   Object.values(TASK_REGISTRY).filter(m => m.difficulty === 'hard').map(m => m.taskType),
};
