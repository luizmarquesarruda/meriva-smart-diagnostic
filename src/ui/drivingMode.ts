export type DrivingModeTone = 'good' | 'normal' | 'warning' | 'danger' | 'muted';
export type DrivingModeStatus = 'NO_DATA' | 'COLLECTING' | 'CALIBRATING' | 'ECONOMICAL' | 'NORMAL' | 'HIGH_CONSUMPTION';

export interface DrivingModePresentation {
  status: DrivingModeStatus;
  label: string;
  detail: string;
  tone: DrivingModeTone;
  averageKml: number | null;
}

export const MIN_VALID_SAMPLES = 5;
export const MAX_VALID_CONSUMPTION_KML = 30;
const ECONOMICAL_RATIO = 1.15;
const HIGH_CONSUMPTION_RATIO = 0.85;

function isValidConsumption(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= MAX_VALID_CONSUMPTION_KML;
}

/** Reports a short-term consumption trend, not a definitive verdict on driving style. */
export function getDrivingModePresentation(input: {
  currentSamplesKml: number[];
  historicalAverageKml: number | null;
  ecuConnected: boolean;
}): DrivingModePresentation {
  if (!input.ecuConnected) {
    return { status: 'NO_DATA', label: 'N/D', detail: 'ECU DESCONECTADA', tone: 'muted', averageKml: null };
  }
  const validSamples = input.currentSamplesKml.filter(isValidConsumption).slice(-MIN_VALID_SAMPLES);
  if (validSamples.length === 0) {
    return { status: 'NO_DATA', label: 'N/D', detail: 'AGUARDANDO CONSUMO VÁLIDO', tone: 'muted', averageKml: null };
  }
  if (validSamples.length < MIN_VALID_SAMPLES) {
    return { status: 'COLLECTING', label: 'COLETANDO', detail: `${validSamples.length}/${MIN_VALID_SAMPLES} LEITURAS VÁLIDAS`, tone: 'muted', averageKml: null };
  }
  const averageKml = validSamples.reduce((sum, value) => sum + value, 0) / MIN_VALID_SAMPLES;
  const baseline = input.historicalAverageKml;
  if (baseline == null || !isValidConsumption(baseline)) {
    return { status: 'CALIBRATING', label: 'CALIBRANDO', detail: `${averageKml.toFixed(1)} km/L • AGUARDANDO HISTÓRICO REAL`, tone: 'normal', averageKml };
  }
  if (averageKml >= baseline * ECONOMICAL_RATIO) {
    return { status: 'ECONOMICAL', label: 'ECONÔMICO', detail: `${averageKml.toFixed(1)} km/L • MELHOR QUE A MÉDIA REAL`, tone: 'good', averageKml };
  }
  if (averageKml <= baseline * HIGH_CONSUMPTION_RATIO) {
    return { status: 'HIGH_CONSUMPTION', label: 'CONSUMO ALTO', detail: `${averageKml.toFixed(1)} km/L • ABAIXO DA MÉDIA REAL`, tone: 'warning', averageKml };
  }
  return { status: 'NORMAL', label: 'NA MÉDIA', detail: `${averageKml.toFixed(1)} km/L • PRÓXIMO DA MÉDIA REAL`, tone: 'normal', averageKml };
}
