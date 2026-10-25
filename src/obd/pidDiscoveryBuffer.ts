import type { ElmCommandResult } from './elm327';

/**
 * Buffer bounded de respostas OBD da descoberta atual.
 *
 * É intencionalmente instanciado por execução de descoberta: nenhuma resposta
 * atravessa sessões/ECUs, e os resultados brutos ficam disponíveis para auditoria.
 */
export class PidDiscoveryBuffer {
  private readonly entries = new Map<string, ElmCommandResult>();
  private readonly capacity: number;

  constructor(capacity = 64) {
    this.capacity = Number.isFinite(capacity)
      ? Math.max(1, Math.min(256, Math.floor(capacity)))
      : 64;
  }

  private normalizePid(command: string): string {
    const normalized = command.replace(/\s/g, '').toUpperCase();
    if (!/^01[0-9A-F]{2}$/.test(normalized)) {
      throw new Error('COMANDO FORA DO BUFFER DE DESCOBERTA PID');
    }
    return normalized;
  }

  record(result: ElmCommandResult): void {
    const command = this.normalizePid(result.command);
    // Regravar um comando move a versão mais recente para o fim da fila FIFO.
    this.entries.delete(command);
    this.entries.set(command, { ...result, command });

    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get(command: string): ElmCommandResult | undefined {
    const result = this.entries.get(this.normalizePid(command));
    return result ? { ...result } : undefined;
  }

  has(command: string): boolean {
    return this.entries.has(this.normalizePid(command));
  }

  snapshot(): ElmCommandResult[] {
    return Array.from(this.entries.values(), (result) => ({ ...result }));
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}
