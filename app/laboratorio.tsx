import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import { Elm327Session } from '../src/obd/elm327';
import { parseDtcResponse, parsePidResponse } from '../src/obd/parser';
import { isValidDtcResponseForService } from '../src/obd/dtcParser';
import { SimulatedObdTransport } from '../src/obd/simulatedTransport';
import { BluetoothDeviceInfo } from '../src/obd/bluetoothClassicTransport';
import { createRealElmSession, discoverPairedDevices } from '../src/obd/bluetoothManager';
import { canPollObd } from '../src/obd/bluetoothState';
import { discoverSupportedPids, KNOWN_PIDS } from '../src/obd/pidScanner';
import { getPidDefinition } from '../src/obd/pidDefinition';
import { getDtcDefinition } from '../src/obd/dtcDefinition';
import { getSharedObdConnection, getSharedObdStatus, setSharedObdConnection, subscribeSharedObd, disconnectSharedObd } from '../src/obd/sharedConnection';
import { autoTripService } from '../src/trip/autoTripService';
import { getMidLayout } from '../src/ui/midLayout';
import { COLORS, SCREEN_TITLE_STYLE } from '../src/ui/theme';
import { scanDtcServices, readFreezeFrame, type DtcServiceScan } from '../src/obd/dtcScanner';
import { getLiveSeries, getVehicleConditionSnapshot } from '../src/obd/liveTelemetry';
import { decodeFormula } from '../src/obd/formulaEngine';

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
  const [queriedPid, setQueriedPid] = useState('010C');
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
      setFuelUsedL(trip.fuelUsedL);
      if (trip.error) setError(trip.error);
    });

    const unsubscribe = subscribeSharedObd((connection) => {
      if (!connection) {
        sessionRef.current = null;
        return;
      }
      sessionRef.current = connection.session;
      setProtocol(connection.protocol ?? 'N/D');
      if (connection.supportedPids?.length) setSupportedPids(connection.supportedPids);
      setStatus('ELM RESPONDENDO / CONEXÃO AUTOMÁTICA');
    });
    const existing = getSharedObdConnection();
    if (existing) {
      sessionRef.current = existing.session;
      setProtocol(existing.protocol ?? 'N/D');
      if (existing.supportedPids?.length) setSupportedPids(existing.supportedPids);
    }

    let mounted = true;

    void initAutoSave(getBasePath())
      .then((state) => {
        autoSaveReadyRef.current = true;
        if (mounted) {
          setStorageReady(true);
          setProtocol(state.obd.protocol ?? 'N/D');
          const persistedPids = state.pidDiscovery?.supportedPids ?? [];
          if (persistedPids.length) setSupportedPids((current) => current.length ? current : persistedPids);
          setStatus(getSharedObdConnection() ? 'ECU CONECTADA / DIAGNÓSTICO DISPONÍVEL' : 'AGUARDANDO CONEXÃO ELM327');
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
      setStatus('ECU VALIDADA / DIAGNÓSTICO DISPONÍVEL');
    } catch (cause) {
      const failedSession = sessionRef.current;
      sessionRef.current = null;
      try {
        await failedSession?.close();
      } catch {
        // sessão já encerrada ou transporte indisponível
      }
      setProtocol('N/D');
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
      const normalizedPid = pid.replace(/\s/g, '').toUpperCase();
      if (!/^01[0-9A-F]{2}$/.test(normalizedPid)) {
        throw new Error('PID inválido. Use um código Mode 01 com quatro dígitos hexadecimais, por exemplo 010C.');
      }
      setPid(normalizedPid);
      const activeSession = mode === 'SIMULACAO' ? simulationSession : sessionRef.current;
      if (mode === 'REAL' && !canPollObd(getSharedObdStatus().lifecycle)) {
        throw new Error('DIAGNÓSTICO AINDA NÃO ESTÁ PRONTO. AGUARDE BLUETOOTH, ELM327 E ECU.');
      }
      if (!activeSession) throw new Error('CONECTE AO ELM327 ANTES DE TESTAR O PID');
      const result = mode === 'REAL'
        ? await autoTripService.withPollingPaused(() => activeSession.queryPid(normalizedPid))
        : await activeSession.queryPid(normalizedPid);

      await registerObdQuery(getBasePath(), result, mode);

      setTx(result.tx);
      setRx(result.rx);
      setQueriedPid(normalizedPid);
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
      setTx(result.command);
      setRx(result.response);
      setElapsedMs(result.elapsedMs);
      setProtocol(activeSession.getProtocol() ?? 'N/D');
      if (result.status !== 'OK') {
        throw new Error(result.errorMessage || 'ECU não confirmou uma resposta válida ao comando de leitura de DTC.');
      }
      if (!isValidDtcResponseForService('03', result.response)) {
        throw new Error('RESPOSTA DTC INVÁLIDA OU INCOMPLETA; não é possível confirmar ausência de falhas.');
      }
      const codes = parseDtcResponse(result.response);
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

  const parsed = rx ? parsePidResponse(queriedPid, rx) : null;
  const knownSupported = supportedPids.filter((value) => KNOWN_PIDS.includes(value));
  const identifiedSupportedPids = supportedPids.map((value) => ({ pid: value, definition: getPidDefinition(value) }));
  const formulaBoundaryChecks = [
    { pid: '0106', name: 'Ajuste de combustível — curto prazo', formula: 'FUEL_TRIM', bytes: [0xFF], expected: '99,21875%' },
    { pid: '0107', name: 'Ajuste de combustível — longo prazo', formula: 'FUEL_TRIM', bytes: [0xFF], expected: '99,21875%' },
    { pid: '012D', name: 'Erro do EGR', formula: 'FUEL_TRIM', bytes: [0xFF], expected: '99,21875%' },
    { pid: '015D', name: 'Tempo de injeção', formula: 'INJECTION_TIMING', bytes: [0xFF, 0xFF], expected: '301,9921875°' },
  ].map((item) => ({ ...item, result: decodeFormula(item.formula, item.pid, item.bytes) }));
  const diagnosticState = getAutoSaveState();
  const diagnosticObservations = ['0106', '0107', '010B'].flatMap((pid) =>
    getLiveSeries(pid).slice(-5).map((reading): PidObservation => ({
      pid: reading.pid,
      name: reading.name,
      value: reading.value,
      unit: reading.unit,
      source: 'REAL_OBD',
      timestamp: reading.timestamp,
      confidence: 'GOOD',
    })),
  );
  const diagnostic: DiagnosticResult = runLocalDiagnostic({
    observations: diagnosticObservations,
    dtcs: diagnosticState.dtcs,
    condition: getVehicleConditionSnapshot().condition,
  });

  return (
    <SafeAreaView style={{flex:1,backgroundColor:COLORS.screen}} edges={["top","bottom","left","right"]}>
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
          <TouchableOpacity style={[styles.button, styles.disconnect, !sessionRef.current && styles.disabledButton, layout.landscape && styles.flexButton]} onPress={() => void disconnectReal()} disabled={!sessionRef.current}>
            <Text style={styles.buttonText}>{sessionRef.current ? 'DESCONECTAR ELM327' : 'ELM327 DESCONECTADO'}</Text>
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
          <Text style={styles.dtcTitle}>PIDs REGISTRADOS / DESCOBERTOS</Text>
          <Text style={styles.pidDescription}>Toque em um código para preencher a consulta manual. A lista pode vir da descoberta atual ou do cache salvo; confirme a resposta real antes de tratar o PID como suportado na sessão atual.</Text>
          {identifiedSupportedPids.map(({ pid: value, definition }) => (
            <TouchableOpacity key={value} style={styles.pidRow} onPress={() => setPid(value)} accessibilityRole="button" accessibilityLabel={'Usar PID '+value+' na consulta manual'}>
              <Text style={styles.pidCode}>{value}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.pidName}>{definition?.name ?? 'PID sem definição local'}</Text>
                <Text style={styles.pidDescription}>{definition?.description ?? 'A ECU informou este PID como suportado, mas o catálogo local ainda não possui decodificação deste identificador.'}</Text>
                <Text style={styles.pidMeta}>{definition ? definition.unit + ' • ' + definition.classification : 'DESCONHECIDO'}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      <View style={styles.formulaPanel}>
        <View style={styles.formulaHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dtcTitle}>INTEGRIDADE DO DECODIFICADOR</Text>
            <Text style={styles.formulaTitle} accessibilityRole="header">Validação de fórmulas PID</Text>
          </View>
          <Text style={styles.formulaBadge}>4 LIMITES CORRIGIDOS</Text>
        </View>
        <Text style={styles.formulaDescription}>Casos matemáticos com bytes-limite 0xFF. Não são leituras do veículo e não comprovam suporte da ECU.</Text>
        {formulaBoundaryChecks.map((item) => (
          <View key={item.pid} style={styles.formulaRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pidName}>PID {item.pid}</Text>
              <Text style={styles.pidDescription}>{item.name}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.formulaValue}>{item.expected}</Text>
              <Text style={item.result.valid ? styles.dtcAvailable : styles.dtcUnavailable}>{item.result.valid ? 'LIMITE VÁLIDO' : 'FALHA'}</Text>
            </View>
          </View>
        ))}
        <Text style={styles.formulaDescription}>Bytes inválidos e respostas incompletas são rejeitados. A conexão física Bluetooth/ECU é verificada separadamente.</Text>
      </View>
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
          <Text style={styles.aiMuted}>{diagnostic.evaluatedRuleGroups === 0 ? 'DADOS INSUFICIENTES: conecte a ECU e aguarde pelo menos três leituras recentes e distintas dos PIDs necessários. A ausência de hipótese não significa sistema normal.' : 'Nenhuma hipótese acionada pelas regras avaliadas. Isso não certifica a saúde total do veículo.'}</Text>
        ) : diagnostic.hypotheses.map((hypothesis) => (
          <View key={hypothesis.id} style={styles.hypothesis}>
            <Text style={styles.hypothesisTitle}>{hypothesis.label}</Text>
            <Text style={styles.hypothesisConfidence}>NÍVEL QUALITATIVO: {hypothesis.confidence} · PONTUAÇÃO HEURÍSTICA: {Math.round(hypothesis.score * 100)}/100</Text>
            {hypothesis.evidence.map((item, index) => (
              <Text key={`e-${hypothesis.id}-${index}`} style={styles.aiLine}>• Evidência: {item.text}</Text>
            ))}
            {hypothesis.nextTests.map((item) => <Text key={`t-${hypothesis.id}-${item}`} style={styles.aiLine}>→ Próximo teste: {item}</Text>)}
          </View>
        ))}
        {diagnostic.blockedSimulationSamples > 0 ? (
          <Text style={styles.aiWarning}>SIMULAÇÃO BLOQUEADA: {diagnostic.blockedSimulationSamples} amostra(s) excluída(s).</Text>
        ) : null}
        {diagnostic.blockedStaleSamples > 0 ? <Text style={styles.aiWarning}>LEITURAS ANTIGAS/FUTURAS BLOQUEADAS: {diagnostic.blockedStaleSamples}</Text> : null}
        {diagnostic.blockedInvalidSamples > 0 ? <Text style={styles.aiWarning}>LEITURAS INVÁLIDAS/IMPLAUSÍVEIS BLOQUEADAS: {diagnostic.blockedInvalidSamples}</Text> : null}
        {diagnostic.blockedNonLiveSamples > 0 ? <Text style={styles.aiWarning}>DADOS IMPORTADOS/REFERÊNCIA BLOQUEADOS: {diagnostic.blockedNonLiveSamples}</Text> : null}
        {diagnostic.blockedDuplicateSamples > 0 ? <Text style={styles.aiWarning}>AMOSTRAS COM TIMESTAMP DUPLICADO BLOQUEADAS: {diagnostic.blockedDuplicateSamples}</Text> : null}
        {diagnostic.blockedStaleDtcs > 0 ? <Text style={styles.aiWarning}>DTCs COM ÚLTIMA OBSERVAÇÃO ANTIGA/FUTURA BLOQUEADOS: {diagnostic.blockedStaleDtcs}</Text> : null}
        <Text style={styles.aiLine}>AMOSTRAS ATUAIS ACEITAS: {diagnostic.acceptedLiveSamples} · GRUPOS AVALIADOS: {diagnostic.evaluatedRuleGroups}</Text>
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
          {parsed?.interpretation ? (
            <>
              <Text style={styles.label}>INTERPRETAÇÃO</Text>
              <Text style={styles.value}>{parsed.interpretation}</Text>
            </>
          ) : null}
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
  container: { flexGrow: 1, paddingTop: 16, paddingBottom: 30, backgroundColor: COLORS.screen },
  title: { ...SCREEN_TITLE_STYLE, marginBottom: 6 },
  status: { color: COLORS.primary, fontWeight: '700', marginBottom: 6 },
  protocol: { color: COLORS.textMuted, fontWeight: '600', marginBottom: 8 },
  connectionSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  connectionItem: { flexGrow: 1, flexBasis: 110, minWidth: 110, backgroundColor: COLORS.surface, borderRadius: 7, borderWidth: 1, borderColor: COLORS.border, padding: 9 },
  connectionLabel: { color: COLORS.textSubtle, fontSize: 9, fontWeight: '900' },
  connectionValue: { color: COLORS.text, fontSize: 12, fontWeight: '900', marginTop: 3 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  rowLandscape: { alignItems: 'stretch' },
  flexButton: { flex: 1 },
  commandCardLandscape: { maxWidth: 620 },
  modeButton: { flex: 1, padding: 10, borderRadius: 7, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  modeText: { color: COLORS.text, fontWeight: '900', fontSize: 11 },
  active: { backgroundColor: '#152a45', borderColor: '#2563eb' },
  simActive: { backgroundColor: '#352b16', borderColor: COLORS.warning },
  commandCard: { backgroundColor: COLORS.surface, borderRadius: 8, padding: 11, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  commandTitle: { color: COLORS.text, fontSize: 12, fontWeight: '900', marginBottom: 7 },
  button: { backgroundColor: '#1557a6', borderRadius: 7, padding: 13, alignItems: 'center', marginBottom: 9 },
  secondaryButton: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: 7, padding: 12, alignItems: 'center', marginBottom: 9 },
  secondaryButtonText: { color: COLORS.text, fontWeight: '700' },
  disconnect: { backgroundColor: '#64748b' },
  disabledButton: { backgroundColor: '#26374b', borderWidth: 1, borderColor: COLORS.border, opacity: 0.72 },
  buttonText: { color: COLORS.textStrong, fontWeight: '700' },
  device: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  selected: { borderColor: '#2563eb', borderWidth: 2 },
  deviceName: { fontWeight: '700', color: COLORS.text },
  warning: { color: COLORS.warning, marginBottom: 12 },
  input: { backgroundColor: COLORS.surface, borderColor: COLORS.border, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12, color: COLORS.text },
  aiPanel: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: '#315579' },
  aiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  aiTitle: { color: COLORS.accent, fontWeight: '900', fontSize: 14 },
  aiEngine: { color: COLORS.textSubtle, fontSize: 9, fontWeight: '800' },
  hypothesis: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 9, marginTop: 8 },
  hypothesisTitle: { color: COLORS.text, fontWeight: '900', fontSize: 14 },
  hypothesisConfidence: { color: COLORS.primary, fontWeight: '800', fontSize: 11, marginTop: 3 },
  aiLine: { color: '#c2d0df', fontSize: 11, marginTop: 4 },
  aiMuted: { color: COLORS.textSubtle, fontSize: 11 },
  aiWarning: { color: COLORS.warning, fontWeight: '800', fontSize: 11, marginTop: 9 },
  aiDisclaimer: { color: COLORS.textSubtle, fontSize: 10, marginTop: 9 },
  dtcPanel: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  dtcTitle: { color: COLORS.accent, fontSize: 13, fontWeight: '900', marginBottom: 6 },
  dtcRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 8 },
  dtcKind: { color: '#c2d0df', flexShrink: 1, fontSize: 10, fontWeight: '900' },
  dtcCodes: { color: COLORS.textSubtle, fontSize: 10, marginTop: 3 },
  dtcAvailable: { color: COLORS.success, fontSize: 8, fontWeight: '900' },
  dtcUnavailable: { color: COLORS.warning, fontSize: 8, fontWeight: '900' },
  dtcHint: { color: COLORS.textSubtle, fontSize: 9, lineHeight: 14, marginTop: 7 },
  dtcDetails: { marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8 },
  dtcDetailRow: { flexDirection: 'row', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#203854' },
  dtcDetailCode: { color: COLORS.accent, fontWeight: '900', fontSize: 12, width: 52 },
  dtcDetailName: { color: COLORS.text, fontWeight: '900', fontSize: 11 },
  dtcDetailText: { color: COLORS.textSubtle, fontSize: 9, lineHeight: 14, marginTop: 2 },
  pidPanel: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#315579' },
  pidRow: { flexDirection: 'row', gap: 9, paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  pidCode: { color: COLORS.accent, fontWeight: '900', fontSize: 11, width: 42 },
  pidName: { color: COLORS.text, fontWeight: '900', fontSize: 11 },
  pidDescription: { color: COLORS.textSubtle, fontSize: 9, lineHeight: 14, marginTop: 2 },
  pidMeta: { color: COLORS.primary, fontSize: 8, fontWeight: '800', marginTop: 3 },
  formulaPanel: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: '#315579' },
  formulaHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 7 },
  formulaTitle: { color: COLORS.textStrong, fontSize: 16, fontWeight: '900', marginTop: 3 },
  formulaBadge: { color: COLORS.success, fontSize: 8, fontWeight: '900', borderWidth: 1, borderColor: '#246747', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5, overflow: 'hidden' },
  formulaDescription: { color: COLORS.textSubtle, fontSize: 10, lineHeight: 15, marginTop: 5, marginBottom: 7 },
  formulaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingVertical: 9 },
  formulaValue: { color: COLORS.text, fontSize: 11, fontWeight: '900', marginBottom: 3 },
  panel: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginTop: 8 },
  label: { color: COLORS.accent, marginTop: 8 },
  value: { color: '#f8fafc', fontSize: 16, marginTop: 3 },
  error: { color: COLORS.danger, marginTop: 16 },
});