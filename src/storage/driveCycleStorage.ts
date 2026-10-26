import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { appendCsvRow, CsvRow } from '../database/csvLogger';
import { hasReliableTripFuel } from '../data/driveCycles';
import type { DriveCycle } from '../data/driveCycles';

export const DRIVE_CYCLE_SQLITE_FILE = 'drive_cycles.db';
export const DRIVE_CYCLE_SQLITE_SCHEMA_VERSION = 1;
const MIGRATION_MARKER_FILE = 'drive_cycles.sqlite.migrated.json';
const MIGRATION_METADATA_KEY = 'legacy_json_import_version';
const indexWriteQueues = new Map<string, Promise<unknown>>();
const databaseConnections = new Map<string, Promise<SQLite.SQLiteDatabase>>();

function storageKey(basePath: string): string {
  return basePath + '/VIAGENS/' + DRIVE_CYCLE_SQLITE_FILE;
}
function migrationMarkerPath(basePath: string): string {
  return basePath + '/VIAGENS/' + MIGRATION_MARKER_FILE;
}
async function serializeIndexWrite<T>(indexFile: string, operation: () => Promise<T>): Promise<T> {
  const previous = indexWriteQueues.get(indexFile) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  indexWriteQueues.set(indexFile, current);
  try { return await current; }
  finally { if (indexWriteQueues.get(indexFile) === current) indexWriteQueues.delete(indexFile); }
}

/** Backup copies and trip writes share this exclusion queue. */
export function withDriveCycleStorageExclusive<T>(basePath: string, operation: () => Promise<T>): Promise<T> {
  return serializeIndexWrite(storageKey(basePath), operation);
}

function isDriveCycle(value: unknown): value is DriveCycle {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const cycle = value as Partial<DriveCycle>;
  const finiteNonNegative = (item: unknown): item is number =>
    typeof item === 'number' && Number.isFinite(item) && item >= 0;
  const validDate = (item: unknown): item is string =>
    typeof item === 'string' && item.trim().length > 0 && Number.isFinite(Date.parse(item));
  const samples = cycle.telemetrySamples;
  return typeof cycle.id === 'string' && cycle.id.trim().length > 0 &&
    validDate(cycle.startedAt) && validDate(cycle.finishedAt) &&
    finiteNonNegative(cycle.distanceTotalKm) && finiteNonNegative(cycle.distanceIceKm) &&
    finiteNonNegative(cycle.fuelUsedL) && typeof cycle.totalTimeHms === 'string' &&
    typeof cycle.drivingTimeHms === 'string' && typeof cycle.standingTimeHms === 'string' &&
    finiteNonNegative(cycle.avgDrivingSpeedKmh) && finiteNonNegative(cycle.avgFuelConsumptionKml) &&
    (cycle.fuelDataValid === undefined || typeof cycle.fuelDataValid === 'boolean') &&
    (cycle.maxSpeedKmh === undefined || finiteNonNegative(cycle.maxSpeedKmh)) &&
    (samples === undefined || (Array.isArray(samples) && samples.every(sample =>
      typeof sample === 'object' && sample !== null && !Array.isArray(sample) &&
      validDate(sample.timestamp) &&
      (sample.speedKmh === null || finiteNonNegative(sample.speedKmh)) &&
      (sample.rpm === null || finiteNonNegative(sample.rpm)) &&
      (sample.coolantTempC === null ||
       (typeof sample.coolantTempC === 'number' && Number.isFinite(sample.coolantTempC)))
    )) &&
    ['CARSCANNER_SEED','REAL_OBD','SIMULACAO'].includes(cycle.source as string) &&
    validDate(cycle.importedAt);
}

function parseLegacySnapshot(value: unknown): DriveCycle[] | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = (value as {cycles?:unknown}).cycles;
  if (!Array.isArray(raw)) return null;
  const onlySeeds = raw.every(cycle => typeof cycle === 'object' && cycle !== null &&
    (cycle as {source?:unknown}).source === 'CARSCANNER_SEED');
  const invalidNonSeeds = raw.some(cycle =>
    !(typeof cycle === 'object' && cycle !== null &&
      (cycle as {source?:unknown}).source === 'CARSCANNER_SEED') && !isDriveCycle(cycle));
  const valid = raw.filter(isDriveCycle);
  if (invalidNonSeeds || (raw.length > 0 && valid.length === 0 && !onlySeeds)) return null;
  return valid.filter(cycle => cycle.source !== 'CARSCANNER_SEED');
}
async function readLegacySnapshot(filePath: string): Promise<DriveCycle[] | null> {
  const info = await FileSystem.getInfoAsync(filePath);
  if (!info.exists) return null;
  if (info.isDirectory) throw new Error('HISTORICO_DE_VIAGENS_CORROMPIDO; CAMINHO_LEGADO_E_DIRETORIO: '+filePath);
  try {
    return parseLegacySnapshot(JSON.parse(await FileSystem.readAsStringAsync(filePath,{encoding:FileSystem.EncodingType.UTF8})));
  } catch { return null; }
}
/** Invalid existing history is not equivalent to an empty installation. */
async function readLegacyCycles(basePath: string): Promise<DriveCycle[]> {
  const mainPath=basePath+'/VIAGENS/index.json', previousPath=basePath+'/VIAGENS/index.previous.json';
  const mainInfo=await FileSystem.getInfoAsync(mainPath), previousInfo=await FileSystem.getInfoAsync(previousPath);
  if(!mainInfo.exists&&!previousInfo.exists) return [];
  if(mainInfo.exists){const main=await readLegacySnapshot(mainPath);if(main!==null)return main;}
  if(previousInfo.exists){const previous=await readLegacySnapshot(previousPath);if(previous!==null)return previous;}
  throw new Error('HISTORICO_DE_VIAGENS_CORROMPIDO; ARQUIVOS_LEGADOS_PRESERVADOS');
}

