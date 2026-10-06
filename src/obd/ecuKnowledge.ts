import ecuPolicy from '../knowledge/ecu.json';

export interface EcuProtocolCandidate {
  elmProtocol: string;
  name: string;
  transport: 'K_LINE' | 'CAN';
}

export interface EcuPolicy {
  version: number;
  vehicle: {
    make: string;
    model: string;
    engine: string;
    modelYear: string;
    displacementCc: number;
    cylinders: number;
  };
  ecu: {
    family: string;
    address: string;
    transport: 'K_LINE';
    baudRate: number;
    preferredProtocol: string;
  };
  elm327: {
    initialization: string[];
    validation: {
      requiredPid: '010C';
      positiveResponsePrefix: '41 0C';
      requirePayloadBytes: 2;
    };
  };
  protocolFallback: EcuProtocolCandidate[];
  evidence: {
    protocolConfidence: string;
    observedProtocol: string;
    observedBaudRate: number;
    observedEcuAddress: string;
    observedValidation: string;
  };
  rules: {
    rawTxRxMustBePreserved: boolean;
    stopAfterFirstValidEcuResponse: boolean;
    doNotGuessProprietaryCommands: boolean;
    doNotUseDeviceNameAsEcuProof: boolean;
    ecuIsValidatedOnlyAfterRequiredPidResponse: boolean;
    canFallbackOnlyAfterKLineFailure: boolean;
  };
}

const policy = ecuPolicy as EcuPolicy;

export function getEcuPolicy(): EcuPolicy {
  return policy;
}

export function validateEcuPolicy(): EcuPolicy {
  if (policy.ecu.family !== 'Multec H-X14YFH') {
    throw new Error('CONFIGURAÇÃO ECU INVÁLIDA: família Multec H-X14YFH esperada.');
  }
  if (policy.elm327.validation.requiredPid !== '010C' ||
      policy.elm327.validation.positiveResponsePrefix !== '41 0C') {
    throw new Error('CONFIGURAÇÃO ECU INVÁLIDA: validação 010C/41 0C obrigatória.');
  }
  if (!policy.rules.ecuIsValidatedOnlyAfterRequiredPidResponse ||
      !policy.rules.doNotGuessProprietaryCommands) {
    throw new Error('CONFIGURAÇÃO ECU INVÁLIDA: regras de segurança da ECU não podem ser desativadas.');
  }
  return policy;
}
