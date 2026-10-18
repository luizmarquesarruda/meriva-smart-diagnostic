import * as FileSystem from 'expo-file-system';
import type { ExtendedDiscoveryReport } from '../obd/extendedPidDiscovery';

export async function saveExtendedDiscoveryReport(basePath: string, report: ExtendedDiscoveryReport): Promise<string> {
  if (report.source !== 'REAL_OBD' || report.policyId !== 'MERIVA_EXTENDED_OBD_DISCOVERY_V1') {
    throw new Error('RELATÓRIO SEM ORIGEM OBD REAL');
  }
  const directory = basePath + '/DIAGNOSTICOS/OBD_EXTENDIDO';
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const stamp = report.createdAt.replace(/[^0-9TZ]/g, '-');
  const target = directory + '/obd-extended-' + stamp + '.json';
  await FileSystem.writeAsStringAsync(target, JSON.stringify(report, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return target;
}
