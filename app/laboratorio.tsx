import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Elm327Session } from '../src/obd/elm327';
import { parsePidResponse } from '../src/obd/parser';
import { SimulatedObdTransport } from '../src/obd/simulatedTransport';
import { BluetoothDeviceInfo } from '../src/obd/bluetoothClassicTransport';
import { bootstrapBluetooth, createRealElmSession, discoverClassicDevices, getLastElmAddress, requestBluetoothEnable, subscribeBluetoothState } from '../src/obd/bluetoothManager';
import { BLUETOOTH_FLOW_STATES, canQueryPids, type BluetoothFlowState } from '../src/obd/bluetoothFlow';
import { startObdSessionCheckpoint, stopObdSessionCheckpoint, updateAutoSaveState } from '../src/meriva/autosaveManager';
import { registerObdQuery, forceSaveOnObdEvent } from '../src/meriva/autosaveIntegration';

type Mode = 'REAL' | 'SIMULACAO';
function getBasePath(): string { return `${FileSystem.documentDirectory}MERIVA_SMART`; }

export default function LaboratorioScreen() {
  const [mode, setMode] = useState<Mode>('REAL');
  const [devices, setDevices] = useState<BluetoothDeviceInfo[]>([]);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [session, setSession] = useState<Elm327Session | null>(null);
  const sessionRef = useRef<Elm327Session | null>(null);
  const [pid, setPid] = useState('010C');
  const [tx, setTx] = useState(''); const [rx, setRx] = useState(''); const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [status, setStatus] = useState<BluetoothFlowState>(BLUETOOTH_FLOW_STATES.OFF);
  const [error, setError] = useState(''); const [loadingDevices, setLoadingDevices] = useState(false);
  const simulationSession = useMemo(() => new Elm327Session(new SimulatedObdTransport()), []);

  useEffect(() => {
    let mounted = true;
    const boot = async () => {
      try {
        const state = await bootstrapBluetooth();
        if (mounted) setStatus(state === 'BLUETOOTH LIGADO' ? BLUETOOTH_FLOW_STATES.ON : BLUETOOTH_FLOW_STATES.OFF);
      } catch (cause) { if (mounted) { setStatus(BLUETOOTH_FLOW_STATES.OFF); setError(cause instanceof Error ? cause.message : 'FALHA AO INICIAR BLUETOOTH'); } }
    };
    void boot();
    const subscription = subscribeBluetoothState(async (enabled) => {
      if (!enabled) {
        const active = sessionRef.current;
        sessionRef.current = null; setSession(null);
        try { await active?.close(); } catch {}
        stopObdSessionCheckpoint();
        await forceSaveOnObdEvent();
        if (mounted) {
          setStatus(BLUETOOTH_FLOW_STATES.OFF);
          setError('Bluetooth desconectado. Diagnóstico interrompido com segurança.');
        }
        return;
      }
      if (mounted) setStatus(BLUETOOTH_FLOW_STATES.ON);
    }, async () => {
      const active = sessionRef.current;
      sessionRef.current = null; setSession(null);
      try { await active?.close(); } catch {}
      stopObdSessionCheckpoint();
      await forceSaveOnObdEvent();
      if (mounted) { setStatus(BLUETOOTH_FLOW_STATES.CONNECTED); setError('ELM327 desconectado. Reconecte e valide novamente.'); }
    });
    const appStateSubscription = AppState.addEventListener('change', (state) => { if (state === 'active') void boot(); });
    return () => {
      mounted = false; subscription.remove(); appStateSubscription.remove();
      const active = sessionRef.current; sessionRef.current = null;
      void active?.close(); stopObdSessionCheckpoint(); void forceSaveOnObdEvent();
    };
  }, []);

  async function loadDevices() {
    setLoadingDevices(true); setError('');
    try {
      const found = await discoverClassicDevices();
      setDevices(found);
      const last = await getLastElmAddress();
      const preferred = last && found.some((d) => d.address === last) ? last : found[0]?.address || '';
      if (preferred) { setSelectedAddress(preferred); setStatus(BLUETOOTH_FLOW_STATES.SELECTED); }
      else setStatus(BLUETOOTH_FLOW_STATES.ON);
    } catch (cause) { setStatus(BLUETOOTH_FLOW_STATES.OFF); setError(cause instanceof Error ? cause.message : 'FALHA AO LISTAR BLUETOOTH'); }
    finally { setLoadingDevices(false); }
  }

  async function connectReal(address = selectedAddress) {
    if (!address) { setError('SELECIONE UM DISPOSITIVO ELM327'); return; }
    if (status !== BLUETOOTH_FLOW_STATES.SELECTED && status !== BLUETOOTH_FLOW_STATES.ON) { setError('Bluetooth não está pronto para conexão.'); return; }
    setError(''); setStatus(BLUETOOTH_FLOW_STATES.CONNECTED);
    try {
      const device = devices.find((item) => item.address === address) ?? { address, name: 'ELM327 (último dispositivo)', bonded: true };
      const connection = await createRealElmSession(device);
      sessionRef.current = connection.session; setSession(connection.session);
      startObdSessionCheckpoint();
      updateAutoSaveState((state) => { state.obd = { connected: true, adapterName: device.name, bluetoothState: BLUETOOTH_FLOW_STATES.CONNECTED, elmInitialized: true, ecuReady: true, sessionState: BLUETOOTH_FLOW_STATES.READY, lastConnectedAt: new Date().toISOString() }; });
      setStatus(BLUETOOTH_FLOW_STATES.READY);
    } catch (cause) {
      sessionRef.current = null; setSession(null);
      setStatus((cause instanceof Error && cause.message.includes('ECU')) ? BLUETOOTH_FLOW_STATES.ECU_FAILED : BLUETOOTH_FLOW_STATES.ELM_FAILED);
      setError(cause instanceof Error ? cause.message : 'FALHA AO VALIDAR ELM327/ECU');
      updateAutoSaveState((state) => { state.obd = { ...state.obd, connected: false, bluetoothState: state.obd.bluetoothState ?? BLUETOOTH_FLOW_STATES.CONNECTED, elmInitialized: false, ecuReady: false, sessionState: status }; });
    }
  }

  async function reconnectLast() {
    const last = await getLastElmAddress();
    if (!last) { setError('Nenhum ELM327 anterior foi salvo.'); return; }
    if (status === BLUETOOTH_FLOW_STATES.OFF) { const ok = await requestBluetoothEnable(); if (!ok) { setError('Bluetooth continua desligado.'); return; } }
    await connectReal(last);
  }

  async function testPid() {
    setError('');
    if (mode === 'REAL' && !canQueryPids(status)) { setError('PID bloqueado: confirme Bluetooth → ELM327 → ECU antes de consultar.'); return; }
    setStatus(mode === 'SIMULACAO' ? BLUETOOTH_FLOW_STATES.ON : BLUETOOTH_FLOW_STATES.READY);
    try {
      const activeSession = mode === 'SIMULACAO' ? simulationSession : sessionRef.current;
      if (mode === 'SIMULACAO' && (!simulationSession.isInitialized || !simulationSession.isEcuReady)) {
        await simulationSession.initialize();
        await simulationSession.confirmEcu();
      }
      if (!activeSession) throw new Error('CONECTE AO ELM327 ANTES DE TESTAR O PID');
      const result = await activeSession.queryPid(pid);
      await registerObdQuery(getBasePath(), result, mode);
      setTx(result.tx); setRx(result.rx); setElapsedMs(result.elapsedMs);
      setStatus(mode === 'SIMULACAO' ? (result.parsed.status === 'RESPONDEU' ? BLUETOOTH_FLOW_STATES.ON : BLUETOOTH_FLOW_STATES.ECU_FAILED) : (result.parsed.status === 'RESPONDEU' ? BLUETOOTH_FLOW_STATES.READY : BLUETOOTH_FLOW_STATES.ECU_FAILED));
    } catch (cause) { setStatus(BLUETOOTH_FLOW_STATES.ECU_FAILED); setError(cause instanceof Error ? cause.message : 'ERRO AO CONSULTAR PID'); }
  }

  const parsed = rx ? parsePidResponse(pid, rx) : null;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>LABORATÓRIO OBD</Text>
      <Text style={styles.status}>{status}</Text>
      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeButton, mode === 'REAL' && styles.active]} onPress={() => setMode('REAL')}><Text>BLUETOOTH REAL</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.modeButton, mode === 'SIMULACAO' && styles.simActive]} onPress={() => setMode('SIMULACAO')}><Text>SIMULAÇÃO</Text></TouchableOpacity>
      </View>
      {mode === 'REAL' ? <>
        {status === BLUETOOTH_FLOW_STATES.OFF ? <TouchableOpacity style={styles.button} onPress={async () => { const ok = await requestBluetoothEnable(); if (ok) setStatus(BLUETOOTH_FLOW_STATES.ON); }}><Text style={styles.buttonText}>ATIVAR BLUETOOTH</Text></TouchableOpacity> : null}
        <TouchableOpacity style={styles.button} onPress={loadDevices} disabled={loadingDevices}>{loadingDevices ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>PROCURAR ELM327</Text>}</TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={reconnectLast}><Text>RECONectar ÚLTIMO ELM327</Text></TouchableOpacity>
        {devices.map((device) => <TouchableOpacity key={device.address} style={[styles.device, selectedAddress === device.address && styles.selected]} onPress={() => { setSelectedAddress(device.address); setStatus(BLUETOOTH_FLOW_STATES.SELECTED); }}><Text style={styles.deviceName}>{device.name || 'DISPOSITIVO SEM NOME'}</Text><Text>{device.address}{device.bonded ? ' • PAREADO' : ' • DESCOBERTO'}</Text></TouchableOpacity>)}
        <TouchableOpacity style={styles.button} onPress={() => void connectReal()}><Text style={styles.buttonText}>CONECTAR E VALIDAR ELM327 + ECU</Text></TouchableOpacity>
      </> : <Text style={styles.warning}>SIMULAÇÃO: não é ECU real e não alimenta aprendizado.</Text>}
      <TextInput value={pid} onChangeText={setPid} autoCapitalize="characters" style={styles.input} placeholder="PID, ex.: 010C" />
      <TouchableOpacity style={styles.button} onPress={testPid}><Text style={styles.buttonText}>TESTAR PID</Text></TouchableOpacity>
      <View style={styles.panel}>
        <Text style={styles.label}>TX</Text><Text style={styles.value}>{tx || 'SEM DADOS'}</Text>
        <Text style={styles.label}>RX</Text><Text style={styles.value}>{rx || 'SEM DADOS'}</Text>
        <Text style={styles.label}>TEMPO</Text><Text style={styles.value}>{elapsedMs === null ? 'SEM DADOS' : elapsedMs + ' ms'}</Text>
        <Text style={styles.label}>STATUS</Text><Text style={styles.value}>{parsed?.status || 'SEM DADOS'}</Text>
        <Text style={styles.label}>VALOR</Text><Text style={styles.value}>{parsed?.value === null || !parsed ? 'SEM DADOS' : parsed.value + ' ' + parsed.unit}</Text>
        <Text style={styles.label}>RAW PRESERVADO</Text><Text style={styles.value}>{parsed?.rawResponse || 'SEM DADOS'}</Text>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container:{flexGrow:1,padding:20,backgroundColor:'#eef3fb'}, title:{fontSize:24,fontWeight:'700',color:'#1f2937',marginBottom:8},
  status:{color:'#2563eb',fontWeight:'700',marginBottom:14}, modeRow:{flexDirection:'row',gap:8,marginBottom:12},
  modeButton:{flex:1,padding:12,borderRadius:10,borderWidth:1,borderColor:'#94a3b8',alignItems:'center'}, active:{backgroundColor:'#dbeafe',borderColor:'#2563eb'},simActive:{backgroundColor:'#fef3c7',borderColor:'#d97706'},
  button:{backgroundColor:'#2563eb',borderRadius:10,padding:14,alignItems:'center',marginBottom:10},secondaryButton:{backgroundColor:'#e2e8f0',borderRadius:10,padding:14,alignItems:'center',marginBottom:10},
  buttonText:{color:'#fff',fontWeight:'700'},device:{backgroundColor:'#fff',borderRadius:10,padding:12,marginBottom:8,borderWidth:1,borderColor:'#cbd5e1'},selected:{borderColor:'#2563eb',borderWidth:2},
  deviceName:{fontWeight:'700',color:'#1f2937'},warning:{color:'#b45309',marginBottom:12},input:{backgroundColor:'#fff',borderColor:'#cbd5e1',borderWidth:1,borderRadius:10,padding:12,marginBottom:12},
  panel:{backgroundColor:'#1f2937',borderRadius:14,padding:16,marginTop:8},label:{color:'#93c5fd',marginTop:8},value:{color:'#f8fafc',fontSize:16,marginTop:3},error:{color:'#c2410c',marginTop:16},
});
