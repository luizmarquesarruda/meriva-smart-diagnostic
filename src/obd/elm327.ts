export interface ObdTransport {
  open(): Promise<void>;
  close(): Promise<void>;
  write(data: string): Promise<void>;
  readUntilPrompt(timeoutMs?: number): Promise<string>;
}

export interface ElmCommandResult {
  command: string;
  response: string;
  elapsedMs: number;
  status: 'OK' | 'TIMEOUT' | 'ERROR' | 'NO_RESPONSE';
}

export class Elm327Session {
  private opened = false;

  constructor(private readonly transport: ObdTransport) {}

  async initialize(): Promise<ElmCommandResult[]> {
    await this.transport.open();
    this.opened = true;
    const results: ElmCommandResult[] = [];
    for (const command of ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATSP0']) {
      results.push(await this.command(command));
    }
    return results;
  }

  async queryPid(pid: string): Promise<{ tx: string; rx: string; parsed: ReturnType<typeof import('./parser').parsePidResponse> }> {
    if (!this.opened) await this.initialize();
    const normalized = pid.replace(/\s/g, '').toUpperCase();
    const result = await this.command(normalized);
    const { parsePidResponse } = await import('./parser');
    return { tx: normalized, rx: result.response, parsed: parsePidResponse(normalized, result.response) };
  }

  async close(): Promise<void> {
    if (this.opened) await this.transport.close();
    this.opened = false;
  }

  private async command(command: string): Promise<ElmCommandResult> {
    const started = Date.now();
    try {
      await this.transport.write(`${command}\r`);
      const response = await this.transport.readUntilPrompt();
      return { command, response, elapsedMs: Date.now() - started, status: response.trim() ? 'OK' : 'NO_RESPONSE' };
    } catch (cause) {
      return {
        command,
        response: '',
        elapsedMs: Date.now() - started,
        status: cause instanceof Error && cause.message.includes('TIMEOUT') ? 'TIMEOUT' : 'ERROR',
      };
    }
  }
}
