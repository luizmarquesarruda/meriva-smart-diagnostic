import { parsePidResponse } from './parser';
import {
  DEFAULT_ELM327_COMPATIBILITY,
  Elm327CompatibilityConfig,
  isNoDataResponse,
  isPartialResponseError,
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
  private readonly config: Elm327CompatibilityConfig;

  constructor(
    private readonly transport: ObdTransport,
    config?: Partial<Elm327CompatibilityConfig>,
  ) {
    this.config = mergeCompatibilityConfig(config ?? DEFAULT_ELM327_COMPATIBILITY);
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
      const mandatory = this.config.forceInitialization ? ['ATZ', 'ATI'] : ['ATI'];
      const optional = this.config.forceInitialization
        ? ['ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATSP0']
        : ['ATL0', 'ATS0', 'ATH1', 'ATSP0'];

      for (const command of [...mandatory, ...optional]) {
        const result = await this.command(command);
        results.push(result);

        // ATI/ATZ prove that the adapter is alive. Other AT commands are
        // best-effort because real-world ELM327 clones expose different subsets.
        if (mandatory.includes(command) && !['OK', 'UNSUPPORTED'].includes(result.status)) {
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
      const response = await this.transport.readUntilPrompt(this.config.ioTimeoutMs);
      const normalizedResponse = normalizeElmResponse(response);
      const status = classifyResponse(normalizedResponse);

      if (isNoDataResponse(normalizedResponse)) this.noDataCount += 1;
      else if (normalizedResponse) this.noDataCount = 0;

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
