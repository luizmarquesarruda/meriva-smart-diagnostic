export interface LocationProviderSnapshot {
  locationServicesEnabled: boolean | null;
  gpsAvailable: boolean | null;
  networkAvailable: boolean | null;
}

export interface LocationProviderPresentation {
  servicesLabel: string;
  gpsLabel: string;
  networkLabel: string;
  explanation: string;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/** Normalize Expo Location provider status without inferring missing values. */
export function normalizeLocationProviderSnapshot(value: unknown): LocationProviderSnapshot {
  const source = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  return {
    locationServicesEnabled: readBoolean(source.locationServicesEnabled),
    gpsAvailable: readBoolean(source.gpsAvailable),
    networkAvailable: readBoolean(source.networkAvailable),
  };
}

function label(value: boolean | null, yes: string, no: string): string {
  if (value === true) return yes;
  if (value === false) return no;
  return 'NÃO INFORMADO';
}

export function getLocationProviderPresentation(
  snapshot: LocationProviderSnapshot,
): LocationProviderPresentation {
  const servicesLabel = label(
    snapshot.locationServicesEnabled,
    'ATIVADOS',
    'DESATIVADOS',
  );
  const gpsLabel = label(snapshot.gpsAvailable, 'DISPONÍVEL', 'INDISPONÍVEL');
  const networkLabel = label(snapshot.networkAvailable, 'DISPONÍVEL', 'INDISPONÍVEL');

  const explanation = snapshot.locationServicesEnabled === false
    ? 'Os serviços de localização do Android estão desligados. Ative-os nas configurações; a rede móvel sozinha não substitui uma posição válida.'
    : snapshot.networkAvailable === true
      ? 'O Android informa que o provedor de localização pela rede está disponível. Isso pode ajudar a obter uma posição aproximada, mas não prova qual provedor gerou a última posição.'
      : snapshot.gpsAvailable === true
        ? 'O provedor GPS está disponível. Distância, velocidade e autonomia continuam usando apenas posições que passam pelos filtros de precisão e movimento.'
        : 'O estado dos provedores não está confirmado. Não use a conexão 4G/5G como coordenada, velocidade ou distância.';

  return { servicesLabel, gpsLabel, networkLabel, explanation };
}
