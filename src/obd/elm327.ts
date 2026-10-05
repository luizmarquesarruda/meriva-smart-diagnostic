import { parsePidResponse } from './parser';
import {
  DEFAULT_ELM327_COMPATIBILITY,
  Elm327CompatibilityConfig,
  isNoDataResponse,
  isPartialResponseError,
  classifyElmError,
  ElmErrorType,
  ElmHealthSnapshot,
  isUnsupportedAtResponse,
  mergeCompatibilityConfig,
  normalizeElmResponse,
} from './elm327Compatibility';

export interface ObdTransport {
  open(): Promise<void>;
  close(): Promise<void>;
  write(data: string): Promise<void>;
  readUntilPrompt(timeoutMs?: number): Promise<string>;
}

export type ElmCommandStatus = 'OK' | 'TIMEOUT' | 'ERROR' | 'NO_RESPONSE' | 'UNSUPPORTED';

export interface ElmCommandResult {
  command: string;
  response: string;
  elapsedMs: number;
  status: ElmCommandStatus;
  attempt: number;
  errorMessage?: string;
}

export interface PidQueryResult {
  tx: string;
  rx: string;
  elapsedMs: number;
  commandStatus: ElmCommandStatus;
  protocol: string | null;
  parsed: ReturnType<typeof parsePidResponse>;
}

function classifyResponse(response: string): ElmCommandStatus {
  const normalized = normalizeElmResponse(response).toUpperCase();
  if (!normalized) return 'NO_RESPONSE';
  if (isUnsupportedAtResponse(normalized)) return 'UNSUPPORTED';
  if (/\b(NO DATA|UNABLE TO CONNECT|BUS INIT|BUS ERROR|STOPPED|ERROR)\b/.test(normalized)) {
    return 'ERROR';
  }
  return 'OK';
}

function normalizeCommand(command: string): string {
  const normalized = command.replace(/\s/g, '').toUpperCase();
  if (!normalized || !/^[0-9A-Z]+$/.test(normalized)) {
    throw new Error('COMANDO ELM INVÁLIDO');
  }
  return normalized;
}

export class Elm327Session {
  private opened = false;
  private protocol: string | null = null;
  private initializationPromise: Promise<ElmCommandResult[]> | null = null;
  private commandQueue: Promise<void> = Promise.resolve();
  private noDataCount = 0;
  private adaptiveTimeoutMs: number;
  private commands = 0;
  private successfulCommands = 0;
  private timeouts = 0;
  private unsupported = 0;
  private errors = 0;
  private totalResponseMs = 0;
  private lastErrorType: ElmErrorType = 'NONE';
  private readonly disabledOptionalCommands = new Set<string>();
  private readonly config: Elm327CompatibilityConfig;

  constructor(
    private readonly transport: ObdTransport,
    config?: Partial<Elm327CompatibilityConfig>,
  ) {
    this.config = mergeCompatibilityConfig(config ?? DEFAULT_ELM327_COMPATIBILITY);
    this.adaptiveTimeoutMs = Math.min(this.config.ioTimeoutMs, this.config.adaptiveTimeoutMaxMs);
  }

