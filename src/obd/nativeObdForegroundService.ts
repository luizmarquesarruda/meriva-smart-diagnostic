import { NativeModules, Platform } from 'react-native';

interface ObdForegroundServiceNativeModule {
  start(adapterName: string): Promise<boolean>;
  stop(): Promise<boolean>;
  isRunning(): Promise<boolean>;
}

export interface ObdForegroundServiceRequestResult {
  requested: boolean;
  reason?: 'NOT_ANDROID' | 'NATIVE_MODULE_MISSING' | 'START_FAILED';
}

const nativeService = NativeModules.ObdForegroundService as ObdForegroundServiceNativeModule | undefined;
let hasWarnedMissingModule = false;

/**
 * Ask the generated Android service to hold a user-visible foreground
 * notification while the existing JS/React Native session owns the single
 * ELM327 Bluetooth socket and serial command queue.
 *
 * This is a lifecycle service, not a second OBD transport or native polling
 * engine. We report only whether the start request was accepted by Android.
 */
export async function startNativeObdForegroundService(
  adapterName: string,
): Promise<ObdForegroundServiceRequestResult> {
  if (Platform.OS !== 'android') return { requested: false, reason: 'NOT_ANDROID' };

  if (!nativeService || typeof nativeService.start !== 'function') {
    if (!hasWarnedMissingModule) {
      hasWarnedMissingModule = true;
      console.warn('[obd-foreground] módulo nativo indisponível; use um APK gerado via prebuild/build, não Expo Go.');
    }
    return { requested: false, reason: 'NATIVE_MODULE_MISSING' };
  }

  try {
    const requested = await nativeService.start(adapterName || 'ELM327');
    return { requested: requested === true };
  } catch (cause) {
    console.warn(
      '[obd-foreground] Android recusou a solicitação de serviço em primeiro plano:',
      cause instanceof Error ? cause.message : String(cause),
    );
    return { requested: false, reason: 'START_FAILED' };
  }
}

export async function stopNativeObdForegroundService(): Promise<boolean> {
  if (Platform.OS !== 'android' || !nativeService || typeof nativeService.stop !== 'function') return false;
  try {
    await nativeService.stop();
    return true;
  } catch (cause) {
    console.warn(
      '[obd-foreground] falha ao solicitar encerramento do serviço:',
      cause instanceof Error ? cause.message : String(cause),
    );
    return false;
  }
}

export async function isNativeObdForegroundServiceRunning(): Promise<boolean> {
  if (Platform.OS !== 'android' || !nativeService || typeof nativeService.isRunning !== 'function') return false;
  try {
    return (await nativeService.isRunning()) === true;
  } catch {
    return false;
  }
}
