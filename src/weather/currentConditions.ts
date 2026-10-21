import * as Location from 'expo-location';

export interface CurrentConditions {
  city: string | null;
  temperatureC: number | null;
  description: string;
  available: boolean;
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
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== Location.PermissionStatus.GRANTED) {
      return { city: null, temperatureC: null, description: 'CLIMA OPCIONAL • LOCALIZAÇÃO NÃO AUTORIZADA', available: false };
    }

    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    try {
      const addresses = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      const address = addresses[0];
      city = address?.city || address?.district || address?.subregion || address?.region || null;
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
      temperatureC,
      description: describeWeatherCode(weatherCode),
      available: true,
    };
  } catch {
    return {
      city,
      temperatureC: null,
      description: 'CLIMA INDISPONÍVEL • DIAGNÓSTICO OFFLINE',
      available: false,
    };
  }
}
