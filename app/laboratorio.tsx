import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Elm327Session, ObdTransport } from '../src/obd/elm327';
import { parsePidResponse } from '../src/obd/parser';
import { SimulatedObdTransport } from '../src/obd/simulatedTransport';
import { BluetoothDeviceInfo } from '../src/obd/bluetoothClassicTransport';
import { createRealElmSession, discoverPairedDevices } from '../src/obd/bluetoothManager';
import {
  getAutoSaveStatus,
  initAutoSave,
  startObdSessionCheckpoint,
  stopObdSessionCheckpoint,
  updateAutoSaveState,
} from '../src/meriva/autosaveManager';
import { registerObdQuery, forceSaveOnObdEvent } from '../src/meriva/autosaveIntegration';

class UnavailableTransport implements ObdTransport {
  async open(): Promise<void> { throw new Error('TRANSPORTE BLUETOOTH NÃO CONFIGURADO'); }
  async close(): Promise<void> {}
  async write(): Promise<void> { throw new Error('TRANSPORTE BLUETOOTH NÃO CONFIGURADO'); }
  async readUntilPrompt(): Promise<string> { throw new Error('TRANSPORTE BLUETOOTH NÃO CONFIGURADO'); }
}

type Mode = 'REAL' | 'SIMULACAO';

function getBasePath(): string {
  return `${FileSystem.documentDirectory}MERIVA_SMART`;
}

export default function LaboratorioScreen() {
  const [mode, setMode] = useState<Mode>('REAL');
  const [devices, setDevices] = useState<BluetoothDeviceInfo[]>([]);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [session, setSession] = useState<Elm327Session | null>(null);
  const [pid, setPid] = useState('010C');
  const [tx, setTx] = useState('');
  const [rx, setRx] = useState('');
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [status, setStatus] = useState('VERIFICANDO BLUETOOTH');
  const [protocol, setProtocol] = useState('N/D');
  const [error, setError] = useState('');
  const [loadingDevices, setLoadingDevices] = useState(false);
  const sessionRef = useRef<Elm327Session | null>(null);

  const simulationSession = useMemo(
    () => new Elm327Session(new SimulatedObdTransport()),
    [],
  );

  useEffect(() => {
    let mounted = true;

    void initAutoSave(getBasePath())
      .then(() => {
        if (mounted) {
          const saved = getAutoSaveStatus();
          setProtocol(saved.lastSavedAt ? getAutoSaveStateProtocolFallback() : 'N/D');
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

  function getAutoSaveStateProtocolFallback(): string {
    return 'N/D';
  }

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
    const device = devices.find((item) => item.address === selectedAddress);
    if (!device) { setError('SELECIONE UM DISPOSITIVO PAREADO'); return; }

    setError('');
    setStatus('BLUETOOTH CONECTANDO');
    try {
      if (sessionRef.current) {
        await sessionRef.current.close();
        sessionRef.current = null;
      }

      const connection = await createRealElmSession(device);
      sessionRef.current = connection.session;
      setSession(connection.session);
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
      setSession(null);
      setProtocol('N/D');
      setStatus('ELM NÃO RESPONDE');
      setError(cause instanceof Error ? cause.message : 'FALHA AO CONECTAR AO ELM327');
    }
  }

  async function disconnectReal() {
    const activeSession = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
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

  const parsed = rx ? parsePidResponse(pid, rx) : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>LABORATÓRIO OBD</Text>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.protocol}>PROTOCOLO: {protocol}</Text>
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
          <TouchableOpacity style={styles.button} onPress={loadDevices} disabled={loadingDevices}>
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
          <TouchableOpacity style={styles.button} onPress={connectReal} disabled={!selectedAddress}>
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
      <TouchableOpacity style={styles.button} onPress={testPid} disabled={mode === 'REAL' && !sessionRef.current}>
        <Text style={styles.buttonText}>TESTAR PID</Text>
      </TouchableOpacity>
      <View style={styles.panel}>
        <Text style={styles.label}>TX</Text><Text style={styles.value}>{tx || 'SEM DADOS'}</Text>
        <Text style={styles.label}>RX</Text><Text style={styles.value}>{rx || 'SEM DADOS'}</Text>
        <Text style={styles.label}>TEMPO</Text><Text style={styles.value}>{elapsedMs === null ? 'SEM DADOS' : `${elapsedMs} ms`}</Text>
        <Text style={styles.label}>STATUS</Text><Text style={styles.value}>{parsed?.status || 'SEM DADOS'}</Text>
        <Text style={styles.label}>VALOR</Text><Text style={styles.value}>{parsed?.value === null || !parsed ? 'SEM DADOS' : `${parsed.value} ${parsed.unit}`}</Text>
        <Text style={styles.label}>RAW PRESERVADO</Text><Text style={styles.value}>{parsed?.rawResponse || 'SEM DADOS'}</Text>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#eef3fb' },
  title: { fontSize: 24, fontWeight: '700', color: '#1f2937', marginBottom: 8 },
  status: { color: '#2563eb', fontWeight: '700', marginBottom: 6 },
  protocol: { color: '#475569', fontWeight: '600', marginBottom: 14 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeButton: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#94a3b8', alignItems: 'center' },
  active: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  simActive: { backgroundColor: '#fef3c7', borderColor: '#d97706' },
  button: { backgroundColor: '#2563eb', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10 },
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
