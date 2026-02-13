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
  scanner_bioidentificacao: { taskType: 'scanner_bioidentificacao', displayName: 'Scanner de Bioidentificação', difficulty: 'easy', visualCategory: 'scanner' },
  esvaziar_lixo:           { taskType: 'esvaziar_lixo',           displayName: 'Esvaziar Lixo',               difficulty: 'easy', visualCategory: 'container' },
  amostra_sangue:          { taskType: 'amostra_sangue',          displayName: 'Coleta de Sangue',             difficulty: 'easy', visualCategory: 'scanner' },
  limpar_filtro:           { taskType: 'limpar_filtro',           displayName: 'Limpar Filtro',                difficulty: 'easy', visualCategory: 'container' },
  registrar_temperatura:   { taskType: 'registrar_temperatura',   displayName: 'Registrar Temperatura',        difficulty: 'easy', visualCategory: 'panel' },
  alinhar_antena:          { taskType: 'alinhar_antena',          displayName: 'Alinhar Antena',               difficulty: 'easy', visualCategory: 'pedestal' },
  verificar_oxigenio:      { taskType: 'verificar_oxigenio',      displayName: 'Verificar Oxigênio',           difficulty: 'easy', visualCategory: 'container' },
  enviar_relatorio:        { taskType: 'enviar_relatorio',        displayName: 'Enviar Relatório',             difficulty: 'easy', visualCategory: 'terminal' },
  inspecionar_traje:       { taskType: 'inspecionar_traje',       displayName: 'Inspecionar Traje',            difficulty: 'easy', visualCategory: 'scanner' },
  etiquetar_carga:         { taskType: 'etiquetar_carga',         displayName: 'Etiquetar Carga',              difficulty: 'easy', visualCategory: 'container' },

  // ── Medium (15) ──
  painel_energia:          { taskType: 'painel_energia',          displayName: 'Painel de Energia',            difficulty: 'medium', visualCategory: 'panel' },
  canhao_asteroides:       { taskType: 'canhao_asteroides',       displayName: 'Canhão de Asteroides',         difficulty: 'medium', visualCategory: 'turret' },
  leitor_cartao:           { taskType: 'leitor_cartao',           displayName: 'Leitor de Cartão',             difficulty: 'medium', visualCategory: 'pedestal' },
  motores:                 { taskType: 'motores',                 displayName: 'Motores',                      difficulty: 'medium', visualCategory: 'engine' },
  generic:                 { taskType: 'generic',                 displayName: 'Terminal de Manutenção',       difficulty: 'medium', visualCategory: 'terminal' },
  calibrar_bussola:        { taskType: 'calibrar_bussola',        displayName: 'Calibrar Bússola',             difficulty: 'medium', visualCategory: 'pedestal' },
  soldar_circuito:         { taskType: 'soldar_circuito',         displayName: 'Soldar Circuito',              difficulty: 'medium', visualCategory: 'terminal' },
  consertar_tubulacao:     { taskType: 'consertar_tubulacao',     displayName: 'Consertar Tubulação',          difficulty: 'medium', visualCategory: 'container' },
  decodificar_mensagem:    { taskType: 'decodificar_mensagem',    displayName: 'Decodificar Mensagem',         difficulty: 'medium', visualCategory: 'terminal' },
  reabastecer_combustivel: { taskType: 'reabastecer_combustivel', displayName: 'Reabastecer Combustível',      difficulty: 'medium', visualCategory: 'engine' },
  classificar_minerais:    { taskType: 'classificar_minerais',    displayName: 'Classificar Minerais',         difficulty: 'medium', visualCategory: 'container' },
  ajustar_frequencia:      { taskType: 'ajustar_frequencia',      displayName: 'Ajustar Frequência',           difficulty: 'medium', visualCategory: 'panel' },
  reconectar_fios:         { taskType: 'reconectar_fios',         displayName: 'Reconectar Fios',              difficulty: 'medium', visualCategory: 'panel' },
  analisar_dados:          { taskType: 'analisar_dados',          displayName: 'Analisar Dados',               difficulty: 'medium', visualCategory: 'terminal' },
  equilibrar_carga:        { taskType: 'equilibrar_carga',        displayName: 'Equilibrar Carga',             difficulty: 'medium', visualCategory: 'pedestal' },

  // ── Hard (5) ──
  desativar_bomba:         { taskType: 'desativar_bomba',         displayName: 'Desativar Bomba',              difficulty: 'hard', visualCategory: 'panel' },
  navegar_asteroide:       { taskType: 'navegar_asteroide',       displayName: 'Navegar Campo de Asteroides',  difficulty: 'hard', visualCategory: 'turret' },
  reparar_reator:          { taskType: 'reparar_reator',          displayName: 'Reparar Reator',               difficulty: 'hard', visualCategory: 'engine' },
  hackear_terminal:        { taskType: 'hackear_terminal',        displayName: 'Hackear Terminal',             difficulty: 'hard', visualCategory: 'terminal' },
  sincronizar_motores:     { taskType: 'sincronizar_motores',     displayName: 'Sincronizar Motores',          difficulty: 'hard', visualCategory: 'engine' },
};

// Helpers
export const TASK_TYPES_BY_DIFFICULTY: Record<TaskDifficulty, TaskType[]> = {
  easy:   Object.values(TASK_REGISTRY).filter(m => m.difficulty === 'easy').map(m => m.taskType),
  medium: Object.values(TASK_REGISTRY).filter(m => m.difficulty === 'medium').map(m => m.taskType),
  hard:   Object.values(TASK_REGISTRY).filter(m => m.difficulty === 'hard').map(m => m.taskType),
};