  async initialize(): Promise<ElmCommandResult[]> {
    if (this.initializationPromise) return this.initializationPromise;
    if (this.opened) return [];

    this.initializationPromise = this.performInitialize();
    try {
      return await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async performInitialize(): Promise<ElmCommandResult[]> {
    await this.transport.open();
    this.opened = true;
    this.protocol = null;
    this.noDataCount = 0;

    try {
      const results: ElmCommandResult[] = [];
      // ATZ reinicia fisicamente o firmware do clone. Alguns ELM327 precisam
      // de até ~1,2 s antes de voltar a aceitar comandos e entregar o prompt.
      // Sem essa janela, o primeiro ATZ pode parecer um erro mesmo com RFCOMM aberto.
      const mandatoryAttempts = 3;
      const mandatory = ['ATZ', 'ATI'];
      const forced = this.config.forceInitialization
        ? this.config.forceInitCommands.filter((item) => /^AT[A-Z0-9]+$/.test(item.toUpperCase()))
        : [];
      const optional = Array.from(new Set([...forced, 'ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATSP0']))
        .map((item) => item.toUpperCase())
        .filter((item) => !mandatory.includes(item));

      for (const command of [...mandatory, ...optional]) {
        if (this.disabledOptionalCommands.has(command)) continue;
        let result = await this.command(command);
        for (let retry = 1; retry < mandatoryAttempts && result.status !== 'OK'; retry += 1) {
          if (command === 'ATZ') {
            await new Promise((resolve) => setTimeout(resolve, 1200));
          } else {
            await new Promise((resolve) => setTimeout(resolve, 350));
          }
          result = await this.command(command, retry + 1);
        }
        results.push(result);

        // Cheap v1.5 clones often return the ATZ prompt before their serial
        // command processor is fully ready. Give the firmware a short, fixed
        // settling window even when ATZ succeeded on the first try.
        if (command === 'ATZ' && result.status === 'OK') {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // ATI/ATZ prove that the adapter is alive. Other AT commands are
        // best-effort because real-world ELM327 clones expose different subsets.
        if (mandatory.includes(command) && result.status !== 'OK') {
          throw new Error(`ELM NÃO RESPONDEU CORRETAMENTE A ${command}: ${result.status}`);
        }
      }

      const protocolResult = await this.command('ATDP');
      results.push(protocolResult);
      if (protocolResult.status === 'OK') {
        const detected = normalizeElmResponse(protocolResult.response);
        this.protocol = detected || null;
      }

      return results;
    } catch (cause) {
      this.opened = false;
      try {
        await this.transport.close();
      } catch {
        // preserva o erro original
      }
      this.protocol = null;
      throw cause;
    }
  }

  async identifyProtocol(): Promise<ElmCommandResult> {
    await this.initialize();
    const result = await this.executeCommand('ATDP');
    if (result.status === 'OK') {
      const detected = normalizeElmResponse(result.response);
      this.protocol = detected || null;
    }
    return result;
  }

  getProtocol(): string | null {
    return this.protocol;
  }

  getNoDataCount(): number {
    return this.noDataCount;
  }

  getCompatibilityConfig(): Elm327CompatibilityConfig {
    return { ...this.config };
  }

  getHealthSnapshot(): ElmHealthSnapshot {
    return {
      commands: this.commands,
      successfulCommands: this.successfulCommands,
      noData: this.noDataCount,
      timeouts: this.timeouts,
      unsupported: this.unsupported,
      errors: this.errors,
      averageResponseMs: this.commands ? Math.round(this.totalResponseMs / this.commands) : 0,
      adaptiveTimeoutMs: this.adaptiveTimeoutMs,
      recoveryRecommended: this.noDataCount >= this.config.noDataReconnectThreshold || this.timeouts >= 3,
      lastErrorType: this.lastErrorType,
    };
  }

  shouldRecover(): boolean {
    return this.getHealthSnapshot().recoveryRecommended;
  }

  async queryPid(pid: string): Promise<PidQueryResult> {
    await this.initialize();
    const normalized = normalizeCommand(pid);
    const result = await this.executeCommand(normalized);
    const parsed = parsePidResponse(normalized, result.response);

    return {
      tx: normalized,
      rx: result.response,
      elapsedMs: result.elapsedMs,
      commandStatus: result.status,
      protocol: this.protocol,
      parsed,
    };
  }

  async executeCommand(command: string): Promise<ElmCommandResult> {
    await this.initialize();
    const normalized = normalizeCommand(command);
    return this.enqueueCommand(() => this.command(normalized));
  }

  async close(): Promise<void> {
    const initialization = this.initializationPromise;
    if (initialization) {
      try {
        await initialization;
      } catch {
        // a inicialização já fechou o transporte
      }
    }

    await this.enqueueCommand(async () => {
      if (this.opened) {
        try {
          await this.transport.close();
        } finally {
          this.opened = false;
          this.protocol = null;
        }
      } else {
        this.protocol = null;
      }
    });
  }

  private enqueueCommand<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.commandQueue;
    let release!: () => void;
    this.commandQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    return previous.then(operation).finally(() => release());
  }

  private async command(command: string, attempt = 1): Promise<ElmCommandResult> {
    if (!this.opened) throw new Error('ELM NÃO INICIALIZADO');

    const started = Date.now();
    try {
      if (this.config.commandDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.config.commandDelayMs));
      }

      await this.transport.write(`${command}\r`);
      // ATSP0 can spend several seconds searching protocols on inexpensive
      // ELM327 v1.5 clones. Keep the generic adaptive timeout, but never let
      // protocol auto-detection expire before the configured I/O ceiling.
      const timeout = command === 'ATSP0'
        ? this.config.ioTimeoutMs
        : (this.config.adaptiveTiming ? this.adaptiveTimeoutMs : this.config.ioTimeoutMs);
      const response = await this.transport.readUntilPrompt(timeout);
      const normalizedResponse = normalizeElmResponse(response);
      const status = classifyResponse(normalizedResponse);
      const errorType = classifyElmError(normalizedResponse);
      this.commands += 1;
      this.totalResponseMs += Date.now() - started;
      this.lastErrorType = errorType;
      if (status === 'OK') this.successfulCommands += 1;
      if (status === 'UNSUPPORTED') {
        this.unsupported += 1;
        if (this.config.allowUnsupportedAtCommands && /^AT[A-Z0-9]+$/.test(command)) {
          this.disabledOptionalCommands.add(command);
        }
      }
      if (status === 'ERROR') this.errors += 1;
      if (isNoDataResponse(normalizedResponse)) this.noDataCount += 1;
      else if (normalizedResponse) this.noDataCount = 0;

      if (this.config.adaptiveTiming) {
        if (status === 'OK' && Date.now() - started < this.adaptiveTimeoutMs / 2) {
          this.adaptiveTimeoutMs = Math.max(this.config.adaptiveTimeoutMinMs, this.adaptiveTimeoutMs - this.config.adaptiveTimeoutStepMs);
        } else if (status === 'ERROR' || status === 'TIMEOUT') {
          this.adaptiveTimeoutMs = Math.min(this.config.adaptiveTimeoutMaxMs, this.adaptiveTimeoutMs + this.config.adaptiveTimeoutStepMs);
        }
      }

      return {
        command,
        response: normalizedResponse,
        elapsedMs: Date.now() - started,
        status,
        attempt,
        ...(status === 'ERROR'
          ? { errorMessage: 'ELM retornou erro ou ausência de dados' }
          : status === 'UNSUPPORTED'
            ? { errorMessage: 'COMANDO AT NÃO SUPORTADO PELO ADAPTADOR' }
            : {}),
      };
    } catch (cause) {
      this.commands += 1;
      this.timeouts += 1;
      this.lastErrorType = classifyElmError('', cause instanceof Error ? cause.message : '');
      if (this.config.adaptiveTiming) {
        this.adaptiveTimeoutMs = Math.min(this.config.adaptiveTimeoutMaxMs, this.adaptiveTimeoutMs + this.config.adaptiveTimeoutStepMs);
      }
      const errorMessage = cause instanceof Error ? cause.message : 'ERRO DESCONHECIDO';
      const status: ElmCommandStatus = isPartialResponseError(errorMessage)
        ? 'TIMEOUT'
        : errorMessage.includes('TIMEOUT')
          ? 'TIMEOUT'
          : 'ERROR';

      return {
        command,
        response: '',
        elapsedMs: Date.now() - started,
        status,
        attempt,
        errorMessage,
      };
    }
  }
}
