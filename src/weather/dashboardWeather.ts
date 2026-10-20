import * as Location from 'expo-location';
import * as Network from 'expo-network';
import * as FileSystem from 'expo-file-system';
import { readAppSettings, type AppSettings } from '../database/appSettings';
import { isOptionalNetworkAllowed } from '../network/networkPolicy';

export type DashboardWeatherStatus =
  | 'LOADING'
  | 'READY'
  | 'OFFLINE'
  | 'LOCATION_PERMISSION'
  | 'LOCATION_UNAVAILABLE'
  | 'NETWORK_RESTRICTED';

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

function weatherCachePath(): string | null {
  const root = FileSystem.documentDirectory;
  return root ? `${root}MERIVA_SMART/CACHE/dashboard-weather.json` : null;
}

/** Parse and validate a previously saved observation before using it offline. */
export function parseCachedWeather(payload: unknown): DashboardWeather | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;
  const observation = parseCurrentWeather({
    current: {
      temperature_2m: raw.temperatureC,
      apparent_temperature: raw.apparentTemperatureC,
      weather_code: raw.weatherCode,
    },
  });
  if (!observation || typeof raw.updatedAt !== 'string' || !Number.isFinite(Date.parse(raw.updatedAt))) {
    return null;
  }

  const cleanText = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null;

  return {
    status: 'OFFLINE',
    city: cleanText(raw.city),
    region: cleanText(raw.region),
    ...observation,
    updatedAt: raw.updatedAt,
  };
}

async function readCachedWeather(): Promise<DashboardWeather | null> {
  const path = weatherCachePath();
  if (!path) return null;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) return null;
    return parseCachedWeather(JSON.parse(await FileSystem.readAsStringAsync(path)));
  } catch {
    return null;
  }
}

async function persistCachedWeather(weather: DashboardWeather): Promise<void> {
  const path = weatherCachePath();
  if (!path || weather.status !== 'READY' || !weather.updatedAt) return;
  try {
    await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}MERIVA_SMART/CACHE`, { intermediates: true });
    await FileSystem.writeAsStringAsync(path, JSON.stringify(weather), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch {
    // Cache failures must never make a successful live weather result unavailable.
  }
}

async function cachedWeather(
  status: DashboardWeatherStatus,
  city: string | null = null,
  region: string | null = null,
): Promise<DashboardWeather> {
  const cached = await readCachedWeather();
  if (!cached) return emptyWeather(status, city, region);
  return {
    ...cached,
    status,
    city: city ?? cached.city,
    region: region ?? cached.region,
  };
}

/**
 * Busca localização apenas em primeiro plano e consulta o clima atual.
 * A requisição HTTPS usa a rede padrão do Android (Wi-Fi ou dados móveis).
 * Coordenadas são enviadas à API pública Open-Meteo para obter a previsão local.
 */
export async function loadDashboardWeather(fetchImpl: typeof fetch = fetch): Promise<DashboardWeather> {
  let settings: AppSettings;
  let networkState: Awaited<ReturnType<typeof Network.getNetworkStateAsync>>;
  try {
    const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
    settings = await readAppSettings(basePath);
    networkState = await Network.getNetworkStateAsync();
  } catch {
    return cachedWeather('OFFLINE');
  }

  // Respect the user's network policy without ever touching the OBD/Bluetooth session.
  if (!isOptionalNetworkAllowed(settings.networkMode, networkState)) {
    const cellular = networkState.type === Network.NetworkStateType.CELLULAR;
    const internetUnavailable = networkState.isConnected !== true || networkState.isInternetReachable === false;
    const preferenceBlocks = settings.networkMode === 'OFFLINE' ||
      (settings.networkMode === 'WIFI_ONLY' && cellular && !internetUnavailable);
    return cachedWeather(preferenceBlocks ? 'NETWORK_RESTRICTED' : 'OFFLINE');
  }

  let permission: Location.LocationPermissionResponse | null = null;
  try {
    permission = await Location.getForegroundPermissionsAsync();
  } catch {
    permission = null;
  }

  if (permission?.status !== 'granted') {
    return cachedWeather('LOCATION_PERMISSION');
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
    return cachedWeather('LOCATION_UNAVAILABLE');
  }

  let city: string | null = null;
  let region: string | null = null;
  try {
    // Reverse geocoding uses the platform geocoder; only rounded coordinates are explicitly sent to Open-Meteo.
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
    return cachedWeather('LOCATION_UNAVAILABLE', city, region);
  }

  // Two decimal places are roughly kilometre-scale and avoid sending precise location to Open-Meteo.
  const approximateLatitude = Number(lat.toFixed(2));
  const approximateLongitude = Number(lon.toFixed(2));
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${approximateLatitude}&longitude=${approximateLongitude}` +
    '&current=temperature_2m%2Capparent_temperature%2Cweather_code&timezone=auto';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) throw new Error('Weather request failed');
    const observation = parseCurrentWeather(await response.json());
    if (!observation) throw new Error('Weather response is invalid');

    const result: DashboardWeather = {
      status: 'READY',
      city,
      region,
      ...observation,
      updatedAt: new Date().toISOString(),
    };
    await persistCachedWeather(result);
    return result;
  } catch {
    return cachedWeather('OFFLINE', city, region);
  } finally {
    clearTimeout(timeout);
  }
}
