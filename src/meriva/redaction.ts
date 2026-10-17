/** Redact identifiers before producing a shareable diagnostic export. */
export function redactSensitiveText(input: string): string {
  return input
    .replace(/^(\s*VIN\s*:\s*).+$/gim, '$1[REDACTED]')
    .replace(/^(\s*(?:Identificação ECU|Identificacao ECU|ECU ID|ECU Identification)\s*:\s*).+$/gim, '$1[REDACTED]')
    .replace(/^(\s*(?:Adaptador|Adapter Name|Bluetooth Device|ELM DEVICE|PAIRED \d+)\s*:\s*).+$/gim, '$1[REDACTED]')
    .replace(/\b(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}\b/gi, '[REDACTED_MAC]')
    .replace(/\b(?:ecuIdentification|ecuId|ecu_id|ECU_ID)[=: ]+[^,\s}]+/gi, 'ecuId=[REDACTED]'),
    .replace(/\b(?:adapterAddress|deviceAddress|macAddress|MAC)[=: ]+(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}/gi, 'MAC=[REDACTED]'),
    .replace(/\bVIN[=: ]+[A-HJ-NPR-Z0-9]{17}\b/gi, 'VIN=[REDACTED]');
}
