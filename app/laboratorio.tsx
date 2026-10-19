import { useEffect, useMemo, useRef, useState } from 'react';
import { cockpitTheme } from '../src/ui/cockpitTheme';
import { CockpitScreenHeader } from '../src/ui/CockpitScreenHeader';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import { Elm327Session } from '../src/obd/elm327';
import { parseDtcResponse, parsePidResponse } from '../src/obd/parser';
import { SimulatedObdTransport } from '../src/obd/simulatedTransport';
import { BluetoothDeviceInfo } from '../src/obd/bluetoothClassicTransport';
import { createRealElmSession, discoverPairedDevices } from '../src/obd/bluetoothManager';
import { canPollObd } from '../src/obd/bluetoothState';
import { discoverSupportedPids, KNOWN_PIDS } from '../src/obd/pidScanner';
import { getPidDefinition, PID_DATABASE } from '../src/obd/pidDefinition';
import { readReadinessMonitor, type ReadinessScanResult } from '../src/obd/readinessMonitor';
import { getDtcDefinition } from '../src/obd/dtcDefinition';
import { getSharedObdConnection, getSharedObdStatus, setSharedObdConnection, subscribeSharedObd, disconnectSharedObd } from '../src/obd/sharedConnection';
import { autoTripService } from '../src/trip/autoTripService';
import { getMidLayout } from '../src/ui/midLayout';
import { scanDtcServices, readFreezeFrame, type DtcServiceScan, type FreezeFrameSnapshot } from '../src/obd/dtcScanner';
import { getVehicleConditionSnapshot } from '../src/obd/liveTelemetry';

