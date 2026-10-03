import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Elm327Session } from '../src/obd/elm327';
import { parseDtcResponse, parsePidResponse } from '../src/obd/parser';
import { SimulatedObdTransport } from '../src/obd/simulatedTransport';
import { BluetoothDeviceInfo } from '../src/obd/bluetoothClassicTransport';
import { createRealElmSession, discoverPairedDevices } from '../src/obd/bluetoothManager';
import { discoverSupportedPids, KNOWN_PIDS } from '../src/obd/pidScanner';
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
  const sessionRef = useRef<Elm327Session | null>(null);
  const autoSaveReadyRef = useRef(false);

  const simulationSession = useMemo(
    () => new Elm327Session(new SimulatedObdTransport()),
    [],
  );

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
      const activeSession = sessionRef.current;
      sessionRef.current = null;
      stopObdSessionCheckpoint();

      if (!autoSaveReadyRef.current) return;

      void (async () => {
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
      setStatus(connection.protocol ? 'ELM RESPONDENDO' : 'ELM RESPONDENDO / PROTOCOLO N/D');
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
      await activeSession?.close();
      updateAutoSaveState((state) => {
        state.obd = { ...state.obd, connected: false };
      });
      await forceSaveOnObdEvent();
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
  panel: { backgroundColor: '#1f2937', borderRadius: 14, padding: 16, marginTop: 8 },
  label: { color: '#93c5fd', marginTop: 8 },
  value: { color: '#f8fafc', fontSize: 16, marginTop: 3 },
  error: { color: '#c2410c', marginTop: 16 },
});