import { useEffect, useCallback } from 'react';
import { useGameStore } from '../stores/game-store.js';
import { useNetworkStore } from '../stores/network-store.js';
import type { TaskType } from '@shadow/shared';
// Existing tasks
import { ScannerTask } from './tasks/ScannerTask.js';
import { TrashTask } from './tasks/TrashTask.js';
import { EnergyPanelTask } from './tasks/EnergyPanelTask.js';
import { AsteroidCannonTask } from './tasks/AsteroidCannonTask.js';
import { CardReaderTask } from './tasks/CardReaderTask.js';
import { EngineTask } from './tasks/EngineTask.js';
import { GenericTask } from './tasks/GenericTask.js';
// New easy tasks
import { AmostraSangueTask } from './tasks/AmostraSangueTask.js';
import { LimparFiltroTask } from './tasks/LimparFiltroTask.js';
import { RegistrarTemperaturaTask } from './tasks/RegistrarTemperaturaTask.js';
import { AlinharAntenaTask } from './tasks/AlinharAntenaTask.js';
import { VerificarOxigenioTask } from './tasks/VerificarOxigenioTask.js';
import { EnviarRelatorioTask } from './tasks/EnviarRelatorioTask.js';
import { InspecionarTrajeTask } from './tasks/InspecionarTrajeTask.js';
import { EtiquetarCargaTask } from './tasks/EtiquetarCargaTask.js';
// New medium tasks
import { CalibrarBussolaTask } from './tasks/CalibrarBussolaTask.js';
import { SoldarCircuitoTask } from './tasks/SoldarCircuitoTask.js';
import { ConsertarTubulacaoTask } from './tasks/ConsertarTubulacaoTask.js';
import { DecodificarMensagemTask } from './tasks/DecodificarMensagemTask.js';
import { ReabastecerCombustivelTask } from './tasks/ReabastecerCombustivelTask.js';
import { ClassificarMineraisTask } from './tasks/ClassificarMineraisTask.js';
import { AjustarFrequenciaTask } from './tasks/AjustarFrequenciaTask.js';
import { ReconectarFiosTask } from './tasks/ReconectarFiosTask.js';
import { AnalisarDadosTask } from './tasks/AnalisarDadosTask.js';
import { EquilibrarCargaTask } from './tasks/EquilibrarCargaTask.js';
// New hard tasks
import { DesativarBombaTask } from './tasks/DesativarBombaTask.js';
import { NavegarAsteroideTask } from './tasks/NavegarAsteroideTask.js';
import { RepararReatorTask } from './tasks/RepararReatorTask.js';
import { HackearTerminalTask } from './tasks/HackearTerminalTask.js';
import { SincronizarMotoresTask } from './tasks/SincronizarMotoresTask.js';

export interface TaskComponentProps {
  onComplete: () => void;
  onCancel: () => void;
}

const TASK_COMPONENTS: Record<TaskType, React.ComponentType<TaskComponentProps>> = {
  // Existing
  scanner_bioidentificacao: ScannerTask,
  esvaziar_lixo: TrashTask,
  painel_energia: EnergyPanelTask,
  canhao_asteroides: AsteroidCannonTask,
  leitor_cartao: CardReaderTask,
  motores: EngineTask,
  generic: GenericTask,
  // Easy
  amostra_sangue: AmostraSangueTask,
  limpar_filtro: LimparFiltroTask,
  registrar_temperatura: RegistrarTemperaturaTask,
  alinhar_antena: AlinharAntenaTask,
  verificar_oxigenio: VerificarOxigenioTask,
  enviar_relatorio: EnviarRelatorioTask,
  inspecionar_traje: InspecionarTrajeTask,
  etiquetar_carga: EtiquetarCargaTask,
  // Medium
  calibrar_bussola: CalibrarBussolaTask,
  soldar_circuito: SoldarCircuitoTask,
  consertar_tubulacao: ConsertarTubulacaoTask,
  decodificar_mensagem: DecodificarMensagemTask,
  reabastecer_combustivel: ReabastecerCombustivelTask,
  classificar_minerais: ClassificarMineraisTask,
  ajustar_frequencia: AjustarFrequenciaTask,
  reconectar_fios: ReconectarFiosTask,
  analisar_dados: AnalisarDadosTask,
  equilibrar_carga: EquilibrarCargaTask,
  // Hard
  desativar_bomba: DesativarBombaTask,
  navegar_asteroide: NavegarAsteroideTask,
  reparar_reator: RepararReatorTask,
  hackear_terminal: HackearTerminalTask,
  sincronizar_motores: SincronizarMotoresTask,
};

export function TaskOverlay() {
  const taskOverlayVisible = useGameStore((s) => s.taskOverlayVisible);
  const activeTaskId = useGameStore((s) => s.activeTaskId);
  const activeTaskType = useGameStore((s) => s.activeTaskType);

  const handleComplete = useCallback(() => {
    const socket = useNetworkStore.getState().socket;
    const taskId = useGameStore.getState().activeTaskId;
    if (socket && taskId) {
      socket.emit('task:complete', { taskId });
      // Optimistic local update: mark task as completed immediately
      useGameStore.getState().updateTaskState(taskId, 'completed', null);
    }
    useGameStore.getState().closeTaskOverlay();
  }, []);

  const handleCancel = useCallback(() => {
    const socket = useNetworkStore.getState().socket;
    const taskId = useGameStore.getState().activeTaskId;
    if (socket && taskId) {
      socket.emit('task:cancel', { taskId });
      // Optimistic local update: revert task to pending
      useGameStore.getState().updateTaskState(taskId, 'pending', null);
    }
    useGameStore.getState().closeTaskOverlay();
  }, []);

  // ESC key to cancel
  useEffect(() => {
    if (!taskOverlayVisible) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [taskOverlayVisible, handleCancel]);

  if (!taskOverlayVisible || !activeTaskId || !activeTaskType) return null;

  const TaskComponent = TASK_COMPONENTS[activeTaskType];
  if (!TaskComponent) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.7)',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        color: '#e2e2f0',
      }}
      onClick={(e) => {
        // Cancel if clicking the backdrop itself
        if (e.target === e.currentTarget) handleCancel();
      }}
    >
      {/* ESC button - top right */}
      <button
        onClick={handleCancel}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'rgba(239, 68, 68, 0.2)',
          border: '1px solid #ef4444',
          borderRadius: 8,
          color: '#ef4444',
          fontSize: 13,
          fontWeight: 600,
          padding: '8px 16px',
          cursor: 'pointer',
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          zIndex: 101,
        }}
      >
        ESC - Fechar
      </button>

      {/* Task container panel */}
      <div
        style={{
          background: 'rgba(10, 10, 18, 0.95)',
          border: '1px solid #2a2a45',
          borderRadius: 16,
          padding: 32,
          minWidth: 400,
          maxWidth: 600,
          maxHeight: '80vh',
          overflow: 'auto',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <TaskComponent onComplete={handleComplete} onCancel={handleCancel} />
      </div>
    </div>
  );
}