import { DtcRecord, nextDtcOccurrences, readDtcs, recordDtc } from '../src/database/dtcManager';
import { recordDiscoveredPids } from '../src/database/pidBank';
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
  const [pidPickerOpen, setPidPickerOpen] = useState(false);
  const [pidPickerSearch, setPidPickerSearch] = useState('');
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
  const [readinessScan, setReadinessScan] = useState<ReadinessScanResult | null>(null);
  const [readinessScanning, setReadinessScanning] = useState(false);
  const [freezeFrameSnapshot, setFreezeFrameSnapshot] = useState<FreezeFrameSnapshot | null>(null);
  const [freezeFrameScanning, setFreezeFrameScanning] = useState(false);
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

  async function scanReadiness() {
    setError('');
    setReadinessScanning(true);
    setStatus(mode === 'SIMULACAO' ? 'SIMULAÇÃO LOCAL: LENDO PRONTIDÃO 0101' : 'ECU: LENDO PRONTIDÃO 0101');
    try {
      const activeSession = mode === 'SIMULACAO' ? simulationSession : sessionRef.current;
      if (mode === 'REAL' && !canPollObd(getSharedObdStatus().lifecycle)) {
        throw new Error('DIAGNÓSTICO AINDA NÃO ESTÁ PRONTO. AGUARDE BLUETOOTH, ELM327 E ECU.');
      }
      if (!activeSession) throw new Error('CONECTE AO ELM327 ANTES DE LER A PRONTIDÃO');
      const result = mode === 'REAL'
        ? await autoTripService.withPollingPaused(() => readReadinessMonitor(activeSession))
        : await readReadinessMonitor(activeSession);
      setReadinessScan(result);
      if (!result.available || !result.report) {
        setStatus('PRONTIDÃO NÃO DISPONÍVEL');
        setError(result.reason ?? 'A ECU não forneceu uma resposta de prontidão válida.');
      } else {
        setTx('0101');
        setRx(result.response);
        setElapsedMs(result.elapsedMs);
        setProtocol(activeSession.getProtocol() ?? 'N/D');
        setStatus('PRONTIDÃO DE EMISSÕES LIDA • PID 0101');
      }
    } catch (cause) {
      setStatus('FALHA NA LEITURA DE PRONTIDÃO');
      setError(cause instanceof Error ? cause.message : 'ERRO AO LER PID 0101');
    } finally {
      setReadinessScanning(false);
    }
  }

  async function scanFreezeFrameReport() {
    setError('');
    setFreezeFrameScanning(true);
    setStatus(mode === 'SIMULACAO' ? 'SIMULAÇÃO LOCAL: LENDO FREEZE FRAME MODE 02' : 'ECU: LENDO FREEZE FRAME MODE 02');
    try {
      const activeSession = mode === 'SIMULACAO' ? simulationSession : sessionRef.current;
      if (mode === 'REAL' && !canPollObd(getSharedObdStatus().lifecycle)) {
        throw new Error('DIAGNÓSTICO AINDA NÃO ESTÁ PRONTO. AGUARDE BLUETOOTH, ELM327 E ECU.');
      }
      if (!activeSession) throw new Error('CONECTE AO ELM327 ANTES DE LER O FREEZE FRAME');
      const result = mode === 'REAL'
        ? await autoTripService.withPollingPaused(() => readFreezeFrame(activeSession))
        : await readFreezeFrame(activeSession);
      setFreezeFrameSnapshot(result);
      if (!result.available || !result.dtc) {
        setStatus('FREEZE FRAME NÃO DISPONÍVEL');
        setError(result.reason ?? 'A ECU não forneceu um DTC/quadro com parâmetros interpretáveis.');
        return;
      }

      setStatus('FREEZE FRAME LIDO • ' + result.dtc + ' • ' + result.parameters.filter((item) => item.available).length + ' PIDs válidos');
      setTx('020200');
      setRx(result.responses['020200'] ?? '');
      if (mode === 'REAL') {
        const existing = await readDtcs(getBasePath());
        const matchingDtc = existing.find((item) => item.code === result.dtc);
        if (matchingDtc) {
          const updatedRecord: DtcRecord = {
            ...matchingDtc,
            freezeFrame: {
              frame: result.frame,
              dtc: result.dtc,
              rpm: result.rpm,
              coolantC: result.coolantC,
              speedKmh: result.speedKmh,
              engineLoadPercent: result.engineLoadPercent,
              stftPercent: result.stftPercent,
              ltftPercent: result.ltftPercent,
              mapKpa: result.mapKpa,
              intakeAirTempC: result.intakeAirTempC,
              throttlePercent: result.throttlePercent,
              capturedAt: result.capturedAt,
              parameters: result.parameters.map((item) => ({
                pid: item.pid, label: item.label, value: item.value, unit: item.unit,
                available: item.available, ...(item.reason ? { reason: item.reason } : {}),
              })),
            },
          };
          await recordDtc(getBasePath(), updatedRecord);
          updateAutoSaveState((state) => {
            state.dtcs = state.dtcs.map((item) => item.code === result.dtc ? updatedRecord : item);
          });
          await forceSaveOnObdEvent();
        }
      }
    } catch (cause) {
      setStatus('FALHA NA LEITURA DO FREEZE FRAME');
      setError(cause instanceof Error ? cause.message : 'ERRO AO LER MODE 02');
    } finally {
      setFreezeFrameScanning(false);
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
      const items = await discoverSupportedPids(activeSession);
      const discovered = Array.from(new Set(items.flatMap((item) => item.supportedPids))).sort();
      setSupportedPids(discovered);
      if (mode === 'REAL') {
        const activeProtocol = activeSession.getProtocol() ?? 'N/D';
        await recordDiscoveredPids(getBasePath(), discovered, activeProtocol);
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
      }
      setStatus(`DESCOBERTA CONCLUÍDA: ${discovered.length} PIDs`);
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
      // Extended freeze-frame acquisition is a separate user action to avoid
      // extra Mode 02 requests during every ordinary DTC scan.
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
            ...(previous?.freezeFrame ? { freezeFrame: previous.freezeFrame } : {}),
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
  const selectedPidDefinition = getPidDefinition(pid);
  const pidOptions = Object.values(PID_DATABASE).sort((a, b) => {
    const aSupported = supportedPids.includes(a.pid);
    const bSupported = supportedPids.includes(b.pid);
    if (aSupported !== bSupported) return aSupported ? -1 : 1;
    return a.pid.localeCompare(b.pid);
  });
  const filteredPidOptions = pidOptions.filter((definition) => {
    const query = pidPickerSearch.trim().toLocaleLowerCase();
    return !query || [definition.pid, definition.name, definition.description, definition.unit]
      .some((field) => String(field).toLocaleLowerCase().includes(query));
  });
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
    <SafeAreaView style={{flex:1,backgroundColor: cockpitTheme.background}} edges={["bottom","left","right"]}>
    <ScrollView contentContainerStyle={[styles.container, { paddingHorizontal: layout.horizontalPadding, alignItems: 'center' }]}>
      <View style={{ width: '100%', maxWidth: layout.maxContentWidth }}>
      <CockpitScreenHeader title="DIAGNÓSTICO OBD" subtitle="ECU • PIDs • DTC • EVIDÊNCIAS REAIS" />
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
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Selecionar PID para consulta manual"
          accessibilityHint="Abre o catálogo local de PIDs. Os mais recentemente descobertos e suportados pela ECU aparecem primeiro."
          style={[styles.input, styles.pidSelectInput]}
          onPress={() => { setPidPickerSearch(''); setPidPickerOpen(true); }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.pidSelectCode}>{pid}</Text>
            <Text style={styles.pidSelectName}>{selectedPidDefinition?.name ?? 'Selecione um PID do catálogo'}</Text>
          </View>
          <Text style={styles.pidSelectChevron}>⌄</Text>
        </TouchableOpacity>
        <Text style={styles.pidPickerHelp}>Toque no campo para pesquisar e selecionar um PID. A seleção não garante suporte da ECU.</Text>
        <TouchableOpacity style={styles.button} onPress={testPid} disabled={!storageReady || (mode === 'REAL' && !sessionRef.current)}>
          <Text style={styles.buttonText}>CONSULTAR PID</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.secondaryButton} onPress={scanReadiness} disabled={!storageReady || readinessScanning || (mode === 'REAL' && !sessionRef.current)}>
        <Text style={styles.secondaryButtonText}>{readinessScanning ? 'LENDO PRONTIDÃO...' : 'LER MONITORES DE EMISSÕES • PID 0101'}</Text>
      </TouchableOpacity>
      {!!readinessScan ? (
        <View style={styles.dtcPanel}>
          <Text style={styles.dtcTitle}>PRONTIDÃO DE EMISSÕES • DESDE A LIMPEZA DOS DTCs</Text>
          {!readinessScan.available || !readinessScan.report ? (
            <Text style={styles.dtcHint}>NÃO DISPONÍVEL: {readinessScan.reason ?? 'a ECU não retornou os quatro bytes válidos do PID 0101.'}</Text>
          ) : (
            <>
              <View style={styles.dtcRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dtcKind}>LUZ DE INJEÇÃO (MIL)</Text>
                  <Text style={styles.dtcCodes}>{readinessScan.report.milOn ? 'LIGADA' : 'APAGADA'}</Text>
                </View>
                <Text style={readinessScan.report.milOn ? styles.dtcUnavailable : styles.dtcAvailable}>{readinessScan.report.milOn ? 'ATENÇÃO' : 'OFF'}</Text>
              </View>
              <View style={styles.dtcRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dtcKind}>DTCs CONFIRMADOS INFORMADOS PELA ECU</Text>
                  <Text style={styles.dtcCodes}>{readinessScan.report.confirmedDtcCount}</Text>
                </View>
                <Text style={styles.dtcCodes}>{readinessScan.report.ignition === 'SPARK' ? 'CICLO OTTO' : 'COMPRESSÃO'}</Text>
              </View>
              <Text style={styles.dtcHint}>Monitores prontos: {readinessScan.report.completeCount}/{readinessScan.report.supportedCount}
                {readinessScan.report.readinessPercent == null ? ' • percentual N/D' : ' • ' + readinessScan.report.readinessPercent + '%'}
              </Text>
              {readinessScan.report.monitors.map((monitor) => (
                <View key={monitor.id} style={styles.dtcRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dtcKind}>{monitor.label}</Text>
                    <Text style={styles.dtcCodes}>{!monitor.supported ? 'A ECU não informou este monitor como suportado.' : monitor.complete ? 'Monitor concluído desde a última limpeza de DTCs.' : 'Monitor suportado, mas ainda incompleto.'}</Text>
                  </View>
                  <Text style={!monitor.supported ? styles.dtcNotSupported : monitor.complete ? styles.dtcAvailable : styles.dtcUnavailable}>
                    {!monitor.supported ? 'N/S' : monitor.complete ? 'PRONTO' : 'INCOMPLETO'}
                  </Text>
                </View>
              ))}
              <Text style={styles.dtcHint}>A prontidão não prova que todos os componentes estão bons. “Incompleto” pode ocorrer após apagar códigos ou desligar a bateria; a disponibilidade depende da ECU. Resposta: {readinessScan.response}</Text>
            </>
          )}
        </View>
      ) : null}
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
      <TouchableOpacity style={styles.secondaryButton} onPress={scanFreezeFrameReport} disabled={!storageReady || freezeFrameScanning || (mode === 'REAL' && !sessionRef.current)}>
        <Text style={styles.secondaryButtonText}>{freezeFrameScanning ? 'LENDO FREEZE FRAME...' : 'LER FREEZE FRAME COMPLETO • MODE 02'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={readAllDtcs} disabled={!storageReady || dtcScanning || (mode === 'REAL' && !sessionRef.current)}>
        <Text style={styles.secondaryButtonText}>{dtcScanning ? 'VARRENDO DTC 03/07/0A...' : 'VARREDURA COMPLETA DE DTC • 03 / 07 / 0A'}</Text>
      </TouchableOpacity>
      {!!freezeFrameSnapshot ? (
        <View style={styles.dtcPanel}>
          <Text style={styles.dtcTitle}>FREEZE FRAME • MODE 02 • QUADRO {freezeFrameSnapshot.frame}</Text>
          {!freezeFrameSnapshot.available || !freezeFrameSnapshot.parameters.some((item) => item.available) ? (
            <Text style={styles.dtcHint}>{freezeFrameSnapshot.reason ?? 'A ECU não forneceu um snapshot interpretável.'} Isso não significa ausência de falhas; alguns módulos não expõem todos os parâmetros de freeze frame.</Text>
          ) : (
            <>
              <Text style={styles.dtcHint}>DTC associado: {freezeFrameSnapshot.dtc ?? 'N/D'} • Captura: {new Date(freezeFrameSnapshot.capturedAt).toLocaleString()} • Os valores abaixo representam o instante registrado pela ECU, não a telemetria atual.</Text>
              {freezeFrameSnapshot.parameters.map((item) => (
                <View key={item.pid} style={styles.dtcRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dtcKind}>{item.pid} • {item.label}</Text>
                    <Text style={styles.dtcCodes}>{item.available && item.value != null ? item.value.toFixed(2) + (item.unit && item.unit !== 'N/D' ? ' ' + item.unit : '') : item.reason ?? 'NÃO DISPONÍVEL'}</Text>
                  </View>
                  <Text style={item.available ? styles.dtcAvailable : styles.dtcNotSupported}>{item.available ? 'LIDO' : 'N/D'}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      ) : null}
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
        {diagnostic.blockedStaleObservations > 0 ? (
          <Text style={styles.aiWarning}>DADOS ANTIGOS IGNORADOS: {diagnostic.blockedStaleObservations} leitura(s) REAL_OBD com mais de 10 segundos ou timestamp inválido. Atualize as leituras antes de interpretar o resultado.</Text>
        ) : null}
        {diagnostic.freshDiagnosticEvidenceGroups === 0 ? (
          <Text style={styles.aiWarning}>SEM EVIDÊNCIA PID ATUAL: não há grupo recente de STFT+LTFT (0106+0107) nem MAP (010B). Isso limita o diagnóstico por sensores; DTCs válidos são avaliados separadamente.</Text>
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
          <Text style={styles.label}>INTERPRETAÇÃO</Text><Text style={styles.value}>{parsed?.interpretation ?? 'N/D'}</Text>
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
    <Modal visible={pidPickerOpen} transparent animationType="slide" onRequestClose={() => setPidPickerOpen(false)}>
      <View style={styles.pidPickerOverlay}>
        <View style={styles.pidPickerCard}>
          <Text style={styles.pidPickerTitle}>SELECIONAR PID</Text>
          <Text style={styles.pidPickerSubtitle}>Catálogo local • PIDs descobertos na ECU aparecem primeiro</Text>
          <TextInput
            value={pidPickerSearch}
            onChangeText={setPidPickerSearch}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.pidPickerSearch}
            placeholder="Buscar por PID, nome ou unidade"
            placeholderTextColor={cockpitTheme.mutedLight}
          />
          <ScrollView style={styles.pidPickerList} keyboardShouldPersistTaps="handled">
            {filteredPidOptions.map((definition) => {
              const isSupported = supportedPids.includes(definition.pid);
              const supportKnown = supportedPids.length > 0;
              return (
                <TouchableOpacity
                  key={definition.pid}
                  accessibilityRole="button"
                  onPress={() => { setPid(definition.pid); setPidPickerOpen(false); }}
                  style={styles.pidPickerItem}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pidPickerItemTitle}>{definition.pid} • {definition.name}</Text>
                    <Text style={styles.pidPickerItemDescription}>{definition.description}</Text>
                    <Text style={styles.pidPickerItemUnit}>{definition.unit} • {definition.classification}</Text>
                  </View>
                  <Text style={isSupported ? styles.dtcAvailable : supportKnown ? styles.dtcNotSupported : styles.muted}>
                    {isSupported ? 'SUPORTADO' : supportKnown ? 'NÃO LISTADO' : 'NÃO VERIFICADO'}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {!filteredPidOptions.length ? <Text style={styles.dtcHint}>Nenhum PID do catálogo corresponde à busca.</Text> : null}
          </ScrollView>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setPidPickerOpen(false)}>
            <Text style={styles.secondaryButtonText}>FECHAR LISTA</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingVertical: 14, backgroundColor: cockpitTheme.background },
  title: { fontSize: 22, fontWeight: '900', color: cockpitTheme.accent, letterSpacing: 0.5, marginBottom: 6 },
  status: { color: cockpitTheme.accent, fontWeight: '700', marginBottom: 6 },
  protocol: { color: cockpitTheme.textSecondary, fontWeight: '600', marginBottom: 8 },
  connectionSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  connectionItem: { flexGrow: 1, flexBasis: 110, minWidth: 110, backgroundColor: cockpitTheme.surface, borderRadius: 14, borderWidth: 1, borderColor: cockpitTheme.border, padding: 9 },
  connectionLabel: { color: cockpitTheme.mutedLight, fontSize: 9, fontWeight: '900' },
  connectionValue: { color: cockpitTheme.textStrong, fontSize: 12, fontWeight: '900', marginTop: 3 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  rowLandscape: { alignItems: 'stretch' },
  flexButton: { flex: 1 },
  tripPanelLandscape: { padding: 14 },
  tripGridLandscape: { flexWrap: 'nowrap', gap: 12 },
  commandCardLandscape: { maxWidth: 620 },
  modeButton: { flex: 1, padding: 10, borderRadius: 7, borderWidth: 1, borderColor: cockpitTheme.border, alignItems: 'center' },
  modeText: { color: cockpitTheme.textStrong, fontWeight: '900', fontSize: 11 },
  active: { backgroundColor: cockpitTheme.primarySoft, borderColor: cockpitTheme.primary },
  simActive: { backgroundColor: cockpitTheme.warningSurface, borderColor: cockpitTheme.warning },
  commandCard: { backgroundColor: cockpitTheme.surface, borderRadius: 14, padding: 11, marginBottom: 10, borderWidth: 1, borderColor: cockpitTheme.border },
  commandTitle: { color: cockpitTheme.textStrong, fontSize: 12, fontWeight: '900', marginBottom: 7 },
  button: { backgroundColor: cockpitTheme.primary, borderRadius: 7, padding: 13, alignItems: 'center', marginBottom: 9 },
  secondaryButton: { backgroundColor: cockpitTheme.surface, borderColor: cockpitTheme.border, borderWidth: 1, borderRadius: 7, padding: 12, alignItems: 'center', marginBottom: 9 },
  secondaryButtonText: { color: cockpitTheme.textStrong, fontWeight: '700' },
  disconnect: { backgroundColor: cockpitTheme.surfaceAlt },
  buttonText: { color: cockpitTheme.text, fontWeight: '700' },
  device: { backgroundColor: cockpitTheme.surface, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: cockpitTheme.border },
  selected: { borderColor: cockpitTheme.primary, borderWidth: 2 },
  deviceName: { fontWeight: '700', color: cockpitTheme.textStrong },
  warning: { color: cockpitTheme.warning, marginBottom: 12 },
  input: { backgroundColor: cockpitTheme.surface, borderColor: cockpitTheme.border, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12, color: cockpitTheme.textStrong },
  pidSelectInput: { flexDirection: 'row', alignItems: 'center', minHeight: 58 },
  pidSelectCode: { color: cockpitTheme.accent, fontSize: 13, fontWeight: '900' },
  pidSelectName: { color: cockpitTheme.textSecondary, fontSize: 10, marginTop: 2 },
  pidSelectChevron: { color: cockpitTheme.accent, fontSize: 24, fontWeight: '900', paddingHorizontal: 5 },
  pidPickerHelp: { color: cockpitTheme.mutedLight, fontSize: 9, marginTop: -7, marginBottom: 10 },
  pidPickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end', padding: 12 },
  pidPickerCard: { maxHeight: '88%', backgroundColor: cockpitTheme.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: cockpitTheme.border },
  pidPickerTitle: { color: cockpitTheme.accent, fontSize: 16, fontWeight: '900' },
  pidPickerSubtitle: { color: cockpitTheme.mutedLight, fontSize: 10, marginTop: 4, marginBottom: 10 },
  pidPickerSearch: { backgroundColor: cockpitTheme.surfaceAlt, color: cockpitTheme.textStrong, borderRadius: 10, borderWidth: 1, borderColor: cockpitTheme.border, padding: 12, marginBottom: 8 },
  pidPickerList: { maxHeight: 430 },
  pidPickerItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: cockpitTheme.borderSubtle },
  pidPickerItemTitle: { color: cockpitTheme.textStrong, fontSize: 11, fontWeight: '900' },
  pidPickerItemDescription: { color: cockpitTheme.textSecondary, fontSize: 9, lineHeight: 13, marginTop: 3 },
  pidPickerItemUnit: { color: cockpitTheme.accent, fontSize: 8, marginTop: 3 },
  dtcNotSupported: { color: cockpitTheme.mutedLight, fontSize: 8, fontWeight: '800' },
  tripPanel: { backgroundColor: cockpitTheme.surface, borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: cockpitTheme.border },
  tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tripTitle: { color: cockpitTheme.textStrong, fontWeight: '900', fontSize: 14 },
  tripGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tripMetric: { width: '48%', marginBottom: 8 },
  tripMetricLandscape: { width: '23%', marginBottom: 0 },
  tripLabel: { color: cockpitTheme.mutedLight, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  tripValue: { color: cockpitTheme.textStrong, fontWeight: '800', fontSize: 16, marginTop: 2 },
  live: { color: cockpitTheme.success, fontWeight: '900', fontSize: 10 },
  muted: { color: cockpitTheme.mutedLight, fontWeight: '900', fontSize: 10 },
  tripHelp: { color: cockpitTheme.mutedLight, fontSize: 11, marginTop: 2 },
  aiPanel: { backgroundColor: cockpitTheme.surface, borderRadius: 14, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: cockpitTheme.border },
  aiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  aiTitle: { color: cockpitTheme.accent, fontWeight: '900', fontSize: 14 },
  aiEngine: { color: cockpitTheme.mutedLight, fontSize: 9, fontWeight: '800' },
  hypothesis: { borderTopWidth: 1, borderTopColor: cockpitTheme.borderSubtle, paddingTop: 9, marginTop: 8 },
  hypothesisTitle: { color: cockpitTheme.textStrong, fontWeight: '900', fontSize: 14 },
  hypothesisConfidence: { color: cockpitTheme.accent, fontWeight: '800', fontSize: 11, marginTop: 3 },
  aiLine: { color: cockpitTheme.textSecondary, fontSize: 11, marginTop: 4 },
  aiMuted: { color: cockpitTheme.mutedLight, fontSize: 11 },
  aiWarning: { color: cockpitTheme.warning, fontWeight: '800', fontSize: 11, marginTop: 9 },
  aiDisclaimer: { color: cockpitTheme.mutedLight, fontSize: 10, marginTop: 9 },
  dtcPanel: { backgroundColor: cockpitTheme.surface, borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: cockpitTheme.border },
  dtcTitle: { color: cockpitTheme.accent, fontSize: 13, fontWeight: '900', marginBottom: 6 },
  dtcRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: cockpitTheme.borderSubtle, paddingVertical: 8 },
  dtcKind: { color: cockpitTheme.textSecondary, flexShrink: 1, fontSize: 10, fontWeight: '900' },
  dtcCodes: { color: cockpitTheme.mutedLight, fontSize: 10, marginTop: 3 },
  dtcAvailable: { color: cockpitTheme.success, fontSize: 8, fontWeight: '900' },
  dtcUnavailable: { color: cockpitTheme.warning, fontSize: 8, fontWeight: '900' },
  dtcHint: { color: cockpitTheme.mutedLight, fontSize: 9, lineHeight: 14, marginTop: 7 },
  dtcDetails: { marginTop: 10, borderTopWidth: 1, borderTopColor: cockpitTheme.borderSubtle, paddingTop: 8 },
  dtcDetailRow: { flexDirection: 'row', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: cockpitTheme.borderSubtle },
  dtcDetailCode: { color: cockpitTheme.accent, fontWeight: '900', fontSize: 12, width: 52 },
  dtcDetailName: { color: cockpitTheme.textStrong, fontWeight: '900', fontSize: 11 },
  dtcDetailText: { color: cockpitTheme.mutedLight, fontSize: 9, lineHeight: 14, marginTop: 2 },
  pidPanel: { backgroundColor: cockpitTheme.surface, borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: cockpitTheme.border },
  pidRow: { flexDirection: 'row', gap: 9, paddingVertical: 8, borderTopWidth: 1, borderTopColor: cockpitTheme.borderSubtle },
  pidCode: { color: cockpitTheme.accent, fontWeight: '900', fontSize: 11, width: 42 },
  pidName: { color: cockpitTheme.textStrong, fontWeight: '900', fontSize: 11 },
  pidDescription: { color: cockpitTheme.mutedLight, fontSize: 9, lineHeight: 14, marginTop: 2 },
  pidMeta: { color: cockpitTheme.accent, fontSize: 8, fontWeight: '800', marginTop: 3 },
  panel: { backgroundColor: cockpitTheme.surfaceAlt, borderRadius: 14, padding: 16, marginTop: 8 },
  label: { color: cockpitTheme.accent, marginTop: 8 },
  value: { color: cockpitTheme.text, fontSize: 16, marginTop: 3 },
  error: { color: cockpitTheme.danger, marginTop: 16 },
});