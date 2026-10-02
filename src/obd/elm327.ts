import { parsePidResponse } from './parser';

export interface ObdTransport {
  open(): Promise<void>;
  close(): Promise<void>;
  write(data: string): Promise<void>;
  readUntilPrompt(timeoutMs?: number): Promise<string>;
}

export type ElmCommandStatus = 'OK' | 'TIMEOUT' | 'ERROR' | 'NO_RESPONSE';

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
  parsed: ReturnType<typeof parsePidResponse>;
}

function classifyResponse(response: string): ElmCommandStatus {
  const normalized = response.trim().toUpperCase();
  if (!normalized) return 'NO_RESPONSE';
  if (/\b(NO DATA|UNABLE TO CONNECT|BUS INIT|BUS ERROR|STOPPED|ERROR)\b/.test(normalized)) return 'ERROR';
  if (normalized === '?' || normalized.endsWith('\n?')) return 'ERROR';
  return 'OK';
}

export class Elm327Session {
  private opened = false;
  private initializing = false;

  constructor(private readonly transport: ObdTransport) {}

  async initialize(): Promise<ElmCommandResult[]> {
    if (this.initializing) throw new Error('INICIALIZAÇÃO ELM JÁ EM ANDAMENTO');
    this.initializing = true;

    try {
      await this.transport.open();
      this.opened = true;
      const results: ElmCommandResult[] = [];

      for (const command of ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATSP0']) {
        const result = await this.command(command);
        results.push(result);
        if (result.status !== 'OK') {
          throw new Error(`ELM NÃO ACEITOU ${command}: ${result.status}`);
        }
      }
      return results;
    } catch (cause) {
      this.opened = false;
      try { await this.transport.close(); } catch { /* preserva erro original */ }
      throw cause;
    } finally {
      this.initializing = false;
    }
  }

  async queryPid(pid: string): Promise<PidQueryResult> {
    if (!this.opened) await this.initialize();
    const normalized = pid.replace(/\s/g, '').toUpperCase();
    const result = await this.command(normalized);
    const parsed = parsePidResponse(normalized, result.response);

    return {
      tx: normalized,
      rx: result.response,
      elapsedMs: result.elapsedMs,
      commandStatus: result.status,
      parsed,
    };
  }

  async close(): Promise<void> {
    if (this.opened) await this.transport.close();
    this.opened = false;
  }

  private async command(command: string, attempt = 1): Promise<ElmCommandResult> {
    const started = Date.now();
    try {
      await this.transport.write(`${command}\r`);
      const response = await this.transport.readUntilPrompt();
      const status = classifyResponse(response);
      return {
        command,
        response,
        elapsedMs: Date.now() - started,
        status,
        attempt,
        ...(status === 'ERROR' ? { errorMessage: 'ELM retornou erro ou ausência de dados' } : {}),
      };
    } catch (cause) {
      const errorMessage = cause instanceof Error ? cause.message : 'ERRO DESCONHECIDO';
      return {
        command,
        response: '',
        elapsedMs: Date.now() - started,
        status: errorMessage.includes('TIMEOUT') ? 'TIMEOUT' : 'ERROR',
        attempt,
        errorMessage,
      };
    }
  }
}
