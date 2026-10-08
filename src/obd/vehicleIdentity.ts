import type { Elm327Session } from './elm327';

export interface VehicleIdentity {
  vin: string | null;
  ecuId: string | null;
  ecuName: string | null;
  supported: boolean;
  raw: Record<string, string>;
}

function hexToAscii(raw: string): string {
  const hex = raw.replace(/[^0-9A-F]/gi, '');
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const value = Number.parseInt(hex.slice(i, i + 2), 16);
    if (value >= 32 && value <= 126) out += String.fromCharCode(value);
  }
  return out.replace(/[^A-Z0-9]/gi, '').trim();
}

function decodeVin(response: string): string | null {
  const normalized = response.replace(/[^0-9A-F]/gi, '').toUpperCase();
  const marker = normalized.indexOf('4902');
  if (marker < 0) return null;
  const ascii = hexToAscii(normalized.slice(marker + 4));
  const vin = ascii.match(/[A-HJ-NPR-Z0-9]{17}/i)?.[0]?.toUpperCase() ?? null;
  return vin && vin.length === 17 ? vin : null;
}

function decodeText(response: string, service: string, pid: string): string | null {
  const normalized = response.replace(/[^0-9A-F]/gi, '').toUpperCase();
  const marker = normalized.indexOf(service + pid);
  if (marker < 0) return null;
  const text = hexToAscii(normalized.slice(marker + 4));
  return text || null;
}

export async function readVehicleIdentity(session: Elm327Session): Promise<VehicleIdentity> {
  const raw: Record<string, string> = {};
  let vin: string | null = null;
  let ecuId: string | null = null;
  let ecuName: string | null = null;

  for (const command of ['0902', '0904', '090A']) {
    try {
      const result = await session.executeCommand(command);
      raw[command] = result.response;
      if (result.status !== 'OK') continue;
      if (command === '0902') vin = decodeVin(result.response);
      if (command === '0904') ecuId = decodeText(result.response, '49', '04');
      if (command === '090A') ecuName = decodeText(result.response, '49', '0A');
    } catch {
      // Identification is optional and must never invalidate a valid ECU session.
    }
  }

  return {
    vin,
    ecuId,
    ecuName,
    supported: Boolean(vin || ecuId || ecuName),
    raw,
  };
}