async function getDatabase(basePath: string): Promise<SQLite.SQLiteDatabase> {
  const directory=basePath+'/VIAGENS';
  const databasePath=directory+'/'+DRIVE_CYCLE_SQLITE_FILE;
  const markerInfo=await FileSystem.getInfoAsync(migrationMarkerPath(basePath));
  const databaseInfo=await FileSystem.getInfoAsync(databasePath);
  if(!databaseInfo.exists&&markerInfo.exists)
    throw new Error('BANCO_SQLITE_DE_VIAGENS_AUSENTE; RESTAURE UM BACKUP VALIDADO ANTES DE CONTINUAR');
  const cached=databaseConnections.get(databasePath);
  if(cached)return cached;
  const pending=(async()=>{
    const db=await SQLite.openDatabaseAsync(DRIVE_CYCLE_SQLITE_FILE,undefined,directory);
    const versionRow=await db.getFirstAsync<{user_version:number}>('PRAGMA user_version');
    const currentVersion=versionRow?.user_version??0;
    if(currentVersion>DRIVE_CYCLE_SQLITE_SCHEMA_VERSION)
      throw new Error('VERSAO_SQLITE_DE_VIAGENS_NOVA_DEMAIS: '+currentVersion);
    await db.execAsync(
      'PRAGMA journal_mode = DELETE;'+
      'PRAGMA synchronous = FULL;'+
      'CREATE TABLE IF NOT EXISTS drive_cycles ('+
      'row_id INTEGER PRIMARY KEY AUTOINCREMENT,'+
      'id TEXT NOT NULL UNIQUE,'+
      'started_at TEXT NOT NULL,'+
      'finished_at TEXT NOT NULL,'+
      'source TEXT NOT NULL,'+
      'payload_json TEXT NOT NULL);'+
      'CREATE INDEX IF NOT EXISTS idx_drive_cycles_started_at ON drive_cycles(started_at);'+
      'CREATE INDEX IF NOT EXISTS idx_drive_cycles_source ON drive_cycles(source);'+
      'CREATE TABLE IF NOT EXISTS drive_cycle_metadata ('+
      'key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL);'+
      'PRAGMA user_version = '+DRIVE_CYCLE_SQLITE_SCHEMA_VERSION+';'
    );
    return db;
  })();
  databaseConnections.set(databasePath,pending);
  try{return await pending;}
  catch(cause){if(databaseConnections.get(databasePath)===pending)databaseConnections.delete(databasePath);throw cause;}
}

