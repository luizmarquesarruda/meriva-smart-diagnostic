import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Elm327Session } from '../src/obd/elm327';
import { parseDtcResponse, parsePidResponse } from '../src/obd/parser';
import { SimulatedObdTransport } from '../src/obd/simulatedTransport';
import { BluetoothDeviceInfo } from '../src/obd/bluetoothClassicTransport';
import { createRealElmSession, discoverPairedDevices } from '../src/obd/bluetoothManager';
import { discoverSupportedPids, KNOWN_PIDS } from '../src/obd/pidScanner';
import { getSharedObdConnection, setSharedObdConnection, subscribeSharedObd, disconnectSharedObd } from '../src/obd/sharedConnection';
import { autoTripService } from '../src/trip/autoTripService';
import { getMidLayout } from '../src/ui/midLayout';

import { readAppSettings, writeAppSettings } from '../src/database/appSettings';

import { DtcRecord, readDtcs, recordDtc } from '../src/database/dtcManager';
import {
  initAutoSave,
  startObdSessionCheckpoint,
  stopObdSessionCheckpoint,
  updateAutoSaveState,
  getAutoSaveState,
} from '../src/meriva/autosaveManager';
import { forceSaveOnObdEvent, registerObdQuery } from '../src/meriva/autosaveIntegration';

type Mode = 'REAL' | 'SIMULACAO';

function getBasePath(): string {
  return `${FileSystem.documentDirectory}MERIVA_SMART`;
}

export default function LaboratorioScreen() {
  const windowSize = useWindowDimensions();
  const layout = getMidLayout(windowSize);
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
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
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
      if (!connection) return;
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
        stopObdSessionCheckpoint();
        try {
          if (getSharedObdConnection()?.session !== activeSession) await activeSession?.close();
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
      const savedAddress = settings.selectedAdapterAddress?.toUpperCase() ?? '';
      setSelectedAddress('');
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
      sessionRef.current = connection.session;
      await setSharedObdConnection({
        session: connection.session,
        device,
        protocol: connection.protocol,
        supportedPids: connection.supportedPids,
        ecuValidated: connection.ecuValidated,
        getDiagnosticsText: () => connection.session.getTransportDiagnosticsText(),
      });
      setProtocol(connection.protocol ?? 'N/D');
      startObdSessionCheckpoint();
      updateAutoSaveState((state) => {
        state.obd = {
          connected: true,
          adapterName: device.name,
          protocol: connection.protocol ?? undefined,
          lastConnectedAt: new Date().toISOString(),
        };

        if (
          connection.pidDiscoverySource === 'ECU' &&
          connection.protocol &&
          connection.supportedPids.length > 0
        ) {
          state.pidDiscovery = {
            supportedPids: connection.supportedPids,
            protocol: connection.protocol,
            discoveredAt: new Date().toISOString(),
          };
        }
      });

      const settings = await readAppSettings(getBasePath());
      await writeAppSettings(getBasePath(), {
        ...settings,
        selectedAdapterAddress: device.address,
      });

      setStatus(
        connection.pidDiscoverySource === 'CACHE'
          ? 'ELM RESPONDENDO / PIDs CARREGADOS DO JSON'
          : 'ELM RESPONDENDO / PIDs DESCOBERTOS E SALVOS',
      );
      // A conexão já fez a descoberta. Não repita a varredura imediatamente.
      const discovered = connection.supportedPids;
      setSupportedPids(discovered);
      const fuelSupported = discovered.includes('015E');
      setTripFuelSupported(fuelSupported);
      setTripActive(true);
      setStatus(
        fuelSupported
          ? connection.protocol ? 'VIAGEM AUTOMÁTICA / GPS + PID 015E' : 'VIAGEM AUTOMÁTICA / PROTOCOLO N/D'
          : 'VIAGEM AUTOMÁTICA / GPS, SEM PID 015E',
      );
    } catch (cause) {
      const failedSession = sessionRef.current;
      sessionRef.current = null;
      stopObdSessionCheckpoint();
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
    stopObdSessionCheckpoint();

    try {
      if (getSharedObdConnection()?.session === activeSession) {
        await disconnectSharedObd();
      } else {
        await activeSession?.close();
      }
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
      if (!activeSession) throw new Error('CONECTE AO ELM327 ANTES DE DESCOBRIR PIDs');
      const items = await discoverSupportedPids(activeSession);
      const discovered = Array.from(new Set(items.flatMap((item) => item.supportedPids))).sort();
      setSupportedPids(discovered);
      if (mode === 'REAL') {
        const activeProtocol = activeSession.getProtocol();
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

  async function readCurrentDtcs() {
    setError('');
    setStatus(mode === 'SIMULACAO' ? 'SIMULAÇÃO LOCAL: LENDO DTC' : 'ECU: LENDO DTC');
    try {
      const activeSession = mode === 'SIMULACAO' ? simulationSession : sessionRef.current;
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
          <View style={[styles.tripMetric, layout.landscape && styles.tripMetricLandscape]}><Text style={styles.tripLabel}>PID 015E</Text><Text style={styles.tripValue}>{tripFuelSupported === null ? 'N/D' : tripFuelSupported ? 'OK' : 'NÃO'}</Text></View>
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
      <TouchableOpacity style={styles.secondaryButton} onPress={readCurrentDtcs} disabled={!storageReady || (mode === 'REAL' && !sessionRef.current)}>
        <Text style={styles.secondaryButtonText}>LER DTC ATUAIS</Text>
      </TouchableOpacity>

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
          <Text style={styles.label}>DTC ATUAIS</Text><Text style={styles.value}>{dtcCodes.length ? dtcCodes.join(', ') : 'NENHUM'}</Text>
          <Text style={styles.label}>PIDs CONHECIDOS SUPORTADOS</Text><Text style={styles.value}>{knownSupported.length ? knownSupported.join(', ') : 'N/D'}</Text>
          <Text style={styles.label}>TOTAL DE PIDs DESCOBERTOS</Text><Text style={styles.value}>{supportedPids.length}</Text>
        </View>
      ) : null}

      {!!error && <Text style={styles.error}>{error}</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingVertical: 16, backgroundColor: '#eef3fb' },
  title: { fontSize: 22, fontWeight: '900', color: '#1557a6', letterSpacing: 0.5, marginBottom: 6 },
  status: { color: '#2563eb', fontWeight: '700', marginBottom: 6 },
  protocol: { color: '#475569', fontWeight: '600', marginBottom: 8 },
  connectionSummary: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  connectionItem: { flex: 1, backgroundColor: '#fff', borderRadius: 7, borderWidth: 1, borderColor: '#d1d9e2', padding: 9 },
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
  panel: { backgroundColor: '#1f2937', borderRadius: 14, padding: 16, marginTop: 8 },
  label: { color: '#93c5fd', marginTop: 8 },
  value: { color: '#f8fafc', fontSize: 16, marginTop: 3 },
  error: { color: '#c2410c', marginTop: 16 },
});