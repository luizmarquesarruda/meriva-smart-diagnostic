import { ObdTransport } from './elm327';

/**
 * Transporte local exclusivamente para desenvolvimento e demonstração.
 * Não representa uma leitura de uma ECU real e nunca deve alimentar o aprendizado.
 */
export interface SimulatedTransportOptions {
  latencyMs?: number;
  chunkSize?: number;
}

export class SimulatedObdTransport implements ObdTransport {
  private opened = false;
  private pendingResponse = '';
  private readonly latencyMs: number;
  private readonly chunkSize: number;

  constructor(options: SimulatedTransportOptions = {}) {
    this.latencyMs = Math.max(0, options.latencyMs ?? 35);
    this.chunkSize = Math.max(1, Math.floor(options.chunkSize ?? 0));
  }

  async open(): Promise<void> {
    this.opened = true;
  }

  async close(): Promise<void> {
    this.opened = false;
    this.pendingResponse = '';
  }

  async write(data: string): Promise<void> {
    if (!this.opened) {
      throw new Error('TRANSPORTE SIMULADO FECHADO');
    }

    const command = data.trim().toUpperCase();
    this.pendingResponse = this.responseFor(command) + '\\r>';
  }

  async readUntilPrompt(timeoutMs = 1000): Promise<string> {
    if (!this.opened) {
      throw new Error('TRANSPORTE SIMULADO FECHADO');
    }

    if (timeoutMs <= 0) {
      throw new Error('TIMEOUT');
    }

    const response = this.pendingResponse;
    if (response.length === 0) return response;
    const delay = Math.min(this.latencyMs, timeoutMs);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    if (this.chunkSize <= 0 || this.chunkSize >= response.length) return response;

    // O transporte simulado entrega o mesmo tipo de fragmentação que o stream
    // RFCOMM real: o framing final continua sendo responsabilidade do consumidor.
    let assembled = '';
    for (let index = 0; index < response.length; index += this.chunkSize) {
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 1));
      assembled += response.slice(index, index + this.chunkSize);
    }
    return assembled;
  }

  private responseFor(command: string): string {
    const responses: Record<string, string> = {
      ATZ: 'ELM327 v1.5',
      ATI: 'ELM327 v1.5',
      ATE0: 'OK',
      ATL0: 'OK',
      ATS0: 'OK',
      ATH1: 'OK',
      ATAT1: 'OK',
      ATST32: 'OK',
      ATSP0: 'OK',
      ATSP5: 'OK',
      ATDP: 'SIMULATED OBD TRANSPORT',
      '0100': '41 00 BE 3E B8 13',
      '0120': '41 20 80 00 00 01',
      '0140': '41 40 00 00 00 00',
      '0160': '41 60 00 00 00 00',
      '0105': '41 05 69',
      '0106': '41 06 7E',
      '010B': '41 0B 25',
      '010C': '41 0C 0C 18',
      '010D': '41 0D 00',
      '0110': '41 10 02 5E',
      '0142': '41 42 35 00',
    };

    return responses[command] ?? 'NO DATA';
  }
}
