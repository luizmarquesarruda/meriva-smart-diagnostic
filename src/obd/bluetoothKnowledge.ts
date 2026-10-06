import bluetoothPolicy from '../knowledge/bluetooth.json';

export interface BluetoothStartupPolicy {
  version: number;
  transport: 'BLUETOOTH_CLASSIC';
  profile: 'ELM327_SPP';
  deviceDiscovery: {
    source: 'PAIRED_DEVICES';
    automaticSelection: boolean;
    lastSuccessfulDeviceFirst: boolean;
    fallbackToOtherPairedDevices: boolean;
  };
  connection: {
    secureSocket: false;
    connectionType: 'delimited';
    delimiter: '\\r';
    charset: 'ascii';
  };
  validation: {
    requireElmResponse: boolean;
    requireEcuResponse: boolean;
    requiredPid: '010C';
    requiredResponsePrefix: '41 0C';
  };
  priority: string[];
  rules: {
    saveDeviceOnlyAfterEcuValidation: boolean;
    neverTrustDeviceNameAlone: boolean;
    neverAskUserToChooseMacByDefault: boolean;
  };
}

const policy = bluetoothPolicy as BluetoothStartupPolicy;

export function getBluetoothStartupPolicy(): BluetoothStartupPolicy {
  return policy;
}

export function validateBluetoothStartupPolicy(): BluetoothStartupPolicy {
  if (policy.transport !== 'BLUETOOTH_CLASSIC' || policy.profile !== 'ELM327_SPP') {
    throw new Error('CONFIGURAÇÃO BLUETOOTH INVÁLIDA: perfil ELM327 SPP não reconhecido.');
  }
  if (!policy.deviceDiscovery.automaticSelection || !policy.deviceDiscovery.lastSuccessfulDeviceFirst) {
    throw new Error('CONFIGURAÇÃO BLUETOOTH INVÁLIDA: seleção automática/prioridade do último ELM desativada.');
  }
  if (!policy.validation.requireEcuResponse || policy.validation.requiredPid !== '010C') {
    throw new Error('CONFIGURAÇÃO BLUETOOTH INVÁLIDA: validação ECU 010C obrigatória.');
  }
  return policy;
}
