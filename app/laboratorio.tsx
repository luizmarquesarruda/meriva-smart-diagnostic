import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import { Elm327Session } from '../src/obd/elm327';
import { parseDtcResponse, parsePidResponse } from '../src/obd/parser';
import { SimulatedObdTransport } from '../src/obd/simulatedTransport';
import { BluetoothDeviceInfo } from '../src/obd/bluetoothClassicTransport';
import { createRealElmSession, discoverPairedDevices } from '../src/obd/bluetoothManager';
import { canPollObd } from '../src/obd/bluetoothState';
import { KNOWN_PIDS } from '../src/obd/pidScanner';
import { discoverIntelligentPids } from '../src/obd/intelligentPidDiscovery';
import { getPidDefinition, getPidReference } from '../src/obd/pidDefinition';
import { getDtcDefinition } from '../src/obd/dtcDefinition';
import { getSharedObdConnection, getSharedObdStatus, setSharedObdConnection, subscribeSharedObd, disconnectSharedObd } from '../src/obd/sharedConnection';
import { autoTripService } from '../src/trip/autoTripService';
import { getMidLayout } from '../src/ui/midLayout';
import { scanDtcServices, readFreezeFrame, type DtcServiceScan } from '../src/obd/dtcScanner';
import { getVehicleConditionSnapshot } from '../src/obd/liveTelemetry';

import { DtcRecord, nextDtcOccurrences, readDtcs, recordDtc } from '../src/database/dtcManager';
import { readPidConfirmations, recordDiscoveredPids } from '../src/database/pidBank';
import {
  initAutoSave,
  updateAutoSaveState,
  getAutoSaveState,
} from '../src/meriva/autosaveManager';
import { forceSaveOnObdEvent, registerObdQuery } from '../src/meriva/autosaveIntegration';
import { runLocalDiagnostic, type DiagnosticResult } from '../src/diagnostics/diagnosticEngine';
import type { PidObservation } from '../src/types/sourceTypes';

type Mode = 'REAL' | 'SIMULACAO';

function getBasePath(): string {
  return `${FileSystem.documentDirectory}MERIVA_SMART`;
}

