import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { readDriveCycles, initializeDriveCycles } from '../src/storage/driveCycleStorage';
import { getDriveCycleSummary, type DriveCycle } from '../src/data/driveCycles';
import { getAutoSaveStatus, initAutoSave, updateAutoSaveState } from '../src/meriva/autosaveManager';
import type { AutoSaveStatus } from '../src/meriva/autosaveManager';
import type { LastPidReading, ObdConnectionState } from '../src/meriva/autosaveState';
import { gpsTracker, hasReliableGpsFix, type GpsTripState } from '../src/gps';
import { DEFAULT_SCREEN_PREFERENCES, loadScreenPreferences, type ScreenPreferences } from '../src/ui/screenPreferences';

type DisplayMode = 'principal' | 'motor' | 'viagem' | 'diagnostico';

const BOOT_MS = 1800;

function formatTime(iso: string | null): string {
  if (!iso) return 'N/D';
  try { return new Date(iso).toLocaleTimeString('pt-BR'); } catch { return 'N/D'; }
}

function formatDistanceParts(distanceKm: number): { value: string; unit: 'm' | 'km' } {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return { value: '0', unit: 'm' };
  if (distanceKm < 1) return { value: String(Math.round(distanceKm * 1000)), unit: 'm' };
  return { value: distanceKm.toFixed(2), unit: 'km' };
}

function reading(readings: LastPidReading[], pid: string): LastPidReading | undefined {
  return readings.find((item) => item.pid.toUpperCase().replace(/^01/, '') === pid.toUpperCase());
}

function value(readings: LastPidReading[], pid: string, digits = 0): string {
  const item = reading(readings, pid);
  if (item?.status !== 'RESPONDEU' || item.value == null || !Number.isFinite(item.value)) return '--';
  return item.value.toFixed(digits);
}

