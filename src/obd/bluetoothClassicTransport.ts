import RNBluetoothClassic, { BluetoothDevice } from 'react-native-bluetooth-classic';
import { Platform } from 'react-native';
import { ObdTransport } from './elm327';
import { DEFAULT_ELM327_COMPATIBILITY, Elm327CompatibilityConfig, mergeCompatibilityConfig } from './elm327Compatibility';
import { timedOutNativeAttemptStillPending, waitForNativeConnectAttempt } from './connectionRecovery';

export interface BluetoothDeviceInfo {
  address: string;
  name: string;
  bonded?: boolean;
}

type NativeConnectPromise = Promise<BluetoothDevice>;
const pendingNativeConnections = new Map<string, NativeConnectPromise>();
const pendingNativeConnectionSettlements = new Map<string, Promise<void>>();

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
  private dataSubscription?: RemovableSubscription;
  private disconnectSubscription?: RemovableSubscription;
  private diagnostics: string[] = [];
  private openPromise: Promise<void> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingNativeIoCleanup: Promise<void> | null = null;

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

    const available = await RNBluetoothClassic.isBluetoothAvailable();
    this.logDiagnostic('BLUETOOTH_AVAILABLE', available);
    if (!available) throw new Error('BLUETOOTH NÃO DISPONÍVEL NESTE APARELHO');

    const enabled = await RNBluetoothClassic.isBluetoothEnabled();
    this.logDiagnostic('BLUETOOTH_ENABLED', enabled);
    if (!enabled) throw new Error('BLUETOOTH DESLIGADO');

    this.received = '';
    this.connected = false;
    this.removeSubscriptions();

    if (RNBluetoothClassic.cancelDiscovery) {
      try { await RNBluetoothClassic.cancelDiscovery(); }
      catch { /* sem descoberta ativa */ }
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

    for (const secureSocket of socketModes) {
      let connectionRaceTimedOut = false;
      connectPromise = null;
      device = null;

      try {
        // O timeout JS não cancela a tentativa RFCOMM nativa. O bloqueio é
        // GLOBAL por endereço para impedir chamadas concorrentes ao mesmo MAC.
        const pending = pendingNativeConnections.get(addressKey);
        if (pending) {
          this.logDiagnostic('CONNECT_WAITING_PREVIOUS_NATIVE_ATTEMPT', {
            address: this.deviceAddress,
            timeoutMs: this.config.bluetoothConnectTimeoutMs,
          });
          // Wait for the native call AND any late-success cleanup to finish before
          // opening another RFCOMM socket for the same adapter.
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
            break;
          }
          try { await pendingSettlement; } catch { /* retry after failed native attempt */ }
        }

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
      const confirmed = await device.isConnected();
      this.logDiagnostic('DEVICE_CONNECTED_CHECK', confirmed);
      if (!confirmed) {
        await this.safeDisconnect(device);
        this.markDisconnected();
        throw new Error('ELM327 NÃO CONFIRMOU A CONEXÃO BLUETOOTH');
      }
    }

    this.connected = true;

    this.dataSubscription = device.onDataReceived((event) => {
      if (event?.data) {
        const chunk = String(event.data);
        this.logDiagnostic('RX_CHUNK', {
          length: chunk.length,
          data: chunk,
          hex: Array.from(chunk).map((char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join(' '),
        });
        this.received += chunk;
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
    this.removeSubscriptions();

    if (device && wasConnected) await this.safeDisconnect(device);
    // A timed-out native write may still be unwinding. Do not report the
    // transport closed (and allow reconnection) before its socket cleanup settles.
    if (pendingIoCleanup) await pendingIoCleanup;

    this.device = null;
    this.connected = false;
    this.received = '';
  }

  async write(data: string): Promise<void> {
    const device = this.device;
    if (!device || !this.connected) throw new Error('BLUETOOTH NÃO CONECTADO');

    if (typeof device.isConnected === 'function') {
      try {
        if (!(await device.isConnected())) {
          this.markDisconnected();
          throw new Error('BLUETOOTH DESCONECTADO');
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : '';
        if (message === 'BLUETOOTH DESCONECTADO') throw cause;
      }
    }

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
        const cleanup = this.safeDisconnect(device);
        this.pendingNativeIoCleanup = cleanup;
        void cleanup.then(
          () => {
            if (this.pendingNativeIoCleanup === cleanup) this.pendingNativeIoCleanup = null;
          },
          (cleanupError) => {
            this.logDiagnostic('WRITE_TIMEOUT_CLEANUP_FAILED', {
              address: this.deviceAddress,
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            });
          },
        );
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
        nextConnectionCheck = Date.now() + 250;
        try {
          if (!(await device.isConnected())) {
            this.markDisconnected();
            throw new Error('BLUETOOTH DESCONECTADO');
          }
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : '';
          if (message === 'BLUETOOTH DESCONECTADO') throw cause;
        }
      }

      const promptIndex = this.received.indexOf('>');
      if (promptIndex >= 0) {
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
    this.received = '';
    this.logDiagnostic('READ_TIMEOUT', {
      partial,
      bufferedLength,
      promptExpected: true,
    });
    throw new Error(partial ? 'TIMEOUT: RESPOSTA ELM SEM PROMPT FINAL' : 'TIMEOUT');
  }

  private async safeDisconnect(device: BluetoothDevice): Promise<void> {
    try {
      await device.disconnect();
    } catch (cause) {
      // Do not treat an arbitrary native disconnect error as success. Confirm
      // the socket is already down; otherwise propagate the failure so the
      // shared connection owner will not open a replacement RFCOMM socket.
      try {
        if (typeof device.isConnected === 'function' && !(await device.isConnected())) return;
      } catch {
        // Unknown native state is not proof that the socket was released.
      }
      this.logDiagnostic('BLUETOOTH_DISCONNECT_FAILED', {
        address: this.deviceAddress,
        error: cause instanceof Error ? cause.message : String(cause),
      });
      throw cause instanceof Error ? cause : new Error(String(cause));
    }
  }

  private markDisconnected(): void {
    if (!this.connected && !this.device) return;
    this.logDiagnostic('BLUETOOTH_LINK_LOST', { address: this.deviceAddress });
    this.removeSubscriptions();
    this.device = null;
    this.connected = false;
    this.received = '';
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

  const devices = await RNBluetoothClassic.getBondedDevices();

  return devices.map((device) => ({
    address: device.address,
    name: device.name || 'DISPOSITIVO SEM NOME',
    bonded: device.bonded ?? true,
  }));
}