export default function LaboratorioScreen() {
  const windowSize = useWindowDimensions();
  const layout = getMidLayout(windowSize);
  const [mode, setMode] = useState<Mode>('REAL');
  const [devices, setDevices] = useState<BluetoothDeviceInfo[]>([]);
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
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [dtcScan, setDtcScan] = useState<DtcServiceScan[]>([]);
  const [dtcScanning, setDtcScanning] = useState(false);
  const sessionRef = useRef<Elm327Session | null>(null);
  const autoSaveReadyRef = useRef(false);

  const simulationSession = useMemo(
    () => new Elm327Session(new SimulatedObdTransport()),
    [],
  );

  useEffect(() => {
    const unsubscribeTrip = autoTripService.subscribe((trip) => {
      setTripActive(trip.active);
      setTripFuelSupported(trip.connected ? trip.fuelSupported : null);
      setTripDistanceKm(trip.distanceKm);
      setTripFuelUsedL(trip.fuelUsedL);
      setFuelUsedL(trip.fuelUsedL);
      setTripConsumptionKml(trip.consumptionKml);
      if (trip.error) setError(trip.error);
    });

    const unsubscribe = subscribeSharedObd((connection) => {
      if (!connection) {
        sessionRef.current = null;
        return;
      }
      sessionRef.current = connection.session;
      setProtocol(connection.protocol ?? 'N/D');
      setStatus('ELM RESPONDENDO / CONEXÃO AUTOMÁTICA');
    });
    const existing = getSharedObdConnection();
    if (existing) {
      sessionRef.current = existing.session;
      setProtocol(existing.protocol ?? 'N/D');
    }

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
      unsubscribeTrip();
      unsubscribe();
      mounted = false;
      if (!autoSaveReadyRef.current) return;

      void (async () => {
        const activeSession = sessionRef.current;
        sessionRef.current = null;
          try {
          if (getSharedObdConnection()?.session !== activeSession) await activeSession?.close();
        } catch {
          // sessão já fechada
        }

      })();
    };
  }, []);

  async function loadDevices() {
    setLoadingDevices(true);
    setError('');
    try {
      const paired = await discoverPairedDevices();
      setDevices(paired);
      setStatus(paired.length ? 'BLUETOOTH OK / ELM NÃO CONECTADO' : 'NENHUM ELM327 PAREADO');
    } catch (cause) {
      setStatus('BLUETOOTH NÃO PRONTO');
      setError(cause instanceof Error ? cause.message : 'FALHA AO LISTAR BLUETOOTH');
    } finally {
      setLoadingDevices(false);
    }
  }

  async function connectReal() {
    setError('');
    setStatus('BLUETOOTH CONECTANDO');
    try {
      if (sessionRef.current) {
        await sessionRef.current.close();
        sessionRef.current = null;
      }

      // O aplicativo escolhe o adaptador. A lista de pareados é somente
      // diagnóstico visual; o usuário não precisa selecionar MAC.
      const candidates = [...devices].sort((a, b) => {
        const score = (device: BluetoothDeviceInfo) => {
          const name = (device.name || '').toUpperCase();
          return /ELM327|OBD|OBDII|V-LINK/.test(name) ? 0 : 1;
        };
        return score(a) - score(b);
      });
      if (!candidates.length) throw new Error('NENHUM DISPOSITIVO BLUETOOTH PAREADO. PAREIE O ELM327 NAS CONFIGURAÇÕES DO ANDROID.');

      let selectedDevice: BluetoothDeviceInfo | null = null;
      let connection: Awaited<ReturnType<typeof createRealElmSession>> | null = null;
      let lastError: unknown = null;
      for (const candidate of candidates) {
        try {
          setStatus(`TESTANDO ELM327: ${candidate.name || candidate.address}`);
          const candidateConnection = await createRealElmSession(candidate, undefined, getAutoSaveState().pidDiscovery);
          selectedDevice = candidate;
          connection = candidateConnection;
          break;
        } catch (cause) {
          lastError = cause;
        }
      }
      if (!selectedDevice || !connection) {
        throw lastError instanceof Error ? lastError : new Error('NENHUM ELM327 PAREADO RESPONDEU À ECU.');
      }
      const device = selectedDevice;
      const connected = connection;
      sessionRef.current = connected.session;
      await setSharedObdConnection({
        session: connected.session,
        device,
        protocol: connected.protocol,
        supportedPids: connected.supportedPids,
        ecuValidated: connected.ecuValidated,
        getDiagnosticsText: () => connected.session.getTransportDiagnosticsText(),
      });
      setProtocol(connection.protocol ?? 'N/D');
      const discoveredProtocol = connected.protocol;
      if (
        connected.pidDiscoverySource === 'ECU' &&
        discoveredProtocol &&
        connected.supportedPids.length > 0
      ) {
        updateAutoSaveState((state) => {
          state.pidDiscovery = {
            supportedPids: connected.supportedPids,
            protocol: discoveredProtocol,
            discoveredAt: new Date().toISOString(),
          };
        });
      }

      setStatus(
        connected.pidDiscoverySource === 'CACHE'
          ? 'ELM RESPONDENDO / PIDs CARREGADOS DO JSON'
          : 'ELM RESPONDENDO / PIDs DESCOBERTOS E SALVOS',
      );
      // A conexão já fez a descoberta. Não repita a varredura imediatamente.
      const discovered = connected.supportedPids;
      setSupportedPids(discovered);
      const fuelSupported = discovered.includes('015E');
      setTripFuelSupported(fuelSupported);
      setTripActive(true);
      setStatus(
        fuelSupported
          ? connected.protocol ? 'VIAGEM AUTOMÁTICA / GPS + PID 015E' : 'VIAGEM AUTOMÁTICA / PROTOCOLO N/D'
          : 'VIAGEM AUTOMÁTICA / GPS, SEM PID 015E',
      );
    } catch (cause) {
      const failedSession = sessionRef.current;
      sessionRef.current = null;
      try {
        await failedSession?.close();
      } catch {
        // sessão já encerrada ou transporte indisponível
      }
      setProtocol('N/D');
      setTripFuelSupported(null);
      setTripActive(false);
      setStatus('ELM NÃO RESPONDE');
      setError(cause instanceof Error ? cause.message : 'FALHA AO CONECTAR AO ELM327');
    }
  }

  async function disconnectReal() {
    const activeSession = sessionRef.current;
    sessionRef.current = null;
    setProtocol('N/D');

    try {
      if (getSharedObdConnection()?.session === activeSession) {
        await disconnectSharedObd();
      } else {
        await activeSession?.close();
      }
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
      if (mode === 'REAL' && !canPollObd(getSharedObdStatus().lifecycle)) {
        throw new Error('DIAGNÓSTICO AINDA NÃO ESTÁ PRONTO. AGUARDE BLUETOOTH, ELM327 E ECU.');
      }
      if (!activeSession) throw new Error('CONECTE AO ELM327 ANTES DE TESTAR O PID');
      const result = mode === 'REAL'
        ? await autoTripService.withPollingPaused(() => activeSession.queryPid(pid))
        : await activeSession.queryPid(pid);

      await registerObdQuery(getBasePath(), result, mode);

      setTx(result.tx);
      setRx(result.rx);
      setElapsedMs(result.elapsedMs);
      setProtocol(result.protocol ?? 'N/D');
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
      if (mode === 'REAL' && !canPollObd(getSharedObdStatus().lifecycle)) {
        throw new Error('DIAGNÓSTICO AINDA NÃO ESTÁ PRONTO. AGUARDE BLUETOOTH, ELM327 E ECU.');
      }
      if (!activeSession) throw new Error('CONECTE AO ELM327 ANTES DE DESCOBRIR PIDs');
      const result = await autoTripService.withPollingPaused(() =>
        discoverIntelligentPids(activeSession, {
          ...(mode === 'REAL' ? { basePath: getBasePath() } : {}),
          knownPids: KNOWN_PIDS,
        }),
      );
      // Salvar tanto PIDs anunciados pelos bitmaps quanto PIDs com resposta
      // bruta válida fora do bitmap/sem decodificador. Isso amplia a descoberta
      // sem transformar uma referência de catálogo em suporte confirmado.
      const observedWithoutDecoder = result.observations
        .filter((item) => item.status === 'SEM_DEFINICAO')
        .map((item) => item.pid);
      const discovered = Array.from(new Set([
        ...result.supportedPids,
        ...observedWithoutDecoder,
      ])).sort();
      setSupportedPids(discovered);
      if (mode === 'REAL') {
        const activeProtocol = activeSession.getProtocol() ?? 'N/D';
        const priorKnowledge = await readPidConfirmations(getBasePath());
        const priorIds = new Set(priorKnowledge.map((entry) => entry.pid.toUpperCase()));
        const catalogued = discovered.filter((value) => getPidDefinition(value) !== null).length;
        const referenceOnly = discovered.filter((value) => !getPidDefinition(value) && getPidReference(value)).length;
        const alreadyStored = discovered.filter((value) => priorIds.has(value)).length;
        const withoutDefinition = discovered.filter((value) => !getPidDefinition(value) && !getPidReference(value));
        const respondedPids = result.observations
          .filter((item) => item.status === 'CONFIRMADO' || item.status === 'RESPONDEU' || item.status === 'SEM_DEFINICAO')
          .map((item) => item.pid);
        await recordDiscoveredPids(getBasePath(), discovered, activeProtocol, respondedPids);
        updateAutoSaveState((state) => {
          if (activeProtocol && discovered.length > 0) {
            state.pidDiscovery = {
              supportedPids: discovered,
              protocol: activeProtocol,
              discoveredAt: new Date().toISOString(),
            };
          }
        });
        await forceSaveOnObdEvent();
        const responded = result.observations.filter((item) =>
          item.status === 'CONFIRMADO' || item.status === 'RESPONDEU' || item.status === 'SEM_DEFINICAO',
        ).length;
        setStatus(
          `VARREDURA AMPLA: ${discovered.length} PIDs salvos • ${responded} respostas úteis • decodificadores: ${catalogued} • referência: ${referenceOnly} • já no banco: ${alreadyStored} • sem referência: ${withoutDefinition.length}`,
        );
      } else {
        setStatus(`SIMULAÇÃO: ${discovered.length} PIDs detectados • nenhuma descoberta real gravada`);
      }
    } catch (cause) {
      setStatus('FALHA NA DESCOBERTA');
      setError(cause instanceof Error ? cause.message : 'ERRO AO DESCOBRIR PIDs');
    }
  }

  async function readAllDtcs() {
    setError('');
    setDtcScanning(true);
    setStatus(mode === 'SIMULACAO' ? 'SIMULAÇÃO LOCAL: VARREDURA DTC 03/07/0A' : 'ECU: VARREDURA DTC 03/07/0A');
    try {
      const activeSession = mode === 'SIMULACAO' ? simulationSession : sessionRef.current;
      if (mode === 'REAL' && !canPollObd(getSharedObdStatus().lifecycle)) {
        throw new Error('DIAGNÓSTICO AINDA NÃO ESTÁ PRONTO. AGUARDE BLUETOOTH, ELM327 E ECU.');
      }
      if (!activeSession) throw new Error('CONECTE AO ELM327 ANTES DA VARREDURA DTC');

      const results = mode === 'REAL'
        ? await autoTripService.withPollingPaused(() => scanDtcServices(activeSession))
        : await scanDtcServices(activeSession);
      setDtcScan(results);
      const stored = results.find((item) => item.kind === 'STORED');
      const freezeFrame = mode === 'REAL'
        ? await autoTripService.withPollingPaused(() => readFreezeFrame(activeSession))
        : null;
      setDtcCodes(stored?.codes ?? []);

      if (mode === 'REAL') {
        const existing = await readDtcs(getBasePath());
        const now = new Date().toISOString();
        const priorities: Record<DtcServiceScan['kind'], number> = { PENDING: 1, PERMANENT: 2, STORED: 3 };
        const bestByCode = new Map<string, DtcServiceScan['kind']>();
        for (const scan of results) {
          if (!scan.available) continue;
          for (const code of scan.codes) {
            const priorKind = bestByCode.get(code);
            if (!priorKind || priorities[scan.kind] > priorities[priorKind]) bestByCode.set(code, scan.kind);
          }
        }

        const records: DtcRecord[] = [...bestByCode.entries()].map(([code, kind]) => {
          const previous = existing.find((item) => item.code === code);
          return {
            code,
            description: getDtcDefinition(code)?.description,
            status: kind === 'PENDING' ? 'PENDING' : kind === 'PERMANENT' ? 'PERMANENT' : 'CURRENT',
            firstSeen: previous?.firstSeen ?? now,
            lastSeen: now,
            occurrences: nextDtcOccurrences(previous),
            source: 'REAL_OBD',
            historical: false,
            confirmed: kind !== 'PENDING',
            ...(freezeFrame?.available ? {
              freezeFrame: {
                frame: freezeFrame.frame,
                dtc: freezeFrame.dtc,
                rpm: freezeFrame.rpm,
                coolantC: freezeFrame.coolantC,
              },
            } : {}),
          };
        });

        for (const record of records) await recordDtc(getBasePath(), record);
        const detectedCodes = new Set(records.map((item) => item.code));
        const storedCodes = new Set(stored?.codes ?? []);
        const storedAvailable = stored?.available === true;
        const becameInactive: DtcRecord[] = storedAvailable
          ? existing
            .filter((item) => ['CURRENT', 'CONFIRMED'].includes(item.status) && !storedCodes.has(item.code) && !detectedCodes.has(item.code))
            .map((item) => ({ ...item, status: 'INACTIVE', historical: true, lastSeen: now }))
          : [];
        for (const record of becameInactive) await recordDtc(getBasePath(), record);
        const allDetectedOrInactive = new Set([...detectedCodes, ...becameInactive.map((item) => item.code)]);
        updateAutoSaveState((state) => {
          const preserved = state.dtcs.filter((item) => !allDetectedOrInactive.has(item.code));
          state.dtcs = [...records, ...becameInactive, ...preserved];
        });
        await forceSaveOnObdEvent();
      }

      const available = results.filter((item) => item.available);
      const unavailable = results.filter((item) => !item.available).map((item) => item.service);
      const total = new Set(results.flatMap((item) => item.codes)).size;
      setStatus(
        total > 0
          ? 'DTC ENCONTRADOS: ' + total + (unavailable.length ? ' • NÃO DISPONÍVEL: ' + unavailable.join('/') : '')
          : 'NENHUM DTC NAS FONTES DISPONÍVEIS' + (available.length < results.length ? ' • ALGUNS SERVIÇOS NÃO DISPONÍVEIS' : ''),
      );
    } catch (cause) {
      setStatus('FALHA NA VARREDURA DTC');
      setError(cause instanceof Error ? cause.message : 'ERRO AO VARRER DTC');
    } finally {
      setDtcScanning(false);
    }
  }

  async function readCurrentDtcs() {
    setError('');
    setStatus(mode === 'SIMULACAO' ? 'SIMULAÇÃO LOCAL: LENDO DTC' : 'ECU: LENDO DTC');
    try {
      const activeSession = mode === 'SIMULACAO' ? simulationSession : sessionRef.current;
      if (mode === 'REAL' && !canPollObd(getSharedObdStatus().lifecycle)) {
        throw new Error('DIAGNÓSTICO AINDA NÃO ESTÁ PRONTO. AGUARDE BLUETOOTH, ELM327 E ECU.');
      }
      if (!activeSession) throw new Error('CONECTE AO ELM327 ANTES DE LER DTC');

      const result = mode === 'REAL'
        ? await autoTripService.withPollingPaused(() => activeSession.executeCommand('03'))
        : await activeSession.executeCommand('03');
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
            description: getDtcDefinition(code)?.description,
            status: 'CURRENT',
            firstSeen: previous?.firstSeen ?? now,
            lastSeen: now,
            occurrences: nextDtcOccurrences(previous),
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
  const identifiedSupportedPids = supportedPids.map((value) => ({ pid: value, definition: getPidDefinition(value) }));
  const diagnostic: DiagnosticResult = runLocalDiagnostic({
    observations: getAutoSaveState().lastReadings.map((reading): PidObservation => ({
      pid: reading.pid,
      name: reading.name,
      value: reading.value,
      unit: reading.unit,
      source: reading.source === 'SIMULACAO' ? 'SIMULACAO' : 'REAL_OBD',
      timestamp: reading.timestamp,
      confidence: reading.source === 'SIMULACAO' ? 'LOW' : 'GOOD',
    })),
    dtcs: getAutoSaveState().dtcs,
    condition: getVehicleConditionSnapshot().condition,
  });

  return (
    <SafeAreaView style={{flex:1,backgroundColor:'#eef3fb'}} edges={["top","bottom","left","right"]}>
    <ScrollView contentContainerStyle={[styles.container, { paddingHorizontal: layout.horizontalPadding, alignItems: 'center' }]}>
      <View style={{ width: '100%', maxWidth: layout.maxContentWidth }}>
      <Text style={styles.title}>DIAGNÓSTICO OBD</Text>
      <Text style={styles.status}>{status}</Text>
      <View style={styles.connectionSummary}>
        <View style={styles.connectionItem}><Text style={styles.connectionLabel}>ELM327</Text><Text style={styles.connectionValue}>{sessionRef.current ? 'CONECTADO' : 'AGUARDANDO'}</Text></View>
        <View style={styles.connectionItem}><Text style={styles.connectionLabel}>PROTOCOLO</Text><Text style={styles.connectionValue}>{protocol}</Text></View>
        <View style={styles.connectionItem}><Text style={styles.connectionLabel}>PIDs</Text><Text style={styles.connectionValue}>{supportedPids.length || 'N/D'}</Text></View>
      </View>
      {!storageReady ? <Text style={styles.warning}>PREPARANDO AUTOSAVE...</Text> : null}
      <View style={[styles.tripPanel, layout.landscape && styles.tripPanelLandscape]}>
        <View style={styles.tripHeader}>
          <Text style={styles.tripTitle}>VIAGEM AUTOMÁTICA</Text>
          <Text style={tripActive ? styles.live : styles.muted}>{tripActive ? 'GRAVANDO' : 'AGUARDANDO'}</Text>
        </View>
        <View style={[styles.tripGrid, layout.landscape && styles.tripGridLandscape]}>
          <View style={[styles.tripMetric, layout.landscape && styles.tripMetricLandscape]}><Text style={styles.tripLabel}>DISTÂNCIA GPS</Text><Text style={styles.tripValue}>{tripDistanceKm.toFixed(2)} km</Text></View>
          <View style={[styles.tripMetric, layout.landscape && styles.tripMetricLandscape]}><Text style={styles.tripLabel}>CONSUMO</Text><Text style={styles.tripValue}>{tripConsumptionKml == null ? 'N/D' : tripConsumptionKml.toFixed(2) + ' km/L'}</Text></View>
          <View style={[styles.tripMetric, layout.landscape && styles.tripMetricLandscape]}><Text style={styles.tripLabel}>PID 015E</Text><Text style={styles.tripValue}>{tripFuelSupported === null ? 'N/D' : (tripFuelSupported ? 'OK' : 'NÃO')}</Text></View>
          <View style={[styles.tripMetric, layout.landscape && styles.tripMetricLandscape]}><Text style={styles.tripLabel}>AUTONOMIA ESTIMADA</Text><Text style={styles.tripValue}>{autoTripService.getState().estimatedRangeKm > 0 ? autoTripService.getState().estimatedRangeKm.toFixed(0) + ' km' : 'N/D'}</Text></View>
        </View>
        <Text style={styles.tripHelp}>Sem botão iniciar. O app registra somente dados reais válidos.</Text>
      </View>

      <View style={[styles.modeRow, layout.landscape && styles.rowLandscape]}>
        <TouchableOpacity style={[styles.modeButton, mode === 'REAL' && styles.active]} onPress={() => setMode('REAL')}>
          <Text style={styles.modeText}>REAL</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeButton, mode === 'SIMULACAO' && styles.simActive]} onPress={() => setMode('SIMULACAO')}>
          <Text style={styles.modeText}>SIMULAÇÃO</Text>
        </TouchableOpacity>
      </View>

      {mode === 'REAL' ? (
        <>
          <TouchableOpacity style={[styles.button, layout.landscape && styles.flexButton]} onPress={loadDevices} disabled={loadingDevices || !storageReady}>
            {loadingDevices ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>LISTAR PAREADOS</Text>}
          </TouchableOpacity>

          {devices.map((device) => (
            <View
              key={device.address}
              style={styles.device}
            >
              <Text style={styles.deviceName}>{device.name || 'DISPOSITIVO SEM NOME'}</Text>
              <Text>{device.address}</Text>
            </View>
          ))}

          <TouchableOpacity style={[styles.button, layout.landscape && styles.flexButton]} onPress={connectReal} disabled={!devices.length || !storageReady}>
            <Text style={styles.buttonText}>CONECTAR AUTOMATICAMENTE AO ELM327</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.disconnect, layout.landscape && styles.flexButton]} onPress={() => void disconnectReal()} disabled={!sessionRef.current}>
            <Text style={styles.buttonText}>DESCONECTAR ELM327</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.warning}>SIMULAÇÃO: não é ECU real e não alimenta aprendizado.</Text>
      )}

      <View style={[styles.commandCard, layout.landscape && styles.commandCardLandscape]}>
        <Text style={styles.commandTitle}>CONSULTA MANUAL</Text>
        <TextInput
          value={pid}
          onChangeText={setPid}
          autoCapitalize="characters"
          style={styles.input}
          placeholder="PID, ex.: 010C"
          placeholderTextColor="#64748b"
        />
        <TouchableOpacity style={styles.button} onPress={testPid} disabled={!storageReady || (mode === 'REAL' && !sessionRef.current)}>
          <Text style={styles.buttonText}>CONSULTAR PID</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.secondaryButton} onPress={discoverPids} disabled={!storageReady || (mode === 'REAL' && !sessionRef.current)}>
        <Text style={styles.secondaryButtonText}>DESCOBRIR PIDs SUPORTADOS</Text>
      </TouchableOpacity>
      {!!supportedPids.length ? (
        <View style={styles.pidPanel}>
          <Text style={styles.dtcTitle}>PIDs ENCONTRADOS NA ECU</Text>
          {identifiedSupportedPids.map(({ pid: value, definition }) => (
            <View key={value} style={styles.pidRow}>
              <Text style={styles.pidCode}>{value}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.pidName}>{definition?.name ?? 'PID sem definição local'}</Text>
                <Text style={styles.pidDescription}>{definition?.description ?? 'A ECU informou este PID como suportado, mas o catálogo local ainda não possui decodificação deste identificador.'}</Text>
                <Text style={styles.pidMeta}>{definition ? definition.unit + ' • ' + definition.classification : 'DESCONHECIDO'}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <TouchableOpacity style={styles.secondaryButton} onPress={readAllDtcs} disabled={!storageReady || dtcScanning || (mode === 'REAL' && !sessionRef.current)}>
        <Text style={styles.secondaryButtonText}>{dtcScanning ? 'VARRENDO DTC 03/07/0A...' : 'VARREDURA COMPLETA DE DTC • 03 / 07 / 0A'}</Text>
      </TouchableOpacity>
      {!!dtcScan.length ? (
        <View style={styles.dtcPanel}>
          <Text style={styles.dtcTitle}>ESTADOS DE DTC</Text>
          {dtcScan.map((scan) => (
            <View key={scan.service} style={styles.dtcRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dtcKind}>{scan.service} • {scan.label}</Text>
                <Text style={styles.dtcCodes}>{scan.codes.length ? scan.codes.join(', ') : 'NENHUM CÓDIGO'}</Text>
              </View>
              <Text style={scan.available ? styles.dtcAvailable : styles.dtcUnavailable}>{scan.available ? 'DISPONÍVEL' : 'N/D'}</Text>
            </View>
          ))}
          {dtcScan.flatMap((scan) => scan.codes).length ? (
            <View style={styles.dtcDetails}>
              <Text style={styles.dtcTitle}>IDENTIFICAÇÃO DOS DTCs</Text>
              {Array.from(new Set(dtcScan.flatMap((scan) => scan.codes))).map((code) => {
                const definition = getDtcDefinition(code);
                return (
                  <View key={code} style={styles.dtcDetailRow}>
                    <Text style={styles.dtcDetailCode}>{code}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dtcDetailName}>{definition?.name ?? 'Descrição não catalogada localmente'}</Text>
                      <Text style={styles.dtcDetailText}>{definition?.description ?? 'O código foi recebido da ECU, mas este catálogo local não possui descrição detalhada. Não inferir a causa sem evidência adicional.'}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
          <Text style={styles.dtcHint}>N/D significa serviço sem resposta utilizável; isso não é interpretado como “sem falhas”.</Text>
        </View>
      ) : null}

      <View style={styles.aiPanel}>
        <View style={styles.aiHeader}>
          <Text style={styles.aiTitle}>DIAGNÓSTICO DA IA LOCAL</Text>
          <Text style={styles.aiEngine}>EVIDÊNCIAS v{diagnostic.version}</Text>
        </View>
        {diagnostic.hypotheses.length === 0 ? (
          <Text style={styles.aiMuted}>Nenhuma hipótese com evidência suficiente neste momento.</Text>
        ) : diagnostic.hypotheses.map((hypothesis) => (
          <View key={hypothesis.id} style={styles.hypothesis}>
            <Text style={styles.hypothesisTitle}>{hypothesis.label}</Text>
            <Text style={styles.hypothesisConfidence}>CONFIANÇA: {hypothesis.confidence} · SCORE: {hypothesis.score.toFixed(2)}</Text>
            {hypothesis.evidence.map((item, index) => (
              <Text key={`e-${hypothesis.id}-${index}`} style={styles.aiLine}>• Evidência: {item.text}</Text>
            ))}
            {hypothesis.nextTests.map((item) => <Text key={`t-${hypothesis.id}-${item}`} style={styles.aiLine}>→ Próximo teste: {item}</Text>)}
          </View>
        ))}
        {diagnostic.blockedSimulationSamples > 0 ? (
          <Text style={styles.aiWarning}>SIMULAÇÃO BLOQUEADA: {diagnostic.blockedSimulationSamples} amostra(s) não aumentaram a confiança.</Text>
        ) : null}
        <Text style={styles.aiDisclaimer}>{diagnostic.disclaimer}</Text>
      </View>

      <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowTechnicalDetails((value) => !value)}>
        <Text style={styles.secondaryButtonText}>{showTechnicalDetails ? 'OCULTAR DETALHES TÉCNICOS' : 'DETALHES TÉCNICOS'}</Text>
      </TouchableOpacity>

      {showTechnicalDetails ? (
        <View style={styles.panel}>
          <Text style={styles.label}>TX</Text><Text style={styles.value}>{tx || 'SEM DADOS'}</Text>
          <Text style={styles.label}>RX RAW</Text><Text style={styles.value}>{rx || 'SEM DADOS'}</Text>
          <Text style={styles.label}>TEMPO</Text><Text style={styles.value}>{elapsedMs === null ? 'SEM DADOS' : elapsedMs + ' ms'}</Text>
          <Text style={styles.label}>STATUS</Text><Text style={styles.value}>{parsed?.status || 'COMANDO'}</Text>
          <Text style={styles.label}>VALOR</Text><Text style={styles.value}>{parsed?.value === null || !parsed ? 'SEM DADOS' : parsed.value + ' ' + parsed.unit}</Text>
          <Text style={styles.label}>COMBUSTÍVEL INTEGRADO (PID 015E)</Text><Text style={styles.value}>{fuelUsedL.toFixed(6)} L</Text>
          <Text style={styles.label}>CONTEXTO OPERACIONAL</Text><Text style={styles.value}>{getVehicleConditionSnapshot().condition}</Text>
          <Text style={styles.label}>DTC ARMAZENADOS</Text><Text style={styles.value}>{dtcCodes.length ? dtcCodes.join(', ') : 'NENHUM'}</Text>
          <Text style={styles.label}>PIDs CONHECIDOS SUPORTADOS</Text><Text style={styles.value}>{knownSupported.length ? knownSupported.join(', ') : 'N/D'}</Text>
          <Text style={styles.label}>TOTAL DE PIDs DESCOBERTOS</Text><Text style={styles.value}>{supportedPids.length}</Text>
        </View>
      ) : null}

      {!!error && <Text style={styles.error}>{error}</Text>}
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingVertical: 16, backgroundColor: '#eef3fb' },
  title: { fontSize: 22, fontWeight: '900', color: '#1557a6', letterSpacing: 0.5, marginBottom: 6 },
  status: { color: '#2563eb', fontWeight: '700', marginBottom: 6 },
  protocol: { color: '#475569', fontWeight: '600', marginBottom: 8 },
  connectionSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  connectionItem: { flexGrow: 1, flexBasis: 110, minWidth: 110, backgroundColor: '#fff', borderRadius: 7, borderWidth: 1, borderColor: '#d1d9e2', padding: 9 },
  connectionLabel: { color: '#64748b', fontSize: 9, fontWeight: '900' },
  connectionValue: { color: '#1f2937', fontSize: 12, fontWeight: '900', marginTop: 3 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  rowLandscape: { alignItems: 'stretch' },
  flexButton: { flex: 1 },
  tripPanelLandscape: { padding: 14 },
  tripGridLandscape: { flexWrap: 'nowrap', gap: 12 },
  commandCardLandscape: { maxWidth: 620 },
  modeButton: { flex: 1, padding: 10, borderRadius: 7, borderWidth: 1, borderColor: '#94a3b8', alignItems: 'center' },
  modeText: { color: '#1f2937', fontWeight: '900', fontSize: 11 },
  active: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  simActive: { backgroundColor: '#fef3c7', borderColor: '#d97706' },
  commandCard: { backgroundColor: '#fff', borderRadius: 8, padding: 11, marginBottom: 10, borderWidth: 1, borderColor: '#d1d9e2' },
  commandTitle: { color: '#1f2937', fontSize: 12, fontWeight: '900', marginBottom: 7 },
  button: { backgroundColor: '#1557a6', borderRadius: 7, padding: 13, alignItems: 'center', marginBottom: 9 },
  secondaryButton: { backgroundColor: '#fff', borderColor: '#94a3b8', borderWidth: 1, borderRadius: 7, padding: 12, alignItems: 'center', marginBottom: 9 },
  secondaryButtonText: { color: '#1f2937', fontWeight: '700' },
  disconnect: { backgroundColor: '#64748b' },
  buttonText: { color: '#fff', fontWeight: '700' },
  device: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#cbd5e1' },
  selected: { borderColor: '#2563eb', borderWidth: 2 },
  deviceName: { fontWeight: '700', color: '#1f2937' },
  warning: { color: '#b45309', marginBottom: 12 },
  input: { backgroundColor: '#fff', borderColor: '#cbd5e1', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12, color: '#0f172a' },
  tripPanel: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#cbd5e1' },
  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tripTitle: { color: '#1f2937', fontWeight: '900', fontSize: 14 },
  tripGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tripMetric: { width: '48%', marginBottom: 8 },
  tripMetricLandscape: { width: '23%', marginBottom: 0 },
  tripLabel: { color: '#64748b', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  tripValue: { color: '#1f2937', fontWeight: '800', fontSize: 16, marginTop: 2 },
  live: { color: '#15803d', fontWeight: '900', fontSize: 10 },
  muted: { color: '#64748b', fontWeight: '900', fontSize: 10 },
  tripHelp: { color: '#64748b', fontSize: 11, marginTop: 2 },
  aiPanel: { backgroundColor: '#fff', borderRadius: 10, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: '#93c5fd' },
  aiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  aiTitle: { color: '#1557a6', fontWeight: '900', fontSize: 14 },
  aiEngine: { color: '#64748b', fontSize: 9, fontWeight: '800' },
  hypothesis: { borderTopWidth: 1, borderTopColor: '#dbeafe', paddingTop: 9, marginTop: 8 },
  hypothesisTitle: { color: '#1f2937', fontWeight: '900', fontSize: 14 },
  hypothesisConfidence: { color: '#2563eb', fontWeight: '800', fontSize: 11, marginTop: 3 },
  aiLine: { color: '#334155', fontSize: 11, marginTop: 4 },
  aiMuted: { color: '#64748b', fontSize: 11 },
  aiWarning: { color: '#b45309', fontWeight: '800', fontSize: 11, marginTop: 9 },
  aiDisclaimer: { color: '#64748b', fontSize: 10, marginTop: 9 },
  dtcPanel: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#cbd5e1' },
  dtcTitle: { color: '#1557a6', fontSize: 13, fontWeight: '900', marginBottom: 6 },
  dtcRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingVertical: 8 },
  dtcKind: { color: '#334155', flexShrink: 1, fontSize: 10, fontWeight: '900' },
  dtcCodes: { color: '#64748b', fontSize: 10, marginTop: 3 },
  dtcAvailable: { color: '#15803d', fontSize: 8, fontWeight: '900' },
  dtcUnavailable: { color: '#b45309', fontSize: 8, fontWeight: '900' },
  dtcHint: { color: '#64748b', fontSize: 9, lineHeight: 14, marginTop: 7 },
  dtcDetails: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 8 },
  dtcDetailRow: { flexDirection: 'row', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#eef2f7' },
  dtcDetailCode: { color: '#1557a6', fontWeight: '900', fontSize: 12, width: 52 },
  dtcDetailName: { color: '#1f2937', fontWeight: '900', fontSize: 11 },
  dtcDetailText: { color: '#64748b', fontSize: 9, lineHeight: 14, marginTop: 2 },
  pidPanel: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#93c5fd' },
  pidRow: { flexDirection: 'row', gap: 9, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  pidCode: { color: '#1557a6', fontWeight: '900', fontSize: 11, width: 42 },
  pidName: { color: '#1f2937', fontWeight: '900', fontSize: 11 },
  pidDescription: { color: '#64748b', fontSize: 9, lineHeight: 14, marginTop: 2 },
  pidMeta: { color: '#2563eb', fontSize: 8, fontWeight: '800', marginTop: 3 },
  panel: { backgroundColor: '#1f2937', borderRadius: 14, padding: 16, marginTop: 8 },
  label: { color: '#93c5fd', marginTop: 8 },
  value: { color: '#f8fafc', fontSize: 16, marginTop: 3 },
  error: { color: '#c2410c', marginTop: 16 },
});