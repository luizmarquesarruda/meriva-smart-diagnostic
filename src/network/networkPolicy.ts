import * as Network from 'expo-network';

export type NetworkMode = 'WIFI_ONLY' | 'WIFI_AND_MOBILE' | 'OFFLINE';

export interface NetworkAvailability {
  type?: Network.NetworkStateType | string | null;
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}

export function isOptionalNetworkAllowed(
  mode: NetworkMode,
  state: NetworkAvailability | null | undefined,
): boolean {
  if (mode === 'OFFLINE' || !state || state.isConnected !== true) return false;
  if (state.isInternetReachable === false) return false;

  const type = state.type;
  if (mode === 'WIFI_ONLY') return type === Network.NetworkStateType.WIFI || type === 'WIFI';
  if (mode === 'WIFI_AND_MOBILE') {
    return type === Network.NetworkStateType.WIFI ||
      type === Network.NetworkStateType.CELLULAR ||
      type === 'WIFI' ||
      type === 'CELLULAR';
  }
  return false;
}

export function describeNetworkState(state: NetworkAvailability | null | undefined): string {
  if (!state || state.isConnected !== true) return 'SEM REDE';
  if (state.isInternetReachable === false) return 'REDE SEM INTERNET';

  const type = state.type;
  if (type === Network.NetworkStateType.WIFI || type === 'WIFI') return 'WI-FI';
  if (type === Network.NetworkStateType.CELLULAR || type === 'CELLULAR') return 'DADOS MÓVEIS';
  if (type === Network.NetworkStateType.ETHERNET || type === 'ETHERNET') return 'ETHERNET';
  if (state.isInternetReachable === true) return 'INTERNET DISPONÍVEL';
  return 'REDE DETECTADA; INTERNET NÃO CONFIRMADA';
}
