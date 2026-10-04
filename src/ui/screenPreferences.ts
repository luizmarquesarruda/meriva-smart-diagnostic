import * as FileSystem from 'expo-file-system';

export type ScreenKey = 'laboratorio' | 'armazenamento' | 'configuracoes';

export interface ScreenPreferences {
  laboratorio: boolean;
  armazenamento: boolean;
  configuracoes: boolean;
}

export const DEFAULT_SCREEN_PREFERENCES: ScreenPreferences = {
  laboratorio: true,
  armazenamento: true,
  configuracoes: true,
};

const FILE_NAME = 'screen-preferences.json';

function filePath(basePath: string): string {
  return `${basePath}/${FILE_NAME}`;
}

export async function loadScreenPreferences(basePath: string): Promise<ScreenPreferences> {
  try {
    const raw = await FileSystem.readAsStringAsync(filePath(basePath));
    const parsed = JSON.parse(raw) as Partial<ScreenPreferences>;
    return {
      laboratorio: parsed.laboratorio !== false,
      armazenamento: parsed.armazenamento !== false,
      configuracoes: parsed.configuracoes !== false,
    };
  } catch {
    return { ...DEFAULT_SCREEN_PREFERENCES };
  }
}

export async function saveScreenPreferences(
  basePath: string,
  preferences: ScreenPreferences,
): Promise<void> {
  await FileSystem.writeAsStringAsync(
    filePath(basePath),
    JSON.stringify(preferences, null, 2),
  );
}
