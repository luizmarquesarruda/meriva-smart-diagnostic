export interface NetworkSnapshot {
  type: string;
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  cellularGeneration: string | null;
  isConnectionExpensive: boolean | null;
  strength: number | null;
}

export interface NetworkPresentation {
  title: string;
  shortLabel: string;
  transportLabel: string;
  generationLabel: string;
  internetLabel: string;
  meteredLabel: string;
  signalLabel: string;
  detail: string;
  icon: 'wifi' | 'connectivity' | 'offline' | 'network';
  tone: 'success' | 'warning' | 'danger' | 'muted';
}

export const INITIAL_NETWORK_SNAPSHOT: NetworkSnapshot = {
  type: 'unknown',
  isConnected: null,
  isInternetReachable: null,
  cellularGeneration: null,
  isConnectionExpensive: null,
  strength: null,
};

export function normalizeNetworkSnapshot(state: unknown): NetworkSnapshot {
  const candidate = state && typeof state === 'object'
    ? state as Record<string, unknown>
    : {};
  const details = candidate.details && typeof candidate.details === 'object'
    ? candidate.details as Record<string, unknown>
    : {};
  const type = typeof candidate.type === 'string' ? candidate.type.toLowerCase() : 'unknown';
  const isConnected = typeof candidate.isConnected === 'boolean' ? candidate.isConnected : null;
  const isInternetReachable = typeof candidate.isInternetReachable === 'boolean'
    ? candidate.isInternetReachable
    : null;
  const cellularGeneration = typeof details.cellularGeneration === 'string'
    ? details.cellularGeneration.toLowerCase()
    : null;
  const isConnectionExpensive = typeof details.isConnectionExpensive === 'boolean'
    ? details.isConnectionExpensive
    : null;
  const strength = typeof details.strength === 'number'
    && Number.isFinite(details.strength)
    && details.strength >= 0
    && details.strength <= 100
    ? details.strength
    : null;

  return { type, isConnected, isInternetReachable, cellularGeneration, isConnectionExpensive, strength };
}

export function getNetworkPresentation(snapshot: NetworkSnapshot): NetworkPresentation {
  const disconnected = snapshot.type === 'none' || snapshot.isConnected === false;
  const generation = ['2g', '3g', '4g', '5g'].includes(snapshot.cellularGeneration ?? '')
    ? snapshot.cellularGeneration!.toUpperCase()
    : null;
  const transportLabel = snapshot.type === 'wifi'
    ? 'Wi-Fi'
    : snapshot.type === 'cellular'
      ? 'Dados móveis'
      : snapshot.type === 'ethernet'
        ? 'Ethernet'
        : snapshot.type === 'vpn'
          ? 'VPN'
          : disconnected
            ? 'Sem conexão'
            : 'Rede não identificada';
  const generationLabel = snapshot.type === 'cellular'
    ? (generation ?? 'Geração não informada')
    : 'Fora da rede móvel';
  const internetLabel = disconnected
    ? 'SEM CONEXÃO'
    : snapshot.isInternetReachable === true
      ? 'INTERNET DISPONÍVEL'
      : snapshot.isInternetReachable === false
        ? 'SEM INTERNET'
        : 'INTERNET NÃO CONFIRMADA';
  const title = disconnected
    ? 'Sem rede ativa'
    : snapshot.type === 'cellular'
      ? `Dados móveis ${generation ?? ''}`.trim()
      : snapshot.type === 'wifi'
        ? 'Conectado via Wi-Fi'
        : snapshot.type === 'ethernet'
          ? 'Conectado via Ethernet'
          : snapshot.type === 'vpn'
            ? 'Conexão por VPN'
            : 'Tipo de rede não identificado';
  const detail = disconnected
    ? 'Sem transporte de rede ativo. As funções locais do diagnóstico continuam disponíveis.'
    : snapshot.isInternetReachable === true
      ? 'O sistema informa acesso à internet. Isso não é necessário para ler PIDs ou executar as regras locais.'
      : snapshot.isInternetReachable === false
        ? 'A rede está ativa, mas a internet não foi alcançada. Clima e consultas online podem ficar indisponíveis.'
        : 'A rede está ativa ou em verificação; a disponibilidade da internet ainda não foi confirmada.';
  const icon = disconnected
    ? 'offline'
    : snapshot.type === 'wifi'
      ? 'wifi'
      : snapshot.type === 'cellular'
        ? 'connectivity'
        : 'network';
  const tone = disconnected
    ? 'danger'
    : snapshot.isInternetReachable === true
      ? 'success'
      : snapshot.isInternetReachable === false
        ? 'warning'
        : 'muted';
  const shortLabel = disconnected
    ? 'OFF'
    : snapshot.type === 'wifi'
      ? 'WI-FI'
      : snapshot.type === 'cellular'
        ? generation ?? 'MÓVEL'
        : snapshot.type === 'ethernet'
          ? 'CABO'
          : snapshot.type === 'vpn'
            ? 'VPN'
            : 'REDE';
  const meteredLabel = snapshot.isConnectionExpensive === true
    ? 'O Android sinaliza esta conexão como tarifada.'
    : snapshot.isConnectionExpensive === false
      ? 'O Android não sinaliza esta conexão como tarifada; confirme seu plano com a operadora.'
      : 'O Android não forneceu informação de tarifação.';
  const signalLabel = snapshot.type === 'wifi' && snapshot.strength != null
    ? `${snapshot.strength}% (sinal Wi-Fi informado pelo sistema)`
    : 'N/D para a conexão ativa';

  return {
    title, shortLabel, transportLabel, generationLabel, internetLabel,
    meteredLabel, signalLabel, detail, icon, tone,
  };
}