function mergeUniqueCycles(primary:DriveCycle[],secondary:DriveCycle[]):DriveCycle[]{
  const merged=new Map<string,DriveCycle>();
  for(const cycle of [...primary,...secondary]){
    if(!isDriveCycle(cycle)||cycle.source==='CARSCANNER_SEED')continue;
    if(!merged.has(cycle.id))merged.set(cycle.id,cycle);
  }
  return Array.from(merged.values());
}
async function insertLegacyCycle(db:SQLite.SQLiteDatabase,cycle:DriveCycle):Promise<void>{
  await db.runAsync('INSERT OR IGNORE INTO drive_cycles (id, started_at, finished_at, source, payload_json) VALUES (?, ?, ?, ?, ?)',
    cycle.id,cycle.startedAt,cycle.finishedAt,cycle.source,JSON.stringify(cycle));
}
async function initializeDatabaseUnsafe(basePath:string,additionalLegacyCycles:DriveCycle[]=[]):Promise<SQLite.SQLiteDatabase>{
  const db=await getDatabase(basePath);
  const markerPath=migrationMarkerPath(basePath);
  const markerInfo=await FileSystem.getInfoAsync(markerPath);
  const migration=await db.getFirstAsync<{value:string}>(
    'SELECT value FROM drive_cycle_metadata WHERE key = ?',MIGRATION_METADATA_KEY);
  if(migration?.value===String(DRIVE_CYCLE_SQLITE_SCHEMA_VERSION)){
    if(!markerInfo.exists){
      const rows=await db.getAllAsync<{payload_json:string}>('SELECT payload_json FROM drive_cycles ORDER BY row_id ASC');
      await FileSystem.writeAsStringAsync(markerPath,JSON.stringify({
        schemaVersion:DRIVE_CYCLE_SQLITE_SCHEMA_VERSION,migratedAt:new Date().toISOString(),cycleCount:rows.length
      },null,2),{encoding:FileSystem.EncodingType.UTF8});
    }
    return db;
  }
  if(markerInfo.exists)throw new Error('ESTADO_DE_MIGRACAO_SQLITE_INCONSISTENTE; HISTORICO_NAO_SUBSTITUIDO');
  const legacyCycles=await readLegacyCycles(basePath);
  const migrationCycles=mergeUniqueCycles(legacyCycles,additionalLegacyCycles);
  await db.withTransactionAsync(async()=>{
    for(const cycle of migrationCycles)await insertLegacyCycle(db,cycle);
    await db.runAsync('INSERT OR REPLACE INTO drive_cycle_metadata (key, value) VALUES (?, ?)',
      MIGRATION_METADATA_KEY,String(DRIVE_CYCLE_SQLITE_SCHEMA_VERSION));
  });
  await FileSystem.writeAsStringAsync(markerPath,JSON.stringify({
    schemaVersion:DRIVE_CYCLE_SQLITE_SCHEMA_VERSION,migratedAt:new Date().toISOString(),cycleCount:migrationCycles.length
  },null,2),{encoding:FileSystem.EncodingType.UTF8});
  return db;
}
async function readCyclesFromDatabase(db:SQLite.SQLiteDatabase):Promise<DriveCycle[]>{
  const rows=await db.getAllAsync<{payload_json:string}>('SELECT payload_json FROM drive_cycles ORDER BY row_id ASC');
  const cycles:DriveCycle[]=[];
  for(const row of rows){
    let parsed:unknown;
    try{parsed=JSON.parse(row.payload_json);}catch{throw new Error('HISTORICO_SQLITE_CORROMPIDO; REGISTRO JSON INVALIDO');}
    if(!isDriveCycle(parsed)||parsed.source==='CARSCANNER_SEED')throw new Error('HISTORICO_SQLITE_CORROMPIDO; REGISTRO INVALIDO');
    cycles.push(parsed);
  }
  return cycles;
}
export async function initializeDriveCycles(basePath:string,additionalLegacyCycles:DriveCycle[]=[]):Promise<void>{
  await serializeIndexWrite(storageKey(basePath),async()=>{await initializeDatabaseUnsafe(basePath,additionalLegacyCycles);});
}
export async function readDriveCycles(basePath:string):Promise<DriveCycle[]>{
  return serializeIndexWrite(storageKey(basePath),async()=>{
    const db=await initializeDatabaseUnsafe(basePath);
    return readCyclesFromDatabase(db);
  });
}
export async function addDriveCycle(basePath:string,cycle:DriveCycle):Promise<void>{
  if(!isDriveCycle(cycle))throw new Error('VIAGEM_INVALIDA; REGISTRO_NAO_GRAVADO');
  if(cycle.source==='CARSCANNER_SEED')return;
  await serializeIndexWrite(storageKey(basePath),async()=>{
    const db=await initializeDatabaseUnsafe(basePath);
    await db.withTransactionAsync(async()=>{
      await db.runAsync('DELETE FROM drive_cycles WHERE id = ?',cycle.id);
      await db.runAsync('INSERT INTO drive_cycles (id, started_at, finished_at, source, payload_json) VALUES (?, ?, ?, ?, ?)',
        cycle.id,cycle.startedAt,cycle.finishedAt,cycle.source,JSON.stringify(cycle));
    });
    const parsedStart=Date.parse(cycle.startedAt),csvDate=new Date(Number.isFinite(parsedStart)?parsedStart:Date.now());
    const today=[csvDate.getFullYear(),String(csvDate.getMonth()+1).padStart(2,'0'),String(csvDate.getDate()).padStart(2,'0')].join('-');
    const csvFile=basePath+'/VIAGENS/viagens_'+today+'.csv';
    const row:CsvRow={
      id:cycle.id,timestamp:cycle.startedAt,distanceTotalKm:cycle.distanceTotalKm,distanceIceKm:cycle.distanceIceKm,
      fuelUsedL:cycle.fuelUsedL,totalTime:cycle.totalTimeHms,drivingTime:cycle.drivingTimeHms,standingTime:cycle.standingTimeHms,
      avgSpeed:cycle.avgDrivingSpeedKmh,maxSpeed:cycle.maxSpeedKmh??'',
      avgConsumption:hasReliableTripFuel(cycle)?cycle.avgFuelConsumptionKml:'',
      fuelDataValid:hasReliableTripFuel(cycle),telemetrySamples:cycle.telemetrySamples?.length??0,
      source:cycle.source,fuelRateSource:cycle.fuelRateSource??''
    };
    await appendCsvRow(csvFile,row);
  });
}
/** Test hook clears in-memory connection caches without touching the database. */
export function resetDriveCycleStorageForTests():void{databaseConnections.clear();indexWriteQueues.clear();}
