import dtcCatalog from '../knowledge/dtc_catalog.json';

export interface DtcDefinition {
  code: string;
  name: string;
  description: string;
  system: string;
  likelyCauses?: string[];
}

const definitions = new Map<string, DtcDefinition>(
  (dtcCatalog.codes as DtcDefinition[]).map((item) => [item.code.toUpperCase(), item]),
);

export function getDtcDefinition(code: string): DtcDefinition | null {
  return definitions.get(code.replace(/\s/g, '').toUpperCase()) ?? null;
}

export function describeDtc(code: string): string {
  const definition = getDtcDefinition(code);
  return definition ? definition.name : 'Descrição não catalogada localmente';
}
