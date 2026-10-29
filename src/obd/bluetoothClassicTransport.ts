import RNBluetoothClassic, { BluetoothDevice } from 'react-native-bluetooth-classic';
import { Platform } from 'react-native';
import { ObdTransport } from './elm327';
import { DEFAULT_ELM327_COMPATIBILITY, Elm327CompatibilityConfig, mergeCompatibilityConfig } from './elm327Compatibility';
import { awaitNativeCleanupRetry, runWithTimeout, timedOutNativeAttemptStillPending, waitForNativeConnectAttempt } from './connectionRecovery';
import { decideBluetoothRadioRecovery } from './bluetoothRadioRecovery';

export interface BluetoothDeviceInfo {
  address: string;
  name: string;
  bonded?: boolean;
}

type NativeConnectPromise = Promise<BluetoothDevice>;
const pendingNativeConnections = new Map<string, NativeConnectPromise>();
const pendingNativeConnectionSettlements = new Map<string, Promise<void>>();

interface PendingNativeSocketCleanup {
  promise: Promise<void>;
  retry: () => Promise<void>;
  retryPromise: Promise<void> | null;
}

// Shared across transport instances: a manual reconnect must respect cleanup
// from a timed-out write on the same adapter address.
const pendingNativeSocketCleanups = new Map<string, PendingNativeSocketCleanup>();
const pendingNativeDisconnectOperations = new Map<string, Promise<void>>();

// ELM327 retorna linhas curtas; 16 KiB é uma margem generosa e evita RX ilimitado.
export const MAX_ELM_RX_BUFFER_CHARS = 16 * 1024;
const RX_DIAGNOSTIC_PREVIEW_CHARS = 256;
const NATIVE_CONNECTION_CHECK_TIMEOUT_MS = 1000;
const NATIVE_DISCOVERY_TIMEOUT_MS = 2000;
let pendingNativeDiscoveryCancellation: Promise<void> | null = null;

/** Share a still-pending Android discovery cancellation across all transport instances. */
async function cancelBluetoothDiscovery(): Promise<void> {
  if (typeof RNBluetoothClassic.cancelDiscovery !== 'function') return;

  if (!pendingNativeDiscoveryCancellation) {
    const pending = Promise.resolve().then(async () => {
      await RNBluetoothClassic.cancelDiscovery!();
    });
    pendingNativeDiscoveryCancellation = pending;
    const clearIfSettled = () => {
      if (pendingNativeDiscoveryCancellation === pending) pendingNativeDiscoveryCancellation = null;
    };
    void pending.then(clearIfSettled, clearIfSettled);
  }

  const pending = pendingNativeDiscoveryCancellation;
  await runWithTimeout(
    () => pending,
    NATIVE_DISCOVERY_TIMEOUT_MS,
    'TIMEOUT: CANCELAMENTO DA DESCOBERTA BLUETOOTH',
  );
}

async function waitForPendingNativeSocketCleanup(addressKey: string, timeoutMs: number): Promise<void> {
  const pending = pendingNativeSocketCleanups.get(addressKey);
  if (!pending) return;

  const currentPromise = pending.promise;
  const settled = await waitForNativeConnectAttempt(currentPromise, timeoutMs);
  if (!settled) {
    throw new Error('LIMPEZA NATIVA ANTERIOR AINDA PENDENTE; NOVA CONEXÃO RFCOMM BLOQUEADA');
  }

  try {
    await currentPromise;
  } catch {
    // A cleanup attempt failed earlier. Retry it serially before opening a new
    // socket; retain the guard if the adapter is still connected or unknown.
    let retryPromise = pending.retryPromise;
    if (!retryPromise) {
      retryPromise = Promise.resolve().then(() => pending.retry());
      pending.retryPromise = retryPromise;
      pending.promise = retryPromise;
      void retryPromise.then(
        () => { if (pending.retryPromise === retryPromise) pending.retryPromise = null; },
        () => { if (pending.retryPromise === retryPromise) pending.retryPromise = null; },
      );
    }
    await awaitNativeCleanupRetry(retryPromise, timeoutMs);
  }

  if (pendingNativeSocketCleanups.get(addressKey) === pending) {
    pendingNativeSocketCleanups.delete(addressKey);
  }
}

function normalizeBluetoothAddress(address: string): string {
  return address.replace(/:/g, '').toUpperCase();
}

type RemovableSubscription = { remove: () => void };

export interface BluetoothTransportCallbacks {
  onConnected?: () => void;
  onDisconnected?: (reason: string) => void;
}

