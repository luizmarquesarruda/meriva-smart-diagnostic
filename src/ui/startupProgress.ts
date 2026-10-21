import type { BluetoothLifecycleState } from '../obd/bluetoothState';

export const STARTUP_MIN_DURATION_MS = 6_000;
export const STARTUP_TIMEOUT_MS = 30_000;
export const STARTUP_TERMINAL_HOLD_MS = 700;
export const STARTUP_TIMEOUT_HOLD_MS = 1_200;

export type StartupTerminalState = 'progress' | 'ready' | 'offline';

export interface StartupProgressInput {
  hydrated: boolean;
  settingsLoaded: boolean;
  autoConnect: boolean;
  searching: boolean;
  ecuConnected: boolean;
  lifecycle: BluetoothLifecycleState;
  error: string | null;
  timedOut: boolean;
}

export interface StartupProgress {
  percent: number;
  title: string;
  detail: string;
  terminal: StartupTerminalState;
}

function stage(
  percent: number,
  title: string,
  detail: string,
  terminal: StartupTerminalState = 'progress',
): StartupProgress {
  return { percent: Math.max(0, Math.min(100, Math.round(percent))), title, detail, terminal };
}

/** Percentuais representam marcos reais do ciclo Bluetooth/ELM/ECU. */
export function getStartupProgress(input: StartupProgressInput): StartupProgress {
  if (input.settingsLoaded && !input.autoConnect) {
    return stage(100, 'APLICATIVO PRONTO', 'Conexão automática desativada. O painel abrirá sem iniciar uma sessão OBD.', 'ready');
  }
  if (input.settingsLoaded && input.ecuConnected) {
    return stage(100, 'APLICATIVO PRONTO', 'ECU validada por uma resposta OBD real. Telemetria e painel disponíveis.', 'ready');
  }
  if (input.timedOut) {
    return stage(100, 'TEMPO DE CONEXÃO ESGOTADO', 'Abrindo o painel em modo offline. A tentativa OBD existente pode concluir sem bloquear o aplicativo.', 'offline');
  }
  if (!input.hydrated) {
    return stage(8, 'PREPARANDO O APLICATIVO', 'Carregando configurações locais e histórico de diagnóstico.');
  }
  if (!input.settingsLoaded) {
    return stage(100, 'CONFIGURAÇÃO INDISPONÍVEL', 'Abrindo o painel em modo offline; nenhuma ECU foi marcada como conectada.', 'offline');
  }
  if (input.error && !input.searching) {
    return stage(100, 'CONEXÃO NÃO VALIDADA', 'O painel será aberto em modo offline. Verifique Bluetooth, adaptador e resposta da ECU.', 'offline');
  }

  switch (input.lifecycle) {
    case 'UNSUPPORTED':
      return input.searching
        ? stage(12, 'VERIFICANDO COMPATIBILIDADE', 'Avaliando o suporte Bluetooth deste dispositivo.')
        : stage(100, 'BLUETOOTH INDISPONÍVEL', 'Abrindo o painel sem declarar a ECU conectada.', 'offline');
    case 'BLUETOOTH_OFF':
      return stage(14, 'VERIFICANDO BLUETOOTH', 'Aguardando a camada Bluetooth e a disponibilidade do adaptador.');
    case 'BLUETOOTH_ON':
      return stage(20, 'LOCALIZANDO ADAPTADOR', 'Procurando um adaptador ELM327 pareado.');
    case 'DEVICE_SELECTED':
      return stage(30, 'ADAPTADOR LOCALIZADO', 'Preparando o canal serial Bluetooth Classic.');
    case 'BLUETOOTH_CONNECTING':
      return stage(40, 'CONECTANDO ADAPTADOR', 'Abrindo o enlace Bluetooth Classic sem consultas OBD paralelas.');
    case 'BLUETOOTH_CONNECTED':
      return stage(54, 'BLUETOOTH CONECTADO', 'Validando se o adaptador ELM327 responde aos comandos.');
    case 'ELM_RESPONDING':
      return stage(67, 'VALIDANDO ELM327', 'Conferindo resposta e inicialização do adaptador.');
    case 'ELM_INITIALIZED':
      return stage(78, 'ELM327 INICIALIZADO', 'Negociando o protocolo e aguardando resposta válida da ECU.');
    case 'ECU_RESPONDING':
      return stage(88, 'ECU RESPONDENDO', 'Validando dados OBD antes de declarar a conexão pronta.');
    case 'READY':
      return stage(94, 'CONFIRMANDO LEITURA OBD', 'Finalizando a validação da ECU e dos PIDs suportados.');
    case 'DISCONNECTED':
      return input.searching
        ? stage(38, 'RECUPERANDO CONEXÃO', 'Tentativa de recuperação em andamento; o painel continua protegido contra falso estado conectado.')
        : stage(100, 'SEM CONEXÃO OBD', 'Abrindo o painel. Leituras sem resposta não serão tratadas como dados reais.', 'offline');
    case 'ERROR':
      return input.searching
        ? stage(24, 'RECUPERANDO COMUNICAÇÃO', 'Reavaliando o estado do adaptador antes de concluir a abertura.')
        : stage(100, 'CONEXÃO NÃO VALIDADA', 'Abrindo o painel em modo offline.', 'offline');
    default:
      return stage(input.searching ? 18 : 12, 'INICIALIZANDO DIAGNÓSTICO', 'Aguardando o próximo estado confirmado de conexão.');
  }
}

/**
 * A tela nunca fecha antes de seis segundos. Quando há um resultado terminal,
 * ele fica visível por tempo suficiente; sem resultado, o timeout permite abrir
 * o painel em modo offline em vez de prender o usuário na inicialização.
 */
export function getStartupHideDelayMs(input: {
  elapsedMs: number;
  terminal: StartupTerminalState;
  timedOut: boolean;
}): number | null {
  if (input.terminal === 'progress') return null;
  const minimumRemaining = Math.max(0, STARTUP_MIN_DURATION_MS - Math.max(0, input.elapsedMs));
  const terminalHold = input.timedOut ? STARTUP_TIMEOUT_HOLD_MS : STARTUP_TERMINAL_HOLD_MS;
  return Math.max(minimumRemaining, terminalHold);
}
