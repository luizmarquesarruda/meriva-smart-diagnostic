import RNBluetoothClassic, { BluetoothDevice } from 'react-native-bluetooth-classic';
import { Platform } from 'react-native';
import { ObdTransport } from './elm327';
import { DEFAULT_ELM327_COMPATIBILITY, Elm327CompatibilityConfig, mergeCompatibilityConfig } from './elm327Compatibility';

export interface BluetoothDeviceInfo {
  address: string;
  name: string;
  bonded?: boolean;
}

type RemovableSubscription = { remove: () => void };

export class BluetoothClassicTransport implements ObdTransport {
  private device: BluetoothDevice | null = null;
  private connected = false;
  private received = '';
  private dataSubscription?: RemovableSubscription;
  private disconnectSubscription?: RemovableSubscription;
  private diagnostics: string[] = [];
  private openPromise: Promise<void> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

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

    // ELM327 genérico 1.5: uma única tentativa por chamada.
    // Não fazemos fallback imediato para secureSocket=true. Isso criava duas
    // tentativas concorrentes enquanto a primeira ainda estava pendente.
    const secureSocket = false;
    this.logDiagnostic('CONNECT_ATTEMPT', {
      secureSocket,
      connectionType: 'delimited',
      delimiter: '\\r',
    });

    try {
      const connectPromise = RNBluetoothClassic.connectToDevice(this.deviceAddress, {
        connectionType: 'delimited',
        delimiter: '\\r',
        charset: 'ascii',
        secureSocket,
      });
      device = await Promise.race([
        connectPromise,
        new Promise<never>((_, reject) => { this.connectTimer = setTimeout(
          () => reject(new Error('TIMEOUT CONEXÃO BLUETOOTH')),
          this.config.bluetoothConnectTimeoutMs,
        ); }),
      ]);

      this.logDiagnostic('CONNECT_SUCCESS', {
        secureSocket,
        connectionType: 'delimited',
      });
    } catch (cause) {
      if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
      if (!device) {
        try {
          const lateDevice = await Promise.race([connectPromise, new Promise<null>((resolve) => setTimeout(() => resolve(null), 300))]);
          if (lateDevice) await this.safeDisconnect(lateDevice);
        } catch { /* conexão atrasada já falhou */ }
      }
      this.logDiagnostic('CONNECT_FAILURE', {
        secureSocket,
        connectionType: 'delimited',
        error: cause instanceof Error ? cause.message : String(cause),
      });
      lastCause = cause;
      if (device) await this.safeDisconnect(device);
      device = null;
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
        this.logDiagnostic('RX', { length: chunk.length, data: chunk });
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
  }

  async close(): Promise<void> {
    if (this.connectTimer) { clearTimeout(this.connectTimer); this.connectTimer = null; }
    const device = this.device;
    const wasConnected = this.connected;
    this.removeSubscriptions();

    if (device && wasConnected) await this.safeDisconnect(device);

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
    await device.write(data, 'ascii');
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
        this.received = this.received.slice(promptIndex + 1);
        const clean = response.replace(/^\s+|\s+$/g, '');
        this.logDiagnostic('RESPONSE_COMPLETE', { response: clean });
        return clean;
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    const partial = this.received.replace(/^\s+|\s+$/g, '');
    this.received = '';
    this.logDiagnostic('READ_TIMEOUT', { partial });
    throw new Error(partial ? 'TIMEOUT: RESPOSTA ELM SEM PROMPT FINAL' : 'TIMEOUT');
  }

  private async safeDisconnect(device: BluetoothDevice): Promise<void> {
    try { await device.disconnect(); }
    catch { /* já desconectado */ }
  }

  private markDisconnected(): void {
    this.removeSubscriptions();
    this.device = null;
    this.connected = false;
    this.received = '';
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