export class BluetoothClassicTransport implements ObdTransport {
  private device: BluetoothDevice | null = null;
  private connected = false;
  private received = '';
  private receiveOverflow = false;
  private dataSubscription?: RemovableSubscription;
  private disconnectSubscription?: RemovableSubscription;
  private diagnostics: string[] = [];
  private openPromise: Promise<void> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingNativeIoCleanup: Promise<void> | null = null;

  private registerPendingNativeSocketCleanup(
    device: BluetoothDevice,
    event = 'NATIVE_SOCKET_CLEANUP',
  ): PendingNativeSocketCleanup {
    const addressKey = normalizeBluetoothAddress(this.deviceAddress);
    const existing = pendingNativeSocketCleanups.get(addressKey);
    if (existing) {
      this.pendingNativeIoCleanup = existing.promise;
      return existing;
    }

    const record: PendingNativeSocketCleanup = {
      promise: this.safeDisconnect(device),
      retry: () => this.safeDisconnect(device),
      retryPromise: null,
    };
    pendingNativeSocketCleanups.set(addressKey, record);
    this.pendingNativeIoCleanup = record.promise;
    void record.promise.then(
      () => {
        if (pendingNativeSocketCleanups.get(addressKey) === record) {
          pendingNativeSocketCleanups.delete(addressKey);
        }
        if (this.pendingNativeIoCleanup === record.promise) this.pendingNativeIoCleanup = null;
      },
      (cleanupError) => {
        this.logDiagnostic(`${event}_FAILED`, {
          address: this.deviceAddress,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      },
    );
    return record;
  }

  private logDiagnostic(event: string, details?: unknown): void {
    const time = new Date().toISOString();
    let line = `[${time}] ${event}`;
    if (details !== undefined) {
      try { line += ` | ${JSON.stringify(details)}`; }
      catch { line += ` | ${String(details)}`; }
    }
    this.diagnostics.push(line);
    if (this.diagnostics.length > 500) this.diagnostics.shift();
  }

  getDiagnosticsText(): string { return this.diagnostics.join('\n'); }
  clearDiagnostics(): void { this.diagnostics = []; }

  private readonly config: Elm327CompatibilityConfig;

  constructor(
    private readonly deviceAddress: string,
    config?: Partial<Elm327CompatibilityConfig>,
    private readonly callbacks?: BluetoothTransportCallbacks,
  ) {
    this.config = mergeCompatibilityConfig(config ?? DEFAULT_ELM327_COMPATIBILITY);
  }

  async open(): Promise<void> {
    // Uma instância não pode iniciar duas conexões simultâneas para o mesmo ELM.
    // react-native-bluetooth-classic mantém a primeira tentativa pendente e rejeita
    // a segunda com "Já está tentando conectar ao dispositivo...".
    if (this.openPromise) {
      this.logDiagnostic('OPEN_REUSED_PENDING');
      return this.openPromise;
    }

    const pending = this.openInternal();
    this.openPromise = pending;
    try {
      await pending;
    } finally {
      if (this.openPromise === pending) this.openPromise = null;
    }
  }

  private async openInternal(): Promise<void> {
    this.clearDiagnostics();
    this.logDiagnostic('OPEN_START', { platform: Platform.OS, deviceAddress: this.deviceAddress });

    if (Platform.OS !== 'android') {
      throw new Error('BLUETOOTH CLASSIC DISPONÍVEL SOMENTE NO ANDROID');
    }

    const available = await runWithTimeout(
      () => RNBluetoothClassic.isBluetoothAvailable(),
      NATIVE_CONNECTION_CHECK_TIMEOUT_MS,
      'TIMEOUT: VERIFICAÇÃO DE DISPONIBILIDADE DO BLUETOOTH',
    );
    this.logDiagnostic('BLUETOOTH_AVAILABLE', available);
    if (!available) throw new Error('BLUETOOTH NÃO DISPONÍVEL NESTE APARELHO');

    const enabled = await runWithTimeout(
      () => RNBluetoothClassic.isBluetoothEnabled(),
      NATIVE_CONNECTION_CHECK_TIMEOUT_MS,
      'TIMEOUT: VERIFICAÇÃO DO ESTADO DO BLUETOOTH',
    );
    this.logDiagnostic('BLUETOOTH_ENABLED', enabled);
    if (!enabled) throw new Error('BLUETOOTH DESLIGADO');

    this.received = '';
    this.receiveOverflow = false;
    this.connected = false;
    this.removeSubscriptions();

    if (RNBluetoothClassic.cancelDiscovery) {
      try {
        await cancelBluetoothDiscovery();
      } catch (cause) {
        this.logDiagnostic('CANCEL_DISCOVERY_FAILED_OR_TIMED_OUT', {
          timeoutMs: NATIVE_DISCOVERY_TIMEOUT_MS,
          error: cause instanceof Error ? cause.message : String(cause),
        });
        // A chamada nativa não pode ser cancelada por este timeout. Não inicie
        // RFCOMM enquanto o cancelamento da descoberta ainda pode estar pendente.
        if (cause instanceof Error && cause.message.startsWith('TIMEOUT:')) {
          throw new Error('ESTADO DA DESCOBERTA BLUETOOTH INDETERMINADO; CONEXÃO RFCOMM CANCELADA');
        }
      }
    }

    let device: BluetoothDevice | null = null;
    let lastCause: unknown = null;

    // O ELM327 é um terminal serial ASCII: comandos terminam em CR e as
    // respostas podem chegar fragmentadas. A biblioteca suporta delimiter vazio,
    // entregando os dados recebidos sem tentar criar mensagens artificiais.
    // O enquadramento real da resposta é feito nesta classe pelo prompt '>'.
    // ELM327 Mini genérico: não presumimos fabricante, firmware ou tipo de
    // socket. A maioria usa SPP/RFCOMM. Começamos com RFCOMM inseguro, comum
    // em clones baratos, e fazemos fallback para socket seguro quando o
    // adaptador/pareamento exigir autenticação.
    const socketModes = [false, true];
    const connectionType = 'delimited';
    const delimiter = '';
    this.logDiagnostic('CONNECT_PROFILE', {
      adapterClass: 'ELM327_MINI_GENERICO',
      transport: 'BLUETOOTH_CLASSIC_RFCOMM_SPP',
      connectionType,
      framing: 'STREAM_UNDELIMITED',
      delimiter,
      socketModes: ['INSECURE', 'SECURE'],
    });

    let connectPromise: NativeConnectPromise | null = null;
    const addressKey = normalizeBluetoothAddress(this.deviceAddress);

    try {
      await waitForPendingNativeSocketCleanup(addressKey, this.config.bluetoothConnectTimeoutMs);
    } catch (cause) {
      this.logDiagnostic('CONNECT_ABORT_NATIVE_SOCKET_CLEANUP_PENDING', {
        address: this.deviceAddress,
        timeoutMs: this.config.bluetoothConnectTimeoutMs,
        error: cause instanceof Error ? cause.message : String(cause),
      });
      throw cause;
    }

    for (const secureSocket of socketModes) {
      let connectionRaceTimedOut = false;
      connectPromise = null;
      device = null;

      try {
        let abortSocketAttempt = false;
        while (true) {
          let radioEnabledBeforeSocket: boolean | null = null;
          let radioStateBeforeSocketError: unknown = null;
          try {
            radioEnabledBeforeSocket = await runWithTimeout(
              () => RNBluetoothClassic.isBluetoothEnabled(),
              NATIVE_CONNECTION_CHECK_TIMEOUT_MS,
              'TIMEOUT: ESTADO DO BLUETOOTH ANTES DO SOCKET',
            );
          } catch (radioCause) {
            radioStateBeforeSocketError = radioCause;
          }
          const beforeSocketDecision = decideBluetoothRadioRecovery(
            radioEnabledBeforeSocket,
            radioStateBeforeSocketError,
          );
          this.logDiagnostic('BLUETOOTH_ENABLED_BEFORE_SOCKET_ATTEMPT', {
            radioEnabled: radioEnabledBeforeSocket,
            decision: beforeSocketDecision,
            secureSocket,
          });
          if (beforeSocketDecision !== 'CONTINUE') {
            if (beforeSocketDecision === 'STOP_RADIO_OFF') {
              lastCause = new Error('BLUETOOTH DESLIGADO DURANTE A CONEXÃO; ATIVE O BLUETOOTH E TENTE NOVAMENTE');
              this.logDiagnostic('CONNECT_ABORT_BLUETOOTH_RADIO_OFF', { secureSocket });
            } else {
              const originalMessage = radioStateBeforeSocketError instanceof Error
                ? radioStateBeforeSocketError.message
                : String(radioStateBeforeSocketError ?? 'ESTADO INDETERMINADO');
              const radioStateError = new Error(
                'ESTADO DO BLUETOOTH NÃO PÔDE SER CONFIRMADO ANTES DO SOCKET RFCOMM. ' + originalMessage,
              );
              lastCause = radioStateError;
              this.logDiagnostic('CONNECT_ABORT_RADIO_STATE_UNKNOWN', {
                secureSocket,
                error: radioStateError.message,
              });
            }
            abortSocketAttempt = true;
            break;
          }

          // Check the shared lock only after the asynchronous radio probe.
          // After waiting, loop to re-check both radio state and the lock: multiple
          // waiters may otherwise resume together and open concurrent RFCOMM sockets.
          const pending = pendingNativeConnections.get(addressKey);
          if (!pending) break;

          this.logDiagnostic('CONNECT_WAITING_PREVIOUS_NATIVE_ATTEMPT', {
            address: this.deviceAddress,
            timeoutMs: this.config.bluetoothConnectTimeoutMs,
          });
          const pendingSettlement = pendingNativeConnectionSettlements.get(addressKey) ?? pending;
          const previousSettled = await waitForNativeConnectAttempt(
            pendingSettlement,
            this.config.bluetoothConnectTimeoutMs,
          );
          if (!previousSettled) {
            this.logDiagnostic('CONNECT_ABORT_PREVIOUS_NATIVE_ATTEMPT_PENDING', {
              address: this.deviceAddress,
              timeoutMs: this.config.bluetoothConnectTimeoutMs,
            });
            lastCause = new Error(
              'TENTATIVA NATIVA ANTERIOR AINDA PENDENTE APÓS O TIMEOUT. EVITE UMA SEGUNDA CONEXÃO SIMULTÂNEA; TENTE NOVAMENTE APÓS A LIBERAÇÃO DO ADAPTADOR.',
            );
            abortSocketAttempt = true;
            break;
          }
          try { await pendingSettlement; } catch { /* retry after failed native attempt */ }
          // Deliberately loop: do not trust a pending-map snapshot taken before await.
        }
        if (abortSocketAttempt) break;


        this.logDiagnostic('CONNECT_ATTEMPT', {
          secureSocket,
          connectionType,
          framing: 'STREAM_UNDELIMITED',
          delimiter,
        });

        connectPromise = RNBluetoothClassic.connectToDevice(this.deviceAddress, {
          connectionType,
          delimiter,
          charset: 'ascii',
          secureSocket,
        });
        pendingNativeConnections.set(addressKey, connectPromise);

        const currentPromise = connectPromise;
        const settlement = currentPromise.then(async (lateDevice) => {
          if (!connectionRaceTimedOut || !lateDevice) return;
          this.logDiagnostic('LATE_CONNECT_SUCCESS_AFTER_TIMEOUT', { secureSocket });
          await this.safeDisconnect(lateDevice);
          this.logDiagnostic('LATE_CONNECT_DISCONNECTED', { secureSocket });
        }).catch(() => {
          // A tentativa nativa atrasada também pode terminar com erro.
        }).then(() => {
          if (pendingNativeConnections.get(addressKey) === currentPromise) {
            pendingNativeConnections.delete(addressKey);
          }
          if (pendingNativeConnectionSettlements.get(addressKey) === settlement) {
            pendingNativeConnectionSettlements.delete(addressKey);
          }
        });
        pendingNativeConnectionSettlements.set(addressKey, settlement);

        device = await Promise.race([
          connectPromise,
          new Promise<never>((_, reject) => { this.connectTimer = setTimeout(
            () => { connectionRaceTimedOut = true; reject(new Error('TIMEOUT CONEXÃO BLUETOOTH')); },
            this.config.bluetoothConnectTimeoutMs,
          ); }),
        ]);

        if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
        this.logDiagnostic('CONNECT_SUCCESS', {
          secureSocket,
          connectionType,
          framing: 'STREAM_UNDELIMITED',
        });
        break;
      } catch (cause) {
        if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
        this.logDiagnostic('CONNECT_FAILURE', {
          secureSocket,
          connectionType,
          framing: 'STREAM_UNDELIMITED',
          error: cause instanceof Error ? cause.message : String(cause),
        });
        lastCause = cause;
        if (timedOutNativeAttemptStillPending(
          connectionRaceTimedOut,
          connectPromise,
          pendingNativeConnections.get(addressKey),
        )) {
          this.logDiagnostic('CONNECT_ABORT_NATIVE_ATTEMPT_STILL_PENDING', {
            secureSocket,
            timeoutMs: this.config.bluetoothConnectTimeoutMs,
          });
          // The JS timeout cannot cancel the native request. Do not wait forever
          // or race a second RFCOMM socket against the same adapter.
          break;
        }

        let radioEnabledAfterFailure: boolean | null = null;
        let radioStateAfterFailureError: unknown = null;
        try {
          radioEnabledAfterFailure = await runWithTimeout(
            () => RNBluetoothClassic.isBluetoothEnabled(),
            NATIVE_CONNECTION_CHECK_TIMEOUT_MS,
            'TIMEOUT: ESTADO DO BLUETOOTH APÓS FALHA RFCOMM',
          );
        } catch (radioCause) {
          radioStateAfterFailureError = radioCause;
        }
        const afterFailureDecision = decideBluetoothRadioRecovery(
          radioEnabledAfterFailure,
          radioStateAfterFailureError ?? cause,
        );
        this.logDiagnostic('CONNECT_RADIO_STATE_AFTER_FAILURE', {
          radioEnabled: radioEnabledAfterFailure,
          decision: afterFailureDecision,
          secureSocket,
          ...(radioStateAfterFailureError instanceof Error ? { stateError: radioStateAfterFailureError.message } : {}),
        });
        if (afterFailureDecision !== 'CONTINUE') {
          if (afterFailureDecision === 'STOP_RADIO_OFF') {
            lastCause = new Error('BLUETOOTH DESLIGADO DURANTE A TENTATIVA RFCOMM. ATIVE O BLUETOOTH E TENTE NOVAMENTE.');
            this.logDiagnostic('CONNECT_ABORT_BLUETOOTH_RADIO_OFF', { secureSocket });
          } else {
            const originalError = cause instanceof Error ? cause.message : String(cause);
            lastCause = new Error(
              'ESTADO DO BLUETOOTH NÃO PÔDE SER CONFIRMADO APÓS FALHA RFCOMM; RETENTATIVA CANCELADA. ' + originalError,
            );
            const radioStateError = lastCause as Error;
            this.logDiagnostic('CONNECT_ABORT_RADIO_STATE_UNKNOWN', {
              secureSocket,
              error: radioStateError.message,
            });
          }
          break;
        }

        if (device) await this.safeDisconnect(device);
        device = null;
      }
    }

    if (!device) {
      const message = lastCause instanceof Error
        ? lastCause.message
        : String(lastCause ?? 'ERRO DESCONHECIDO');
      throw new Error('FALHA AO CONECTAR AO ELM327: ' + message);
    }

    this.device = device;

    await new Promise((resolve) => setTimeout(resolve, 250));

    if (typeof device.isConnected === 'function') {
      let confirmed: boolean;
      try {
        confirmed = await runWithTimeout(
          () => device!.isConnected!(),
          NATIVE_CONNECTION_CHECK_TIMEOUT_MS,
          `TIMEOUT: VERIFICAÇÃO DO SOCKET BLUETOOTH APÓS ${NATIVE_CONNECTION_CHECK_TIMEOUT_MS} MS`,
        );
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        this.logDiagnostic('INITIAL_DEVICE_CONNECTED_CHECK_FAILED', {
          timeoutMs: NATIVE_CONNECTION_CHECK_TIMEOUT_MS,
          error: message,
          cleanupRequired: true,
        });
        this.registerPendingNativeSocketCleanup(device, 'INITIAL_CONNECTION_CHECK_CLEANUP');
        this.device = null;
        this.connected = false;
        this.received = '';
        this.receiveOverflow = false;
        throw new Error('ESTADO INICIAL DO SOCKET BLUETOOTH INDETERMINADO; LIMPEZA NATIVA REGISTRADA: ' + message);
      }
      this.logDiagnostic('DEVICE_CONNECTED_CHECK', confirmed);
      if (!confirmed) {
        const cleanup = this.registerPendingNativeSocketCleanup(device, 'INITIAL_CONNECTION_REJECTED_CLEANUP');
        this.device = null;
        this.connected = false;
        this.received = '';
        this.receiveOverflow = false;
        const settled = await waitForNativeConnectAttempt(cleanup.promise, this.config.bluetoothConnectTimeoutMs);
        if (!settled) {
          throw new Error('ELM327 NÃO CONFIRMOU A CONEXÃO BLUETOOTH; LIMPEZA NATIVA PENDENTE E NOVO SOCKET BLOQUEADO');
        }
        await cleanup.promise;
        throw new Error('ELM327 NÃO CONFIRMOU A CONEXÃO BLUETOOTH');
      }
    }

    this.connected = true;

    this.dataSubscription = device.onDataReceived((event) => {
      if (event?.data) {
        const chunk = String(event.data);
        const preview = chunk.slice(0, RX_DIAGNOSTIC_PREVIEW_CHARS);
        this.logDiagnostic('RX_CHUNK', {
          length: chunk.length,
          data: preview,
          ...(chunk.length > RX_DIAGNOSTIC_PREVIEW_CHARS ? { truncated: true } : {}),
          hex: Array.from(preview).map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join(' '),
        });

        // After overflow, discard all payload until the framing prompt arrives.
        // Never let a damaged response look like a valid, complete OBD reply.
        if (this.receiveOverflow) {
          if (chunk.includes('>')) this.received = '>';
          return;
        }

        const combined = this.received + chunk;
        const promptIndex = combined.indexOf('>');
        if (promptIndex >= 0) {
          if (promptIndex > MAX_ELM_RX_BUFFER_CHARS) {
            this.receiveOverflow = true;
            this.received = '>';
            this.logDiagnostic('RX_BUFFER_OVERFLOW', {
              maxChars: MAX_ELM_RX_BUFFER_CHARS,
              bufferedChars: promptIndex,
              promptSeen: true,
            });
          } else {
            // Keep only the first response up to its prompt; trailing bytes
            // belong to the consumed response and are intentionally discarded.
            this.received = combined.slice(0, promptIndex + 1);
          }
          return;
        }

        if (combined.length > MAX_ELM_RX_BUFFER_CHARS) {
          this.receiveOverflow = true;
          this.received = '';
          this.logDiagnostic('RX_BUFFER_OVERFLOW', {
            maxChars: MAX_ELM_RX_BUFFER_CHARS,
            bufferedChars: combined.length,
            promptSeen: false,
          });
          return;
        }
        this.received = combined;
      }
    });

    if (RNBluetoothClassic.onDeviceDisconnected) {
      this.disconnectSubscription = RNBluetoothClassic.onDeviceDisconnected((event) => {
        const eventAddress = event?.address ?? event?.device?.address;
        if (eventAddress && eventAddress !== this.deviceAddress) return;
        this.logDiagnostic('DEVICE_DISCONNECTED', eventAddress ?? {});
        this.markDisconnected();
      });
    }

    this.callbacks?.onConnected?.();
  }

  async close(): Promise<void> {
    if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
    const device = this.device;
    const wasConnected = this.connected;
    const pendingIoCleanup = this.pendingNativeIoCleanup;
    const addressKey = normalizeBluetoothAddress(this.deviceAddress);
    this.removeSubscriptions();

    if (pendingNativeSocketCleanups.has(addressKey)) {
      // The global guard owns the cleanup; don't issue a parallel disconnect.
      await waitForPendingNativeSocketCleanup(addressKey, this.config.bluetoothConnectTimeoutMs);
    } else if (device && wasConnected) {
      // Register before waiting; if Android never settles disconnect(), return
      // after a bounded wait but keep the shared guard so no replacement socket opens.
      const cleanup = this.registerPendingNativeSocketCleanup(device);
      const settled = await waitForNativeConnectAttempt(cleanup.promise, this.config.bluetoothConnectTimeoutMs);
      if (!settled) {
        this.logDiagnostic('NATIVE_SOCKET_CLEANUP_TIMEOUT', {
          address: this.deviceAddress,
          timeoutMs: this.config.bluetoothConnectTimeoutMs,
          replacementSocketBlocked: true,
        });
        throw new Error('LIMPEZA NATIVA DO SOCKET EXCEDEU O TIMEOUT; NOVA CONEXÃO RFCOMM CONTINUA BLOQUEADA');
      }
      await cleanup.promise;
    } else if (pendingIoCleanup) {
      await waitForPendingNativeSocketCleanup(addressKey, this.config.bluetoothConnectTimeoutMs);
    }

    this.device = null;
    this.connected = false;
    this.received = '';
    this.receiveOverflow = false;
  }

  private async assertDeviceConnected(device: BluetoothDevice, timeoutMs: number): Promise<void> {
    if (typeof device.isConnected !== 'function') return;

    let confirmed: boolean;
    try {
      confirmed = await runWithTimeout(
        () => device.isConnected!(),
        timeoutMs,
        `TIMEOUT: VERIFICAÇÃO DO SOCKET BLUETOOTH APÓS ${timeoutMs} MS`,
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.logDiagnostic('DEVICE_CONNECTED_CHECK_FAILED', {
        timeoutMs,
        error: message,
        failClosed: true,
        cleanupRequired: true,
      });
      // isConnected() timed out/rejected: this does not prove that RFCOMM is
      // closed. Register shared cleanup before clearing local state so a
      // reconnect cannot race the unresolved native probe or socket.
      this.registerPendingNativeSocketCleanup(device, 'DEVICE_CONNECTED_CHECK_CLEANUP');
      this.markDisconnected();
      throw new Error('ESTADO DO SOCKET BLUETOOTH INDETERMINADO; LIMPEZA NATIVA REGISTRADA: ' + message);
    }

    this.logDiagnostic('DEVICE_CONNECTED_CHECK', confirmed);
    if (!confirmed) {
      this.markDisconnected();
      throw new Error('BLUETOOTH DESCONECTADO');
    }
  }

  async write(data: string): Promise<void> {
    const device = this.device;
    if (!device || !this.connected) throw new Error('BLUETOOTH NÃO CONECTADO');

    // Do not transmit if native connection state is false, hangs, or cannot be confirmed.
    await this.assertDeviceConnected(device, NATIVE_CONNECTION_CHECK_TIMEOUT_MS);

    this.logDiagnostic('TX', { data });
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const nativeWrite = Promise.resolve().then(() => device.write(data, 'ascii'));
    try {
      await Promise.race([
        nativeWrite,
        new Promise<void>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`TIMEOUT: ESCRITA BLUETOOTH SEM CONCLUSÃO APÓS ${this.config.ioTimeoutMs} MS`)),
            this.config.ioTimeoutMs,
          );
        }),
      ]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message.startsWith('TIMEOUT: ESCRITA BLUETOOTH')) {
        this.logDiagnostic('WRITE_TIMEOUT', { timeoutMs: this.config.ioTimeoutMs, address: this.deviceAddress });
        // Closing the socket is the only available cancellation path at this
        // layer. Keep the cleanup promise and prevent a replacement socket from
        // opening until the native operation has been torn down.
        this.registerPendingNativeSocketCleanup(device, 'WRITE_TIMEOUT_CLEANUP');
        this.markDisconnected();
      }
      throw cause;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async readUntilPrompt(timeoutMs = 6000): Promise<string> {
    const device = this.device;
    if (!device || !this.connected) throw new Error('BLUETOOTH NÃO CONECTADO');

    const started = Date.now();
    let nextConnectionCheck = started;

    while (Date.now() - started < timeoutMs) {
      if (!this.connected || !this.device) throw new Error('BLUETOOTH DESCONECTADO');

      if (Date.now() >= nextConnectionCheck && typeof device.isConnected === 'function') {
        const remainingMs = timeoutMs - (Date.now() - started);
        if (remainingMs <= 0) break;
        // The state probe uses only the remaining read budget, so it cannot
        // silently extend the caller's response timeout by waiting forever.
        await this.assertDeviceConnected(
          device,
          Math.min(NATIVE_CONNECTION_CHECK_TIMEOUT_MS, remainingMs),
        );
        nextConnectionCheck = Date.now() + 250;
      }

      const promptIndex = this.received.indexOf('>');
      if (promptIndex >= 0) {
        if (this.receiveOverflow) {
          this.received = '';
          this.receiveOverflow = false;
          this.logDiagnostic('RX_BUFFER_OVERFLOW_CONSUMED', { maxChars: MAX_ELM_RX_BUFFER_CHARS });
          throw new Error('BUFFER RX ELM EXCEDIDO; RESPOSTA DESCARTADA');
        }
        const response = this.received.slice(0, promptIndex);
        const trailing = this.received.slice(promptIndex + 1);
        // O ELM327 Mini genérico pode repetir a mesma resposta e prompt no mesmo
        // pacote (ex.: "UNABLE TO CONNECT\\r>UNABLE TO CONNECT\\r>"). Como não
        // enviamos outro comando antes de consumir o prompt, qualquer conteúdo
        // após o primeiro prompt pertence à resposta anterior e não pode vazar
        // para o próximo comando.
        this.received = '';
        const clean = response.replace(/^\s+|\s+$/g, '');
        const stale = trailing.replace(/^\s+|\s+$/g, '');
        this.logDiagnostic('RESPONSE_COMPLETE', {
          response: clean,
          ...(stale ? { trailingDiscarded: stale } : {}),
        });
        return clean;
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    const partial = this.received.replace(/^\s+|\s+$/g, '');
    const bufferedLength = this.received.length;
    const receiveOverflow = this.receiveOverflow;
    this.received = '';
    this.receiveOverflow = false;
    this.logDiagnostic('READ_TIMEOUT', {
      partial,
      bufferedLength,
      promptExpected: true,
      receiveOverflow,
    });
    if (receiveOverflow) throw new Error('BUFFER RX ELM EXCEDIDO SEM PROMPT FINAL');
    throw new Error(partial ? 'TIMEOUT: RESPOSTA ELM SEM PROMPT FINAL' : 'TIMEOUT');
  }

  private async safeDisconnect(device: BluetoothDevice): Promise<void> {
    const addressKey = normalizeBluetoothAddress(this.deviceAddress);
    let nativeDisconnect = pendingNativeDisconnectOperations.get(addressKey);
    if (!nativeDisconnect) {
      nativeDisconnect = Promise.resolve().then(() => device.disconnect());
      pendingNativeDisconnectOperations.set(addressKey, nativeDisconnect);
      const clearIfSettled = () => {
        if (pendingNativeDisconnectOperations.get(addressKey) === nativeDisconnect) {
          pendingNativeDisconnectOperations.delete(addressKey);
        }
      };
      // Keep the raw native promise tracked after the JavaScript timeout. A
      // retry must reuse it while pending, never invoke disconnect() in parallel.
      void nativeDisconnect.then(clearIfSettled, clearIfSettled);
    }

    try {
      await runWithTimeout(
        () => nativeDisconnect!,
        this.config.bluetoothConnectTimeoutMs,
        `TIMEOUT: DESCONEXÃO BLUETOOTH APÓS ${this.config.bluetoothConnectTimeoutMs} MS`,
      );
    } catch (cause) {
      const errorMessage = cause instanceof Error ? cause.message : String(cause);
      // A JS timeout does not cancel device.disconnect(). Do not consider the
      // resource released merely because a later probe says "disconnected":
      // the original native operation may still be pending. Keep the shared
      // socket-cleanup guard until a retry settles successfully.
      if (/^TIMEOUT: DESCONEXÃO BLUETOOTH/.test(errorMessage)) {
        this.logDiagnostic('BLUETOOTH_DISCONNECT_TIMEOUT', {
          address: this.deviceAddress,
          timeoutMs: this.config.bluetoothConnectTimeoutMs,
          replacementSocketBlocked: true,
        });
        throw cause instanceof Error ? cause : new Error(errorMessage);
      }

      // An ordinary disconnect error may mean that the socket was already
      // closed. Confirm that with its own finite native-state timeout.
      try {
        if (typeof device.isConnected === 'function') {
          const connected = await runWithTimeout(
            () => device.isConnected!(),
            NATIVE_CONNECTION_CHECK_TIMEOUT_MS,
            `TIMEOUT: VERIFICAÇÃO APÓS FALHA DE DESCONEXÃO APÓS ${NATIVE_CONNECTION_CHECK_TIMEOUT_MS} MS`,
          );
          if (!connected) return;
        }
      } catch {
        // Unknown state is not evidence that the socket was released.
      }
      this.logDiagnostic('BLUETOOTH_DISCONNECT_FAILED', {
        address: this.deviceAddress,
        error: errorMessage,
        replacementSocketBlocked: true,
      });
      throw cause instanceof Error ? cause : new Error(errorMessage);
    }
  }

  private markDisconnected(): void {
    if (!this.connected && !this.device) return;
    this.logDiagnostic('BLUETOOTH_LINK_LOST', { address: this.deviceAddress });
    this.removeSubscriptions();
    this.device = null;
    this.connected = false;
    this.received = '';
    this.receiveOverflow = false;
    this.callbacks?.onDisconnected?.('BLUETOOTH DESCONECTADO');
  }

  private removeSubscriptions(): void {
    this.dataSubscription?.remove();
    this.dataSubscription = undefined;
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = undefined;
  }
}

export async function listBondedBluetoothDevices(): Promise<BluetoothDeviceInfo[]> {
  if (Platform.OS !== 'android') {
    throw new Error('BLUETOOTH CLASSIC DISPONÍVEL SOMENTE NO ANDROID');
  }

  const devices = await runWithTimeout(
    () => RNBluetoothClassic.getBondedDevices(),
    NATIVE_DISCOVERY_TIMEOUT_MS,
    `TIMEOUT: LISTAGEM DE DISPOSITIVOS PAREADOS APÓS ${NATIVE_DISCOVERY_TIMEOUT_MS} MS`,
  );

  return devices.map((device) => ({
    address: device.address,
    name: device.name || 'DISPOSITIVO SEM NOME',
    bonded: device.bonded ?? true,
  }));
}