export default function IndexScreen() {
  const [cycles, setCycles] = useState<DriveCycle[]>([]);
  const [obd, setObd] = useState<ObdConnectionState>({ connected: false });
  const [readings, setReadings] = useState<LastPidReading[]>([]);
  const [dtcs, setDtcs] = useState<import('../src/types/sourceTypes').DtcRecord[]>([]);
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>({ lastSavedAt: null, lastSaveReason: null, lastError: null });
  const [isHydrated, setIsHydrated] = useState(false);
  const [gpsState, setGpsState] = useState<GpsTripState>(gpsTracker.getState());
  const [screenPrefs, setScreenPrefs] = useState<ScreenPreferences>(DEFAULT_SCREEN_PREFERENCES);
  const [booting, setBooting] = useState(true);
  const [mode, setMode] = useState<DisplayMode>('principal');

  useEffect(() => gpsTracker.subscribe(setGpsState), []);

  useEffect(() => {
    const timer = setTimeout(() => setBooting(false), BOOT_MS);
    return () => clearTimeout(timer);
  }, []);

  const reloadStoredState = useCallback(async () => {
    const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
    try {
      const restored = await initAutoSave(basePath);
      await initializeDriveCycles(basePath);
      const storedCycles = await readDriveCycles(basePath);
      const loaded = restored.driveCycles.length ? restored.driveCycles : storedCycles;
      if (!restored.driveCycles.length && loaded.length) {
        updateAutoSaveState((state) => { state.driveCycles = loaded; });
      }
      setCycles(loaded);
      setObd(restored.obd);
      setReadings(restored.lastReadings);
      setDtcs(restored.dtcs);
      setScreenPrefs(await loadScreenPreferences(basePath));
      setSaveStatus(getAutoSaveStatus());
      setIsHydrated(true);
    } catch {
      setSaveStatus(getAutoSaveStatus());
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => { void reloadStoredState(); }, [reloadStoredState]);
  useFocusEffect(useCallback(() => { void reloadStoredState(); }, [reloadStoredState]));

  const summary = useMemo(() => getDriveCycleSummary(cycles), [cycles]);
  const gpsReady = hasReliableGpsFix(gpsState);
  const gpsWaitingForFix = gpsState.running && gpsState.permissionGranted && !gpsReady;
  const obdReady = obd.connected;
  const distance = formatDistanceParts(gpsState.distanceKm);
  const currentRpm = value(readings, '0C');
  const coolant = value(readings, '05');
  const throttle = value(readings, '11', 1);
  const map = value(readings, '0B', 1);
  const dtcCurrent = dtcs.filter((item) => item.status === 'CURRENT' || item.status === 'PENDING').length;

  if (booting) {
    return (
      <SafeAreaView style={styles.boot}>
        <View style={styles.bootCenter}>
          <Text style={styles.bootBrand}>CHEVROLET</Text>
          <Text style={styles.bootModel}>MERIVA MAXX 1.4</Text>
          <View style={styles.bootLine} />
          <Text style={styles.bootSmall}>INICIALIZANDO</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.display}>
        <View style={styles.topLine}>
          <Text style={styles.topText}>CHEVROLET</Text>
          <Text style={styles.topStatus}>{obdReady ? 'OBD OK' : 'OBD --'}</Text>
        </View>

        <View style={styles.separator} />

        {mode === 'principal' && (
          <View style={styles.mainScreen}>
            <Text style={styles.screenTitle}>MERIVA MAXX 1.4</Text>
            <View style={styles.mainValueRow}>
              <Text style={styles.mainValue}>{gpsReady ? gpsState.currentSpeedKmh.toFixed(0) : '--'}</Text>
              <Text style={styles.mainUnit}>km/h</Text>
            </View>
            <Text style={styles.mainCaption}>
              {gpsState.error ? gpsState.error : gpsReady ? 'VELOCIDADE GPS' : gpsWaitingForFix ? 'AGUARDANDO GPS' : 'GPS SEM FIX'}
            </Text>

            <View style={styles.midGrid}>
              <View>
                <Text style={styles.midLabel}>DISTÂNCIA</Text>
                <View style={styles.rowValue}>
                  <Text style={styles.midValue}>{distance.value}</Text>
                  <Text style={styles.midUnit}>{distance.unit}</Text>
                </View>
              </View>
              <View style={styles.midRight}>
                <Text style={styles.midLabel}>MÁXIMA</Text>
                <Text style={styles.midValue}>{gpsReady ? `${gpsState.maxSpeedKmh.toFixed(0)} km/h` : '--'}</Text>
              </View>
            </View>

            <View style={styles.midGrid}>
              <View>
                <Text style={styles.midLabel}>GPS</Text>
                <Text style={styles.midValue}>{gpsReady ? `${gpsState.lastAccuracyM?.toFixed(0) ?? '--'} m` : '--'}</Text>
              </View>
              <View style={styles.midRight}>
                <Text style={styles.midLabel}>ECU</Text>
                <Text style={styles.midValue}>{obd.ecuAddress ?? '--'}</Text>
              </View>
            </View>
          </View>
        )}

        {mode === 'motor' && (
          <View style={styles.mainScreen}>
            <Text style={styles.screenTitle}>DADOS DO MOTOR</Text>
            <MidRow label="RPM" value={currentRpm} unit="rpm" />
            <MidRow label="TEMPERATURA" value={coolant} unit="°C" />
            <MidRow label="BORBOLETA" value={throttle} unit="%" />
            <MidRow label="MAP" value={map} unit="kPa" />
            <Text style={styles.sourceNote}>SOMENTE LEITURA REAL DA ECU</Text>
          </View>
        )}

        {mode === 'viagem' && (
          <View style={styles.mainScreen}>
            <Text style={styles.screenTitle}>VIAGEM ATUAL</Text>
            <MidRow label="DISTÂNCIA" value={distance.value} unit={distance.unit} />
            <MidRow label="MÁXIMA" value={gpsReady ? gpsState.maxSpeedKmh.toFixed(0) : '--'} unit="km/h" />
            <MidRow label="ÚLTIMO CICLO" value={summary.lastRealCycle ? summary.lastRealCycle.distanceTotalKm.toFixed(2) : '--'} unit="km" />
            <MidRow label="CONSUMO" value={summary.lastRealCycle ? summary.lastRealCycle.avgFuelConsumptionKml.toFixed(2) : '--'} unit="km/L" />
            <Text style={styles.sourceNote}>CONSUMO SOMENTE QUANDO HOUVER DADO REAL VÁLIDO</Text>
          </View>
        )}

        {mode === 'diagnostico' && (
          <View style={styles.mainScreen}>
            <Text style={styles.screenTitle}>DIAGNÓSTICO</Text>
            <MidRow label="OBD" value={obdReady ? 'OK' : '--'} unit="" />
            <MidRow label="PROTOCOLO" value={obd.protocol ?? '--'} unit="" />
            <MidRow label="ECU" value={obd.ecuAddress ?? '--'} unit="" />
            <MidRow label="DTC ATIVOS/PENDENTES" value={dtcCurrent ? String(dtcCurrent) : '--'} unit="" />
            <Text style={styles.sourceNote}>{dtcs.length ? (dtcCurrent ? 'VERIFICAR LABORATÓRIO OBD' : 'SEM DTC ATIVO/PENDENTE REGISTRADO') : 'NENHUMA LEITURA DTC REGISTRADA'}</Text>
          </View>
        )}

        <View style={styles.separator} />

        <View style={styles.bottomStatus}>
          <Text style={styles.bottomText}>{gpsReady ? 'GPS FIX' : 'GPS --'}</Text>
          <Text style={styles.bottomText}>{obdReady ? 'ELM327 OK' : 'ELM327 --'}</Text>
          <Text style={styles.bottomText}>{saveStatus.lastError ? 'SAVE ERRO' : 'AUTO SAVE'}</Text>
        </View>

        <View style={styles.menu}>
          <MenuButton label="VEÍCULO" active={mode === 'principal'} onPress={() => setMode('principal')} />
          <MenuButton label="MOTOR" active={mode === 'motor'} onPress={() => setMode('motor')} />
          <MenuButton label="VIAGEM" active={mode === 'viagem'} onPress={() => setMode('viagem')} />
          <MenuButton label="DIAG." active={mode === 'diagnostico'} onPress={() => setMode('diagnostico')} />
        </View>

        <View style={styles.actions}>
          {screenPrefs.laboratorio && (
            <Link href="/laboratorio" asChild>
              <TouchableOpacity style={styles.actionButton}>
                <Text style={styles.actionText}>LABORATÓRIO OBD</Text>
              </TouchableOpacity>
            </Link>
          )}
          {screenPrefs.armazenamento && (
            <Link href="/armazenamento" asChild>
              <TouchableOpacity style={styles.actionButton}>
                <Text style={styles.actionText}>ARMAZENAMENTO</Text>
              </TouchableOpacity>
            </Link>
          )}
          {screenPrefs.configuracoes && (
            <Link href="/configuracoes" asChild>
              <TouchableOpacity style={styles.actionButton}>
                <Text style={styles.actionText}>CONFIGURAÇÕES</Text>
              </TouchableOpacity>
            </Link>
          )}
        </View>

        <Text style={styles.footer}>
          {isHydrated ? `MERIVA SMART • ${formatTime(saveStatus.lastSavedAt)}` : 'CARREGANDO...'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

function MidRow({ label, value: displayValue, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.midRow}>
      <Text style={styles.midLabel}>{label}</Text>
      <View style={styles.rowValue}>
        <Text style={styles.midValue}>{displayValue}</Text>
        {unit ? <Text style={styles.midUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function MenuButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.menuButton}>
      <Text style={[styles.menuText, active && styles.menuTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, backgroundColor: '#02070d', alignItems: 'center', justifyContent: 'center' },
  bootCenter: { width: '88%', alignItems: 'center' },
  bootBrand: { color: '#4da3ff', fontSize: 25, fontWeight: '700', letterSpacing: 2.2, fontFamily: 'monospace' },
  bootModel: { color: '#4da3ff', fontSize: 20, fontWeight: '700', letterSpacing: 1.4, marginTop: 10, fontFamily: 'monospace' },
  bootLine: { width: '64%', height: 1, backgroundColor: '#1e5f9f', marginVertical: 22 },
  bootSmall: { color: '#2e79bb', fontSize: 11, letterSpacing: 2, fontFamily: 'monospace' },
  container: { flex: 1, backgroundColor: '#02070d', padding: 10 },
  display: { flex: 1, borderWidth: 1, borderColor: '#123a5c', backgroundColor: '#02070d', padding: 14 },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 28 },
  topText: { color: '#4da3ff', fontSize: 15, fontWeight: '700', letterSpacing: 1.8, fontFamily: 'monospace' },
  topStatus: { color: '#2e79bb', fontSize: 10, fontWeight: '700', letterSpacing: 1, fontFamily: 'monospace' },
  separator: { height: 1, backgroundColor: '#123a5c', marginVertical: 8 },
  mainScreen: { flex: 1, paddingVertical: 6 },
  screenTitle: { color: '#2e79bb', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, fontFamily: 'monospace', marginBottom: 12 },
  mainValueRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginTop: 8 },
  mainValue: { color: '#4da3ff', fontSize: 72, lineHeight: 80, fontWeight: '700', fontFamily: 'monospace', letterSpacing: -3 },
  mainUnit: { color: '#2e79bb', fontSize: 18, fontWeight: '700', fontFamily: 'monospace', marginLeft: 8 },
  mainCaption: { color: '#2e79bb', fontSize: 10, textAlign: 'center', letterSpacing: 1.2, fontFamily: 'monospace', marginTop: 4 },
  midGrid: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#0c2b44', paddingTop: 12, marginTop: 14 },
  midRight: { alignItems: 'flex-end' },
  midLabel: { color: '#2e79bb', fontSize: 10, fontWeight: '700', letterSpacing: 1.1, fontFamily: 'monospace' },
  midValue: { color: '#4da3ff', fontSize: 19, fontWeight: '700', letterSpacing: 0.4, fontFamily: 'monospace', marginTop: 4 },
  midUnit: { color: '#2e79bb', fontSize: 11, fontFamily: 'monospace', marginLeft: 5 },
  midRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#0c2b44' },
  rowValue: { flexDirection: 'row', alignItems: 'baseline' },
  sourceNote: { color: '#235e92', fontSize: 9, letterSpacing: 0.8, fontFamily: 'monospace', marginTop: 16, textAlign: 'center' },
  bottomStatus: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  bottomText: { color: '#2e79bb', fontSize: 9, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 0.8 },
  menu: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#0c2b44', paddingVertical: 7 },
  menuButton: { paddingHorizontal: 5, paddingVertical: 5 },
  menuText: { color: '#235e92', fontSize: 9, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 0.5 },
  menuTextActive: { color: '#4da3ff' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 9 },
  actionButton: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#164a75', backgroundColor: '#04111d' },
  actionText: { color: '#4da3ff', fontSize: 9, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 0.6 },
  footer: { color: '#1f5687', fontSize: 8, textAlign: 'center', marginTop: 8, fontFamily: 'monospace' },
});
