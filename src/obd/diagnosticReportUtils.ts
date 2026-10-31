export interface DiagnosticTraceFailure {
  timestamp: string | null;
  event: string;
  error: string;
}

function decodeJsonString(value: string): string {
  try {
    return JSON.parse('"' + value + '"') as string;
  } catch {
    return value;
  }
}

/** Returns the newest concrete failure event from the current diagnostic trace. */
export function extractLastTraceFailure(trace: string): DiagnosticTraceFailure | null {
  const lines = trace.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const eventMatch = line.match(/^\[([^\]]+)\]\s*([A-Z][A-Z0-9_]+)/);
    const event = eventMatch?.[2] ?? 'UNKNOWN';
    const isAttemptFailure =
      event === 'BLUETOOTH_ATTEMPT_RESULT' && /"result"\s*:\s*"FAILURE"/.test(line);
    const isFailureEvent =
      event === 'ELM_SESSION_FAILURE' ||
      event === 'CONNECT_FAILURE' ||
      /(?:_FAILURE|_TIMEOUT|_ERROR)$/.test(event);
    if (!isAttemptFailure && !isFailureEvent) continue;

    const errorMatch = line.match(/"error"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (!errorMatch?.[1]) continue;

    return {
      timestamp: eventMatch?.[1] ?? null,
      event,
      error: decodeJsonString(errorMatch[1]),
    };
  }
  return null;
}

/**
 * Uses only the physical model reported by the Android runtime.
 * A user-configurable device name is not a reliable hardware model.
 */
export function resolveAndroidModel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const model = value.trim();
  return model.length > 0 ? model : undefined;
}

/** Hides complete Bluetooth MAC addresses before a report is shared externally. */
export function redactBluetoothAddresses(value: string): string {
  return value.replace(/\b(?:[A-F0-9]{2}[:-]){5}[A-F0-9]{2}\b/gi, 'XX:XX:XX:XX:XX:XX');
}

/**
 * Redacts direct vehicle, location and Bluetooth identifiers from a report
 * intended for external sharing. Technical exports must not call this helper.
 */
export function redactSensitiveReportData(value: string, deviceNames: readonly string[] = []): string {
  let redacted = redactBluetoothAddresses(value);
  redacted = redacted.replace(
    /\b(VIN\s*[:=]\s*)[A-HJ-NPR-Z0-9]{17}\b/gi,
    '$1[REDACTED]',
  );
  redacted = redacted.replace(
    /("?vin"?\s*:\s*")[A-HJ-NPR-Z0-9]{17}(")/gi,
    '$1[REDACTED]$2',
  );
  redacted = redacted.replace(
    /("?((?:latitude|longitude|gpsLatitude|gpsLongitude|lat|lon|lng))"?\s*[:=]\s*)-?\d{1,3}(?:\.\d+)?/gi,
    '$1[REDACTED]',
  );
  redacted = redacted.replace(
    /("?(?:gps|location|coordinates?)"?\s*[:=]\s*)[-+]?\d{1,3}\.\d+\s*[,; ]\s*[-+]?\d{1,3}\.\d+/gi,
    '$1[REDACTED]',
  );

  const uniqueNames = [...new Set(deviceNames.map((name) => name.trim()).filter((name) => name.length >= 3))]
    .sort((left, right) => right.length - left.length);
  for (const name of uniqueNames) {
    const escaped = name.split('').map((character) =>
      '\\^$.*+?()[]{}|/'.includes(character) ? '\\' + character : character,
    ).join('');
    redacted = redacted.replace(new RegExp(escaped, 'gi'), '[DEVICE]');
  }
  return redacted;
}
