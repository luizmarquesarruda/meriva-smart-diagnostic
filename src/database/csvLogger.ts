import * as FileSystem from 'expo-file-system';

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvRow {
  [key: string]: CsvValue;
  timestamp?: string;
  pid?: string;
  nome?: string;
  valor?: string | number | null;
  unidade?: string;
  rpm?: number | string | null;
  temperatura?: number | string | null;
  velocidade?: number | string | null;
  condicao?: string;
}

interface FileQueue {
  pending: CsvRow[];
  timer: ReturnType<typeof setTimeout> | null;
  flushing: Promise<void> | null;
}

const fileQueues = new Map<string, FileQueue>();
const MAX_BATCH_ROWS = 16;
const FLUSH_DELAY_MS = 750;
const RETRY_DELAY_MS = 2500;

function formatCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const asString = String(value);
  return /[,"\r\n]/.test(asString)
    ? `"${asString.replace(/"/g, '""')}"`
    : asString;
}

async function appendCsvRowsUnsafe(filePath: string, rows: CsvRow[]): Promise<void> {
  if (rows.length === 0) return;

  const directory = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '.';
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  // Todas as linhas do mesmo arquivo são gravadas com a ordem do cabeçalho.
  const keys = Object.keys(rows[0]);
  const serializedRows = rows.map((row) => keys.map((key) => formatCsvValue(row[key])).join(','));
  const info = await FileSystem.getInfoAsync(filePath);

  let content: string;
  if (!info.exists) {
    content = `${keys.join(',')}\n${serializedRows.join('\n')}\n`;
  } else {
    const current = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (current.length === 0) {
      content = `${keys.join(',')}\n${serializedRows.join('\n')}\n`;
    } else {
      // Preserva o conteúdo existente sem trim(), que poderia remover espaços válidos da última linha.
      const separator = current.endsWith('\n') || current.endsWith('\r') ? '' : '\n';
      content = `${current}${separator}${serializedRows.join('\n')}\n`;
    }
  }

  // Escrever e validar um temporário evita truncar o CSV principal se a serialização/gravação falhar.
  const temporaryPath = `${filePath}.tmp`;
  await FileSystem.writeAsStringAsync(temporaryPath, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const verifiedContent = await FileSystem.readAsStringAsync(temporaryPath, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (verifiedContent !== content) throw new Error('CSV_TEMPORARY_READBACK_MISMATCH');

  await FileSystem.copyAsync({ from: temporaryPath, to: filePath });
  try {
    await FileSystem.deleteAsync(temporaryPath, { idempotent: true });
  } catch {
    // O CSV principal já foi atualizado; um temporário órfão será sobrescrito no próximo flush.
  }
}

function scheduleFlush(filePath: string, queue: FileQueue, delayMs = FLUSH_DELAY_MS): void {
  if (queue.timer || queue.flushing) return;
  queue.timer = setTimeout(() => {
    queue.timer = null;
    void flushQueue(filePath, queue).catch((cause) => {
      console.warn('[csv] falha ao gravar lote; linhas mantidas para retentativa:', cause instanceof Error ? cause.message : cause);
      scheduleFlush(filePath, queue, RETRY_DELAY_MS);
    });
  }, delayMs);
}

async function flushQueue(filePath: string, queue: FileQueue): Promise<void> {
  if (queue.timer) clearTimeout(queue.timer);
  queue.timer = null;

  // Uma única operação por arquivo, inclusive quando timer, limite de lote e flush explícito
  // acontecem quase ao mesmo tempo. A operação em andamento consome também novas linhas.
  if (queue.flushing) return queue.flushing;

  const work = (async () => {
    while (queue.pending.length > 0) {
      const batch = queue.pending.splice(0, MAX_BATCH_ROWS);
      try {
        await appendCsvRowsUnsafe(filePath, batch);
      } catch (cause) {
        queue.pending.unshift(...batch);
        throw cause;
      }
    }
  })();

  queue.flushing = work;
  try {
    await work;
  } finally {
    if (queue.flushing === work) queue.flushing = null;
    if (queue.pending.length > 0) {
      scheduleFlush(filePath, queue, RETRY_DELAY_MS);
    } else if (!queue.timer && fileQueues.get(filePath) === queue) {
      fileQueues.delete(filePath);
    }
  }
}

/**
 * Enfileira uma linha sem bloquear o polling OBD pelo tempo de leitura/regravação do CSV.
 * Lotes pequenos reduzem o número de regravações; flushCsvRows() permite exigir persistência
 * em limites importantes, como encerramento da sessão ou gravação de uma viagem.
 */
export async function appendCsvRow(filePath: string, row: CsvRow): Promise<void> {
  let queue = fileQueues.get(filePath);
  if (!queue) {
    queue = { pending: [], timer: null, flushing: null };
    fileQueues.set(filePath, queue);
  }

  // Snapshot evita que o chamador altere os valores depois de enfileirar a linha.
  queue.pending.push({ ...row });

  if (queue.pending.length >= MAX_BATCH_ROWS) {
    if (queue.timer) clearTimeout(queue.timer);
    queue.timer = null;
    void flushQueue(filePath, queue).catch((cause) => {
      console.warn('[csv] falha ao gravar lote; linhas mantidas para retentativa:', cause instanceof Error ? cause.message : cause);
      scheduleFlush(filePath, queue!, RETRY_DELAY_MS);
    });
  } else {
    scheduleFlush(filePath, queue);
  }
}

/** Grava os lotes pendentes. Sem argumento, descarrega todos os arquivos enfileirados. */
export async function flushCsvRows(filePath?: string): Promise<void> {
  for (;;) {
    const queues = filePath
      ? (fileQueues.has(filePath) ? [[filePath, fileQueues.get(filePath)!] as const] : [])
      : Array.from(fileQueues.entries());

    if (queues.length === 0) return;

    const results = await Promise.allSettled(
      queues.map(([path, queue]) => flushQueue(path, queue)),
    );
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failed) {
      for (const [path, queue] of queues) {
        if (queue.pending.length > 0) scheduleFlush(path, queue, RETRY_DELAY_MS);
      }
      throw failed.reason;
    }

    if (filePath && !fileQueues.has(filePath)) return;
  }
}
