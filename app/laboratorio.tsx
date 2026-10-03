import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Elm327Session } from '../src/obd/elm327';
import { parseDtcResponse, parsePidResponse } from '../src/obd/parser';
import { SimulatedObdTransport } from '../src/obd/simulatedTransport';
import { BluetoothDeviceInfo } from '../src/obd/bluetoothClassicTransport';
import { createRealElmSession, discoverPairedDevices } from '../src/obd/bluetoothManager';
import { discoverSupportedPids, KNOWN_PIDS } from '../src/obd/pidScanner';
import { FuelRateIntegrator } from '../src/obd/fuelConsumption';
import { gpsTracker } from '../src/gps';
import { RealTripRecorder } from '../src/trip/tripRecorder';
import { addDriveCycle, readDriveCycles } from '../src/storage/driveCycleStorage';
import { DtcRecord, readDtcs, recordDtc } from '../src/database/dtcManager';
import {
  initAutoSave,
  startObdSessionCheckpoint,
  stopObdSessionCheckpoint,
  updateAutoSaveState,
} from '../src/meriva/autosaveManager';
import { forceSaveOnObdEvent, registerObdQuery } from '../src/meriva/autosaveIntegration';

type Mode = 'REAL' | 'SIMULACAO';

function getBasePath(): string {
  return `${FileSystem.documentDirectory}MERIVA_SMART`;
}

