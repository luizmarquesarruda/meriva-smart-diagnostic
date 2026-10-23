function normalizeHexStream(rawResponse: string): string {
  return rawResponse.replace(/[^0-9A-F]/gi, '').toUpperCase();
}

export function parseDtcResponseForService(
  service: '03' | '07' | '0A',
  rawResponse: string,
): string[] {
  const stream = normalizeHexStream(rawResponse);
  const serviceNumber = Number.parseInt(service, 16);
  const positiveHeader = (0x40 + serviceNumber).toString(16).padStart(2, '0').toUpperCase();
  const headerIndex = stream.indexOf(positiveHeader);
  if (headerIndex < 0) return [];

  const rawData = stream.slice(headerIndex + positiveHeader.length);
  const usableLength = rawData.length - (rawData.length % 4);
  const data = rawData.slice(0, usableLength);
  const codes: string[] = [];

  for (let index = 0; index + 3 < data.length; index += 4) {
    const high = Number.parseInt(data.slice(index, index + 2), 16);
    const low = Number.parseInt(data.slice(index + 2, index + 4), 16);
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

  return codes;
}


/** True only for a complete positive DTC response or an explicit no-codes message. */
export function isValidDtcResponseForService(service: '03' | '07' | '0A', rawResponse: string): boolean {
  if (/\b(NO DATA|UNABLE TO CONNECT|BUS INIT|BUS ERROR|STOPPED|ERROR)\b/i.test(rawResponse)) return false;
  if (/\bNO CODES?\b|\bNENHUM(?:\s+(?:DTC|C[ÓO]DIGOS?))?\b/i.test(rawResponse)) return true;
  const stream = normalizeHexStream(rawResponse);
  const serviceNumber = Number.parseInt(service, 16);
  const positiveHeader = (0x40 + serviceNumber).toString(16).padStart(2, '0').toUpperCase();
  const headerIndex = stream.indexOf(positiveHeader);
  if (headerIndex < 0) return false;
  const payload = stream.slice(headerIndex + positiveHeader.length);
  return payload.length >= 4 && payload.length % 4 === 0;
}
