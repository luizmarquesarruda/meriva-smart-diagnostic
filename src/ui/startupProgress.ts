import type { BluetoothLifecycleState } from '../obd/bluetoothState';
import type { StartupPidPreflightSnapshot } from '../diagnostics/startupPidPreflight';

export const STARTUP_MIN_DURATION_MS = 6_000;
export const STARTUP_TIMEOUT_MS = 30_000;
export const STARTUP_TERMINAL_HOLD_MS = 700;
export const STARTUP_TIMEOUT_HOLD_MS = 1_200;

export type StartupTerminalState = 'progress' | 'ready' | 'partial' | 'offline';

export interface StartupProgressInput {
  hydrated: boolean;
  settingsLoaded: boolean;
  autoConnect: boolean;
  searching: boolean;
  ecuConnected: boolean;
  lifecycle: BluetoothLifecycleState;
  error: string | null;
  timedOut: boolean;
  pidPreflight: StartupPidPreflightSnapshot;
}

export interface StartupProgress {
  percent: number;
  title: string;
  detail: string;
  pidDetail: string | null;
  terminal: StartupTerminalState;
}

function stage(
  percent: number,
  title: string,
  detail: string,
  terminal: StartupTerminalState = 'progress',
  pidDetail: string | null = null,
): StartupProgress {
  return {
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    title,
    detail,
    pidDetail,
    terminal,
  };
}

/** Percentuais representam marcos reais do ciclo Bluetooth/ELM/ECU e das leituras iniciais. */
export function getStartupProgress(input: StartupProgressInput): StartupProgress {
  if (input.settingsLoaded && !input.autoConnect) {
    return stage(100, 'APLICATIVO PRONTO', 'Conexão automática desativada. O painel abrirá sem iniciar uma sessão OBD.', 'ready');
  }
  if (input.timedOut) {
    const detail = input.ecuConnected
      ? 'ECU validada. O tempo para verificar os PIDs terminou; o painel abrirá com a verificação parcial.'
      : 'Abrindo o painel em modo offline. A tentativa de conexão não foi validada dentro do limite de tempo.';
    return stage(100, 'TEMPO DE INICIALIZAÇÃO ESGOTADO', detail, 'offline');
  }
  if (!input.hydrated) {
    return stage(8, 'PREPARANDO O APLICATIVO', 'Carregando configurações locais e histórico de diagnóstico.');
  }
  if (!input.settingsLoaded) {
    return stage(100, 'CONFIGURAÇÃO INDISPONÍVEL', 'Abrindo o painel em modo offline; nenhuma ECU foi marcada como conectada.', 'offline');
  }

  const preflight = input.pidPreflight;
  if (preflight.status === 'running') {
    const totalAttempts = preflight.totalPids * 5;
    const attempted = preflight.completedPids * 5 + Math.max(0, preflight.currentAttempt - 1);
    const fraction = totalAttempts > 0 ? Math.min(1, attempted / totalAttempts) : 0;
    const percent = 88 + Math.round(fraction * 10);
    const pidDetail = preflight.currentPid
      ? 'PID ' + preflight.currentPid + ' · ' + (preflight.currentLabel ?? 'Verificação inicial')
        + ' · leitura ' + preflight.currentAttempt + '/5'
        + ' · válidas nesta rodada: ' + preflight.validReadings
      : 'Preparando os PIDs essenciais anunciados pela ECU.';
    return stage(
      percent,
      'VALIDANDO PIDs ESSENCIAIS',
      'Cada PID selecionado precisa de cinco tentativas e cinco respostas numéricas válidas. PIDs não anunciados não são consultados.',
      'progress',
      pidDetail,
    );
  }

  if (input.ecuConnected) {
    if (preflight.status === 'complete') {
      const unsupported = preflight.unsupportedPids.length;
      const detail = preflight.verifiedPids.length + ' PIDs essenciais verificados com cinco respostas válidas cada.'
        + (unsupported ? ' ' + unsupported + ' PID(s) não anunciado(s) pela ECU foram ignorados.' : '')
        + ' A conexão ECU será mantida ao abrir o painel.';
      return stage(100, 'APLICATIVO PRONTO', detail, 'ready');
    }
    if (preflight.status === 'partial') {
      const detail = 'ECU conectada; ' + preflight.verifiedPids.length + '/' + preflight.totalPids
        + ' PIDs anunciados completaram cinco leituras válidas. Dados ausentes permanecem N/D, não zero.';
      return stage(100, 'APLICATIVO PRONTO · VERIFICAÇÃO PARCIAL', detail, 'partial');
    }
    return stage(84, 'ECU VALIDADA', 'Preparando cinco leituras sequenciais dos PIDs essenciais antes de abrir o painel.');
  }

  if (input.error && !input.searching) {
    return stage(100, 'CONEXÃO NÃO VALIDADA', 'O painel será aberto em modo offline. Verifique Bluetooth, adaptador e resposta da ECU.', 'offline');
  }

  if (preflight.status === 'partial') {
    return stage(100, 'VERIFICAÇÃO INICIAL PARCIAL', preflight.message ?? 'A conexão ou as leituras iniciais foram interrompidas. Dados ausentes não são tratados como zero.', 'partial');
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
      return stage(84, 'ECU RESPONDENDO', 'Validando os dados OBD antes de começar a verificação dos PIDs.');
    case 'READY':
      return stage(84, 'ECU VALIDADA', 'Preparando a verificação sequencial dos PIDs essenciais.');
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

/** Impede encerramento antes de seis segundos e libera o painel após o timeout. */
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