export default function LaboratorioScreen() {
  const [mode, setMode] = useState<Mode>('REAL');
  const [devices, setDevices] = useState<BluetoothDeviceInfo[]>([]);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [pid, setPid] = useState('010C');
  const [tx, setTx] = useState('');
  const [rx, setRx] = useState('');
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [status, setStatus] = useState('VERIFICANDO ARMAZENAMENTO');
  const [protocol, setProtocol] = useState('N/D');
  const [error, setError] = useState('');
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [supportedPids, setSupportedPids] = useState<string[]>([]);
  const [dtcCodes, setDtcCodes] = useState<string[]>([]);
  const [fuelUsedL, setFuelUsedL] = useState(0);
  const [tripDistanceKm, setTripDistanceKm] = useState(0);
  const [tripFuelUsedL, setTripFuelUsedL] = useState(0);
  const [tripConsumptionKml, setTripConsumptionKml] = useState<number | null>(null);
  const [tripActive, setTripActive] = useState(false);
  const [tripFuelSupported, setTripFuelSupported] = useState<boolean | null>(null);
  const fuelIntegratorRef = useRef(new FuelRateIntegrator());
  const sessionRef = useRef<Elm327Session | null>(null);
  const tripRecorderRef = useRef<RealTripRecorder | null>(null);
  const tripLoopActiveRef = useRef(false);
  const tripLoopPromiseRef = useRef<Promise<void> | null>(null);
  const autoSaveReadyRef = useRef(false);

  const simulationSession = useMemo(
    () => new Elm327Session(new SimulatedObdTransport()),
    [],
  );

  async function delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function stopRealTripRecorder(): Promise<void> {
    tripLoopActiveRef.current = false;
    const loop = tripLoopPromiseRef.current;
    tripLoopPromiseRef.current = null;
    try {
      await loop;
    } catch {
      // falha de uma leitura não impede o fechamento da viagem
    }

    const recorder = tripRecorderRef.current;
    tripRecorderRef.current = null;
    setTripActive(false);

    if (!recorder) return;
    const cycle = recorder.buildDriveCycle();
    if (!cycle) return;

    await addDriveCycle(getBasePath(), cycle);
    const storedCycles = await readDriveCycles(getBasePath());
    updateAutoSaveState((state) => {
      state.driveCycles = storedCycles;
    });
    await forceSaveOnObdEvent();
  }

  async function runRealTripRecorder(session: Elm327Session): Promise<void> {
    while (tripLoopActiveRef.current && sessionRef.current === session) {
      const timestampMs = Date.now();
      try {
        const result = await session.queryPid('015E');
        const fuelRate =
          result.parsed.status === 'RESPONDEU' &&
          result.parsed.unit === 'L/h' &&
          result.parsed.value != null
            ? result.parsed.value
            : null;
        const gps = gpsTracker.getState();
        const recorder = tripRecorderRef.current;

        if (recorder) {
          const state = recorder.addSample({
            timestampMs: Date.now(),
            distanceKm: gps.distanceKm,
            speedKmh: gps.currentSpeedKmh,
            fuelRateLph: fuelRate,
          });
          setTripDistanceKm(state.distanceKm);
          setTripFuelUsedL(state.fuelUsedL);
          setFuelUsedL(state.fuelUsedL);
          setTripConsumptionKml(
            state.fuelUsedL > 0 && state.distanceKm > 0
              ? state.distanceKm / state.fuelUsedL
              : null,
          );
          if (fuelRate == null && state.validFuelSamples === 0) {
            setStatus('GPS ATIVO / ECU SEM PID 015E VÁLIDO');
          }
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'FALHA NA LEITURA AUTOMÁTICA DO PID 015E');
      }

      await delay(1500);
    }
  }

  function startRealTripRecorder(session: Elm327Session): void {
    const gpsDistanceAtStart = gpsTracker.getState().distanceKm;
    const recorder = new RealTripRecorder(Date.now(), gpsDistanceAtStart);
    tripRecorderRef.current = recorder;
    fuelIntegratorRef.current.reset();
    setFuelUsedL(0);
    setTripDistanceKm(0);
    setTripFuelUsedL(0);
    setTripConsumptionKml(null);
    setTripActive(true);
    tripLoopActiveRef.current = true;
    tripLoopPromiseRef.current = runRealTripRecorder(session);
  }

  useEffect(() => {
    let mounted = true;

    void initAutoSave(getBasePath())
      .then((state) => {
        autoSaveReadyRef.current = true;
        if (mounted) {
          setStorageReady(true);
          setProtocol(state.obd.protocol ?? 'N/D');
          setStatus('BLUETOOTH PRONTO PARA TESTE');
        }
      })
      .catch((cause) => {
        if (mounted) {
          setStatus('FALHA AO INICIALIZAR ARMAZENAMENTO');
          setError(cause instanceof Error ? cause.message : 'FALHA NO AUTOSAVE');
        }
      });

    return () => {
      mounted = false;
      if (!autoSaveReadyRef.current) return;

      void (async () => {
        await stopRealTripRecorder();
        const activeSession = sessionRef.current;
        sessionRef.current = null;
        stopObdSessionCheckpoint();
        try {
          await activeSession?.close();
        } catch {
          // sessão já fechada
        }
        updateAutoSaveState((state) => {
          state.obd = { ...state.obd, connected: false };
        });
        await forceSaveOnObdEvent();
      })();
    };
  }, []);

  async function loadDevices() {
    setLoadingDevices(true);
    setError('');
    try {
      const paired = await discoverPairedDevices();
      setDevices(paired);
      setSelectedAddress((current) =>
        paired.some((item) => item.address === current) ? current : paired[0]?.address ?? '',
      );
      setStatus(paired.length ? 'BLUETOOTH OK / ELM NÃO CONECTADO' : 'NENHUM ELM327 PAREADO');
    } catch (cause) {
      setStatus('BLUETOOTH NÃO PRONTO');
      setError(cause instanceof Error ? cause.message : 'FALHA AO LISTAR BLUETOOTH');
    } finally {
      setLoadingDevices(false);
    }
  }

  async function connectReal() {
    const device = devices.find((item) => item.address === selectedAddress);
    if (!device) {
      setError('SELECIONE UM DISPOSITIVO PAREADO');
      return;
    }

    setError('');
    setStatus('BLUETOOTH CONECTANDO');
    try {
      if (sessionRef.current) {
        await stopRealTripRecorder();
        await sessionRef.current.close();
        sessionRef.current = null;
      }

      const connection = await createRealElmSession(device);
      sessionRef.current = connection.session;
      setProtocol(connection.protocol ?? 'N/D');
      startObdSessionCheckpoint();
      updateAutoSaveState((state) => {
        state.obd = {
          connected: true,
          adapterName: device.name,
          protocol: connection.protocol ?? undefined,
          lastConnectedAt: new Date().toISOString(),
        };
      });

      setStatus('ELM RESPONDENDO / DESCOBRINDO SUPORTE DOS PIDs');
      const discovery = await discoverSupportedPids(connection.session);
      const discovered = Array.from(new Set(discovery.flatMap((item) => item.supportedPids))).sort();
      setSupportedPids(discovered);
      const fuelSupported = discovered.includes('015E');
      setTripFuelSupported(fuelSupported);
      if (fuelSupported) {
        startRealTripRecorder(connection.session);
        setStatus(connection.protocol ? 'VIAGEM AUTOMÁTICA / PID 015E ATIVO' : 'VIAGEM AUTOMÁTICA / PROTOCOLO N/D');
      } else {
        setTripActive(false);
        setStatus('ELM RESPONDENDO / PID 015E NÃO SUPORTADO');
      }
    } catch (cause) {
      sessionRef.current = null;
      setProtocol('N/D');
      setStatus('ELM NÃO RESPONDE');
      setError(cause instanceof Error ? cause.message : 'FALHA AO CONECTAR AO ELM327');
    }
  }

  async function disconnectReal() {
    const activeSession = sessionRef.current;
    sessionRef.current = null;
    setProtocol('N/D');
    stopObdSessionCheckpoint();

    try {
      await stopRealTripRecorder();
      await activeSession?.close();
      updateAutoSaveState((state) => {
        state.obd = { ...state.obd, connected: false };
      });
      await forceSaveOnObdEvent();
      setTripFuelSupported(null);
      setTripConsumptionKml(null);
      setTripDistanceKm(0);
      setTripFuelUsedL(0);
      setFuelUsedL(0);
      setStatus('BLUETOOTH OK / ELM DESCONECTADO');
    } catch (cause) {
      setStatus('DESCONECTADO COM AVISO');
      setError(cause instanceof Error ? cause.message : 'FALHA AO ENCERRAR ELM327');
    }
  }

  async function testPid() {
    setError('');
    setStatus(mode === 'SIMULACAO' ? 'SIMULAÇÃO LOCAL: CONSULTANDO' : 'ECU CONSULTANDO');
    try {
      const activeSession = mode === 'SIMULACAO' ? simulationSession : sessionRef.current;
      if (!activeSession) throw new Error('CONECTE AO ELM327 ANTES DE TESTAR O PID');
      const result = await activeSession.queryPid(pid);

      await registerObdQuery(getBasePath(), result, mode);

      setTx(result.tx);
      setRx(result.rx);
      setElapsedMs(result.elapsedMs);
      setProtocol(result.protocol ?? 'N/D');
      if (mode === 'REAL' && result.parsed.status === 'RESPONDEU' && result.parsed.unit === 'L/h' && result.parsed.value != null) {
        setFuelUsedL(fuelIntegratorRef.current.addSample(result.parsed.value).fuelUsedL);
      }
      setStatus(
        mode === 'SIMULACAO'
          ? `SIMULAÇÃO LOCAL: ${result.parsed.status}`
          : result.parsed.status === 'RESPONDEU'
            ? 'ECU RESPONDENDO'
            : 'ECU NÃO RESPONDE',
      );
    } catch (cause) {
      setStatus('ECU NÃO RESPONDE');
      setError(cause instanceof Error ? cause.message : 'ERRO AO CONSULTAR PID');
    }
  }

  async function discoverPids() {
    setError('');
    setStatus(mode === 'SIMULACAO' ? 'SIMULAÇÃO LOCAL: DESCOBRINDO PIDs' : 'ECU: DESCOBRINDO PIDs');
    try {
      const activeSession = mode === 'SIMULACAO' ? simulationSession : sessionRef.current;
      if (!activeSession) throw new Error('CONECTE AO ELM327 ANTES DE DESCOBRIR PIDs');
      const items = await discoverSupportedPids(activeSession);
      const discovered = Array.from(new Set(items.flatMap((item) => item.supportedPids))).sort();
      setSupportedPids(discovered);
      setStatus(`DESCOBERTA CONCLUÍDA: ${discovered.length} PIDs`);
    } catch (cause) {
      setStatus('FALHA NA DESCOBERTA');
      setError(cause instanceof Error ? cause.message : 'ERRO AO DESCOBRIR PIDs');
    }
  }

  async function readCurrentDtcs() {
    setError('');
    setStatus(mode === 'SIMULACAO' ? 'SIMULAÇÃO LOCAL: LENDO DTC' : 'ECU: LENDO DTC');
    try {
      const activeSession = mode === 'SIMULACAO' ? simulationSession : sessionRef.current;
      if (!activeSession) throw new Error('CONECTE AO ELM327 ANTES DE LER DTC');

      const result = await activeSession.executeCommand('03');
      const codes = parseDtcResponse(result.response);
      setTx(result.command);
      setRx(result.response);
      setElapsedMs(result.elapsedMs);
      setProtocol(activeSession.getProtocol() ?? 'N/D');
      setDtcCodes(codes);

      if (mode === 'REAL') {
        const existing = await readDtcs(getBasePath());
        const now = new Date().toISOString();
        const records: DtcRecord[] = codes.map((code) => {
          const previous = existing.find((item) => item.code === code);
          return {
            code,
            status: 'CURRENT',
            firstSeen: previous?.firstSeen ?? now,
            lastSeen: now,
            occurrences: (previous?.occurrences ?? 0) + 1,
            source: 'REAL_OBD',
            historical: false,
            confirmed: true,
          };
        });

        for (const record of records) await recordDtc(getBasePath(), record);
        updateAutoSaveState((state) => {
          state.dtcs = records.length ? records : existing;
        });
        await forceSaveOnObdEvent();
      }

      setStatus(codes.length ? `DTC ENCONTRADOS: ${codes.join(', ')}` : 'NENHUM DTC RETORNADO');
    } catch (cause) {
      setStatus('FALHA NA LEITURA DE DTC');
      setError(cause instanceof Error ? cause.message : 'ERRO AO LER DTC');
    }
  }

  const parsed = rx ? parsePidResponse(pid, rx) : null;
  const knownSupported = supportedPids.filter((value) => KNOWN_PIDS.includes(value));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>LABORATÓRIO OBD</Text>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.protocol}>PROTOCOLO: {protocol}</Text>
      {!storageReady ? <Text style={styles.warning}>PREPARANDO AUTOSAVE...</Text> : null}
      <View style={styles.tripPanel}>
        <Text style={styles.tripTitle}>VIAGEM AUTOMÁTICA</Text>
        <Text style={styles.tripLine}>STATUS: {tripActive ? 'GRAVANDO' : 'AGUARDANDO OBD'}</Text>
        <Text style={styles.tripLine}>PID 015E: {tripFuelSupported === null ? 'N/D' : tripFuelSupported ? 'SUPORTADO' : 'NÃO SUPORTADO'}</Text>
        <Text style={styles.tripLine}>DISTÂNCIA GPS: {tripDistanceKm.toFixed(3)} km</Text>
        <Text style={styles.tripLine}>COMBUSTÍVEL REAL: {tripFuelUsedL.toFixed(6)} L</Text>
        <Text style={styles.tripLine}>CONSUMO: {tripConsumptionKml == null ? 'N/D' : `${tripConsumptionKml.toFixed(3)} km/L`}</Text>
        <Text style={styles.tripHelp}>A viagem é criada sem botão iniciar. O ciclo junta GPS + PID 015E e salva somente dados reais válidos.</Text>
      </View>

      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeButton, mode === 'REAL' && styles.active]} onPress={() => setMode('REAL')}>
          <Text>BLUETOOTH REAL</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeButton, mode === 'SIMULACAO' && styles.simActive]} onPress={() => setMode('SIMULACAO')}>
          <Text>SIMULAÇÃO</Text>
        </TouchableOpacity>
      </View>

      {mode === 'REAL' ? (
        <>
          <TouchableOpacity style={styles.button} onPress={loadDevices} disabled={loadingDevices || !storageReady}>
            {loadingDevices ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>LISTAR PAREADOS</Text>}
          </TouchableOpacity>

          {devices.map((device) => (
            <TouchableOpacity
              key={device.address}
              style={[styles.device, selectedAddress === device.address && styles.selected]}
              onPress={() => setSelectedAddress(device.address)}
            >
              <Text style={styles.deviceName}>{device.name || 'DISPOSITIVO SEM NOME'}</Text>
              <Text>{device.address}</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={styles.button} onPress={connectReal} disabled={!selectedAddress || !storageReady}>
            <Text style={styles.buttonText}>CONECTAR E INICIALIZAR ELM327</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.disconnect]} onPress={() => void disconnectReal()} disabled={!sessionRef.current}>
            <Text style={styles.buttonText}>DESCONECTAR ELM327</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.warning}>SIMULAÇÃO: não é ECU real e não alimenta aprendizado.</Text>
      )}

      <TextInput
        value={pid}
        onChangeText={setPid}
        autoCapitalize="characters"
        style={styles.input}
        placeholder="PID, ex.: 010C"
        placeholderTextColor="#64748b"
      />
      <TouchableOpacity style={styles.button} onPress={testPid} disabled={!storageReady || (mode === 'REAL' && !sessionRef.current)}>
        <Text style={styles.buttonText}>TESTAR PID</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={discoverPids} disabled={!storageReady || (mode === 'REAL' && !sessionRef.current)}>
        <Text style={styles.secondaryButtonText}>DESCOBRIR PIDs SUPORTADOS</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={readCurrentDtcs} disabled={!storageReady || (mode === 'REAL' && !sessionRef.current)}>
        <Text style={styles.secondaryButtonText}>LER DTC ATUAIS</Text>
      </TouchableOpacity>

      <View style={styles.panel}>
        <Text style={styles.label}>TX</Text><Text style={styles.value}>{tx || 'SEM DADOS'}</Text>
        <Text style={styles.label}>RX</Text><Text style={styles.value}>{rx || 'SEM DADOS'}</Text>
        <Text style={styles.label}>TEMPO</Text><Text style={styles.value}>{elapsedMs === null ? 'SEM DADOS' : `${elapsedMs} ms`}</Text>
        <Text style={styles.label}>STATUS</Text><Text style={styles.value}>{parsed?.status || 'COMANDO'}</Text>
        <Text style={styles.label}>VALOR</Text><Text style={styles.value}>{parsed?.value === null || !parsed ? 'SEM DADOS' : `${parsed.value} ${parsed.unit}`}</Text>
        <Text style={styles.label}>COMBUSTÍVEL INTEGRADO (PID 015E)</Text><Text style={styles.value}>{fuelUsedL.toFixed(6)} L</Text>
        <Text style={styles.label}>RAW PRESERVADO</Text><Text style={styles.value}>{rx || 'SEM DADOS'}</Text>
        <Text style={styles.label}>DTC ATUAIS</Text><Text style={styles.value}>{dtcCodes.length ? dtcCodes.join(', ') : 'NENHUM'}</Text>
        <Text style={styles.label}>PIDs CONHECIDOS SUPORTADOS</Text><Text style={styles.value}>{knownSupported.length ? knownSupported.join(', ') : 'N/D'}</Text>
        <Text style={styles.label}>TOTAL DE PIDs DESCOBERTOS</Text><Text style={styles.value}>{supportedPids.length}</Text>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#eef3fb' },
  title: { fontSize: 24, fontWeight: '700', color: '#1f2937', marginBottom: 8 },
  status: { color: '#2563eb', fontWeight: '700', marginBottom: 6 },
  protocol: { color: '#475569', fontWeight: '600', marginBottom: 8 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeButton: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#94a3b8', alignItems: 'center' },
  active: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  simActive: { backgroundColor: '#fef3c7', borderColor: '#d97706' },
  button: { backgroundColor: '#2563eb', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10 },
  secondaryButton: { backgroundColor: '#fff', borderColor: '#94a3b8', borderWidth: 1, borderRadius: 10, padding: 13, alignItems: 'center', marginBottom: 10 },
  secondaryButtonText: { color: '#1f2937', fontWeight: '700' },
  disconnect: { backgroundColor: '#64748b' },
  buttonText: { color: '#fff', fontWeight: '700' },
  device: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#cbd5e1' },
  selected: { borderColor: '#2563eb', borderWidth: 2 },
  deviceName: { fontWeight: '700', color: '#1f2937' },
  warning: { color: '#b45309', marginBottom: 12 },
  input: { backgroundColor: '#fff', borderColor: '#cbd5e1', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12, color: '#0f172a' },
  tripPanel: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#cbd5e1' },
  tripTitle: { color: '#1f2937', fontWeight: '800', fontSize: 16, marginBottom: 6 },
  tripLine: { color: '#334155', marginTop: 3 },
  tripHelp: { color: '#64748b', fontSize: 12, marginTop: 8 },
  panel: { backgroundColor: '#1f2937', borderRadius: 14, padding: 16, marginTop: 8 },
  label: { color: '#93c5fd', marginTop: 8 },
  value: { color: '#f8fafc', fontSize: 16, marginTop: 3 },
  error: { color: '#c2410c', marginTop: 16 },
});