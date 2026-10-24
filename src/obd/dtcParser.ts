function normalizeHexStream(rawResponse: string): string {
  return rawResponse.replace(/[^0-9A-F]/gi, '').toUpperCase();
}

function isHexBytes(value: string): boolean {
  return value.length > 0 && value.length % 2 === 0 && /^[0-9A-F]+$/.test(value);
}

function validAdditiveChecksum(frameHex: string, checksumHex: string): boolean {
  if (!isHexBytes(frameHex) || !/^[0-9A-F]{2}$/.test(checksumHex)) return false;
  let sum = 0;
  for (let i = 0; i < frameHex.length; i += 2) {
    sum = (sum + Number.parseInt(frameHex.slice(i, i + 2), 16)) & 0xFF;
  }
  return sum === Number.parseInt(checksumHex, 16);
}

/**
 * Extract the DTC data bytes from a single response line. Direct OBD, one
 * ISO-TP/CAN frame, and the recognized 48 6B K-Line envelope are supported.
 * Do not concatenate different ECU lines: their address/length bytes are not
 * DTC payload and must never turn into false fault codes.
 */
function extractDtcPayloadHex(service: '03' | '07' | '0A', line: string): string | null {
  const compact = normalizeHexStream(line);
  if (!compact) return null;
  const serviceNumber = Number.parseInt(service, 16);
  const positiveHeader = (0x40 + serviceNumber).toString(16).padStart(2, '0').toUpperCase();
  let payload: string | null = null;

  if (compact.startsWith(positiveHeader)) {
    payload = compact.slice(2);
  } else if (compact.startsWith('486B') && compact.length >= 10 &&
      compact.slice(6, 8) === positiveHeader) {
    // ISO 9141 / KWP fixed address header: 48 6B <ECU> <positive SID> ...
    const dataAndChecksum = compact.slice(8);
    if (dataAndChecksum.length < 6 || dataAndChecksum.length % 4 !== 2) return null;
    const data = dataAndChecksum.slice(0, -2);
    const checksum = dataAndChecksum.slice(-2);
    if (!validAdditiveChecksum(compact.slice(0, -2), checksum)) return null;
    payload = data;
  } else {
    // CAN display with headers enabled: 3- or 8-hex-digit arbitration ID,
    // one ISO-TP single-frame length byte, then the positive service byte.
    const can11Prefix = compact.slice(0, 5);
    const can29Prefix = compact.slice(0, 10);
    if (/^[0-9A-F]{3}[0-9A-F]{2}$/.test(can11Prefix) &&
        compact.slice(5, 7) === positiveHeader) {
      payload = compact.slice(7);
      const declaredLength = Number.parseInt(can11Prefix.slice(3), 16);
      if (declaredLength !== payload.length / 2 + 1) return null;
    } else if (/^[0-9A-F]{8}[0-9A-F]{2}$/.test(can29Prefix) &&
        compact.slice(10, 12) === positiveHeader) {
      payload = compact.slice(12);
      const declaredLength = Number.parseInt(can29Prefix.slice(8), 16);
      if (declaredLength !== payload.length / 2 + 1) return null;
    }
  }

  if (payload == null || !isHexBytes(payload) || payload.length < 4 || payload.length % 4 !== 0) {
    return null;
  }
  return payload;
}

function collectDtcPayloads(service: '03' | '07' | '0A', rawResponse: string): string[] {
  const payloads: string[] = [];
  for (const line of rawResponse.split(/[\r\n]+/)) {
    if (!line.trim()) continue;
    const payload = extractDtcPayloadHex(service, line);
    if (payload) payloads.push(payload);
  }
  return payloads;
}

export function parseDtcResponseForService(
  service: '03' | '07' | '0A',
  rawResponse: string,
): string[] {
  const codes: string[] = [];
  for (const payload of collectDtcPayloads(service, rawResponse)) {
    for (let index = 0; index + 3 < payload.length; index += 4) {
      const high = Number.parseInt(payload.slice(index, index + 2), 16);
      const low = Number.parseInt(payload.slice(index + 2, index + 4), 16);
      if (high === 0 && low === 0) continue;

      const type = ['P', 'C', 'B', 'U'][(high >> 6) & 0x03];
      const digit1 = (high >> 4) & 0x03;
      const digit2 = high & 0x0f;
      const digit3 = (low >> 4) & 0x0f;
      const digit4 = low & 0x0f;
      codes.push(
        `${type}${digit1.toString(16).toUpperCase()}${digit2.toString(16).toUpperCase()}${digit3.toString(16).toUpperCase()}${digit4.toString(16).toUpperCase()}`,
      );
    }
  }
  return Array.from(new Set(codes));
}

/** True only for a structurally complete positive DTC response or explicit no-codes text. */
export function isValidDtcResponseForService(service: '03' | '07' | '0A', rawResponse: string): boolean {
  if (/\b(NO DATA|UNABLE TO CONNECT|BUS INIT|BUS ERROR|STOPPED|ERROR)\b/i.test(rawResponse)) return false;
  if (/\bNO CODES?\b|\bNENHUM(?:\s+(?:DTC|C[ÓO]DIGOS?))?\b/i.test(rawResponse)) return true;
  return collectDtcPayloads(service, rawResponse).length > 0;
}
