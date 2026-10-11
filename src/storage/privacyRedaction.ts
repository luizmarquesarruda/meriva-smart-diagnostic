/** Redação padrão para arquivos exportados, sem alterar o estado diagnóstico mantido localmente. */
export function redactSensitiveIdentifiers(content: string): string {
  return content
    // VINs têm 17 caracteres alfanuméricos, sem I, O ou Q.
    .replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi, '[VIN REDIGIDO]')
    // Endereços Bluetooth/MAC com separadores ':' ou '-'.
    .replace(/\b(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}\b/gi, '[ENDEREÇO BLUETOOTH REDIGIDO]')
    // Campos estruturados de traces/JSON podem usar nomes diferentes para o mesmo identificador.
    .replace(/("(?:deviceName|adapterName|pairedDeviceName|device_name|adapter_name)"\s*:\s*")[^"]*(")/gi, '$1[REDACTED FOR PRIVACY]$2')
    .replace(/("(?:deviceAddress|adapterAddress|bluetoothAddress|macAddress|selectedAdapterAddress)"\s*:\s*")[^"]*(")/gi, '$1[ENDEREÇO BLUETOOTH REDIGIDO]$2')
    // Nome de adaptador pode ter sido personalizado com um nome pessoal.
    .replace(/^(Adaptador|ELM DEVICE):.*$/gim, '$1: [REDACTED FOR PRIVACY]')
    .replace(/^DEVICE:.*$/gim, 'DEVICE: [REDACTED FOR PRIVACY]')
    // Sanitiza também snapshots TXT antigos, que podem conter campos de identidade ainda sem o novo formatador.
    .replace(/^(VIN|Identificação ECU|Nome ECU|Adaptador):.*$/gim, '$1: [OMITIDO POR PRIVACIDADE]')
    .replace(/^(\\s*(?:selectedAdapterAddress|adapterAddress|deviceAddress|macAddress|bluetoothAddress|adapterName|deviceName|ecuIdentification|ecuName|vin|serialNumber)\\s*):.*$/gim, '$1: [OMITIDO POR PRIVACIDADE]');
}
