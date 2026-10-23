import * as Location from 'expo-location';

export interface CurrentConditions {
  city: string | null;
  /** Locality labels are only populated when foreground location was already authorized. */
  locationLabels: string[];
  temperatureC: number | null;
  description: string;
  available: boolean;
}

function buildLocationLabels(city: string | null, district: string | null): string[] {
  const labels: string[] = [];
  if (city) labels.push(`CIDADE: ${city}`);
  if (district && district.trim().toLocaleLowerCase('pt-BR') !== city?.trim().toLocaleLowerCase('pt-BR')) {
    labels.push(`BAIRRO: ${district.trim()}`);
  }
  return labels;
}

export function describeWeatherCode(code: number | null | undefined): string {
  if (code == null || !Number.isFinite(code)) return 'TEMPO INDISPONÍVEL';
  if (code === 0) return 'CÉU LIMPO';
  if ([1, 2].includes(code)) return 'PARCIALMENTE NUBLADO';
  if (code === 3) return 'NUBLADO';
  if ([45, 48].includes(code)) return 'NEBLINA';
  if ([51, 53, 55, 56, 57].includes(code)) return 'GAROA';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'CHUVA';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'NEVE';
  if ([95, 96, 99].includes(code)) return 'TEMPESTADE';
  return 'CONDIÇÃO VARIÁVEL';
}

/**
 * Optional weather enrichment. It never requests location permission and never
 * participates in OBD polling or diagnostic decisions. Any permission, GPS or
 * network failure degrades to an unavailable label, preserving offline use.
 */
export async function loadCurrentConditions(): Promise<CurrentConditions> {
  let city: string | null = null;
  let locationLabels: string[] = [];
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      return { city: null, locationLabels: [], temperatureC: null, description: 'CLIMA OPCIONAL • LOCALIZAÇÃO NÃO AUTORIZADA', available: false };
    }

    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    try {
      const addresses = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const address = addresses[0];
      // Some Android reverse-geocoders put a neighborhood in `district`.
      // Prefer the municipality fallback and never promote a district/state to city.
      city = address?.city || address?.subregion || null;
      locationLabels = buildLocationLabels(city, address?.district || null);
    } catch {
      // Reverse geocoding is optional; weather may still be available.
    }

    const url = 'https://api.open-meteo.com/v1/forecast'
      + '?latitude=' + encodeURIComponent(String(position.coords.latitude))
      + '&longitude=' + encodeURIComponent(String(position.coords.longitude))
      + '&current=temperature_2m,weather_code&timezone=auto';
    const response = await fetch(url);
    if (!response.ok) throw new Error('Weather service unavailable');
    const payload = await response.json() as {
      current?: { temperature_2m?: unknown; weather_code?: unknown };
    };
    const temperature = payload.current?.temperature_2m;
    const code = payload.current?.weather_code;
    const temperatureC = typeof temperature === 'number' && Number.isFinite(temperature)
      ? temperature
      : null;
    const weatherCode = typeof code === 'number' && Number.isFinite(code) ? code : null;
    if (temperatureC == null) throw new Error('Weather data unavailable');

    return {
      city,
      locationLabels,
      temperatureC,
      description: describeWeatherCode(weatherCode),
      available: true,
    };
  } catch {
    return {
      city,
      locationLabels,
      temperatureC: null,
      description: 'CLIMA INDISPONÍVEL • DIAGNÓSTICO OFFLINE',
      available: false,
    };
  }
}
