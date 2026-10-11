/** Redação padrão para arquivos exportados, sem alterar o estado diagnóstico mantido localmente. */
export function redactSensitiveIdentifiers(content: string): string {
  return content
    // VINs têm 17 caracteres alfanuméricos, sem I, O ou Q.
    .replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi, '[VIN REDIGIDO]')
    // Endereços Bluetooth/MAC com separadores ':' ou '-'.
    .replace(/\b(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}\b/gi, '[ENDEREÇO BLUETOOTH REDIGIDO]')
    // Nome de adaptador pode ter sido personalizado com um nome pessoal.
    .replace(/^(Adaptador|ELM DEVICE):.*$/gim, '$1: [REDACTED FOR PRIVACY]')
    .replace(/^DEVICE:.*$/gim, 'DEVICE: [REDACTED FOR PRIVACY]');
}
