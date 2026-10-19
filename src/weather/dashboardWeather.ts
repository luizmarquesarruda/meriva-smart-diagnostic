import * as Location from 'expo-location';

export type DashboardWeatherStatus =
  | 'LOADING'
  | 'READY'
  | 'OFFLINE'
  | 'LOCATION_PERMISSION'
  | 'LOCATION_UNAVAILABLE';

export interface CurrentWeatherObservation {
  temperatureC: number;
  apparentTemperatureC: number | null;
  weatherCode: number | null;
}

export interface DashboardWeather {
  status: DashboardWeatherStatus;
  city: string | null;
  region: string | null;
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  weatherCode: number | null;
  updatedAt: string | null;
}

const EMPTY_WEATHER = {
  city: null,
  region: null,
  temperatureC: null,
  apparentTemperatureC: null,
  weatherCode: null,
  updatedAt: null,
} as const;

export function parseCurrentWeather(payload: unknown): CurrentWeatherObservation | null {
  if (!payload || typeof payload !== 'object') return null;
  const current = (payload as { current?: unknown }).current;
  if (!current || typeof current !== 'object') return null;

  const raw = current as {
    temperature_2m?: unknown;
    apparent_temperature?: unknown;
    weather_code?: unknown;
  };
  const temperature = raw.temperature_2m;
  if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < -90 || temperature > 65) {
    return null;
  }

  const apparent = raw.apparent_temperature;
  const code = raw.weather_code;
  return {
    temperatureC: temperature,
    apparentTemperatureC: typeof apparent === 'number' && Number.isFinite(apparent) ? apparent : null,
    weatherCode: typeof code === 'number' && Number.isFinite(code) ? Math.trunc(code) : null,
  };
}

export function resolveCityName(
  address: Pick<Location.LocationGeocodedAddress, 'city' | 'subregion' | 'district' | 'region'> | null | undefined,
): string | null {
  if (!address) return null;
  const value = address.city || address.subregion || address.district || address.region;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function describeWeatherCode(code: number | null): string {
  if (code === null || !Number.isFinite(code)) return 'TEMPO ATUAL';
  if (code === 0) return 'CÉU LIMPO';
  if (code <= 3) return 'NUBLADO';
  if (code === 45 || code === 48) return 'NEBLINA';
  if (code >= 51 && code <= 67) return 'GAROA / CHUVA';
  if (code >= 71 && code <= 77) return 'NEVE';
  if (code >= 80 && code <= 82) return 'PANCADAS';
  if (code === 85 || code === 86) return 'NEVE';
  if (code >= 95) return 'TEMPESTADE';
  return 'TEMPO INSTÁVEL';
}

function emptyWeather(status: DashboardWeatherStatus, city: string | null = null, region: string | null = null): DashboardWeather {
  return { ...EMPTY_WEATHER, status, city, region };
}

/**
 * Busca localização apenas em primeiro plano e consulta o clima atual.
 * A requisição HTTPS usa a rede padrão do Android (Wi-Fi ou dados móveis).
 * Coordenadas são enviadas à API pública Open-Meteo para obter a previsão local.
 */
export async function loadDashboardWeather(fetchImpl: typeof fetch = fetch): Promise<DashboardWeather> {
  let permission: Location.LocationPermissionResponse | null = null;
  try {
    permission = await Location.getForegroundPermissionsAsync();
  } catch {
    permission = null;
  }

  if (permission?.status !== 'granted') {
    return emptyWeather('LOCATION_PERMISSION');
  }

  let position: Location.LocationObject;
  try {
    const recent = await Location.getLastKnownPositionAsync({
      maxAge: 5 * 60 * 1000,
      requiredAccuracy: 5000,
    });
    position = recent ?? await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      mayShowUserSettingsDialog: false,
    });
  } catch {
    return emptyWeather('LOCATION_UNAVAILABLE');
  }

  let city: string | null = null;
  let region: string | null = null;
  try {
    const addresses = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
    const address = addresses[0];
    city = resolveCityName(address);
    region = address?.region?.trim() || null;
  } catch {
    // Geocoding is optional: weather may still load when the platform can't name the city.
  }

  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return emptyWeather('LOCATION_UNAVAILABLE', city, region);
  }

  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m%2Capparent_temperature%2Cweather_code&timezone=auto';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) throw new Error('Weather request failed');
    const observation = parseCurrentWeather(await response.json());
    if (!observation) throw new Error('Weather response is invalid');

    return {
      status: 'READY',
      city,
      region,
      ...observation,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return emptyWeather('OFFLINE', city, region);
  } finally {
    clearTimeout(timeout);
  }
}
