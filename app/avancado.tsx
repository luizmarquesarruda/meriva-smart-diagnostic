import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import { useMidLayout } from '../src/ui/midLayout';
import { getSharedObdConnection, getSharedObdStatus } from '../src/obd/sharedConnection';
import { canPollObd } from '../src/obd/bluetoothState';
import { readVehicleVin, readFreezeFramePids, type FreezeFrameResult } from '../src/obd/advancedDiagnostics';
import { appendFreezeFrameSnapshot, readFreezeFrameSnapshots, type FreezeFrameSnapshot } from '../src/obd/freezeFrameStorage';
import { getAutoSaveState, updateAutoSaveState } from '../src/meriva/autosaveManager';
import { forceSaveOnObdEvent } from '../src/meriva/autosaveIntegration';
import { autoTripService } from '../src/trip/autoTripService';
import { readVehicleProfile, createVehicleProfile } from '../src/database/vehicleConfig';

function basePath(): string {
  return `${FileSystem.documentDirectory}MERIVA_SMART`;
}

export default function AvancadoScreen() {
  const layout = useMidLayout();
  const [vin, setVin] = useState(getAutoSaveState().vehicle?.vin ?? '');
  const [vinBusy, setVinBusy] = useState(false);
  const [freezeBusy, setFreezeBusy] = useState(false);
  const [status, setStatus] = useState('PRONTO');
  const [error, setError] = useState('');
  const [selectedDtc, setSelectedDtc] = useState<string | undefined>(
    getAutoSaveState().dtcs.find((item) => ['CURRENT', 'CONFIRMED', 'PENDING', 'PERMANENT'].includes(item.status))?.code,
  );
  const [freezeResults, setFreezeResults] = useState<FreezeFrameResult[]>([]);
  const [history, setHistory] = useState<FreezeFrameSnapshot[]>([]);

  useEffect(() => { void readFreezeFrameSnapshots(basePath()).then(setHistory); }, []);

  function getSession() {
    if (!canPollObd(getSharedObdStatus().lifecycle)) throw new Error('DIAGNÓSTICO AINDA NÃO ESTÁ PRONTO. CONECTE E VALIDE A ECU.');
    const session = getSharedObdConnection()?.session;
    if (!session) throw new Error('CONECTE O ELM327 ANTES DE USAR OS RECURSOS AVANÇADOS.');
    return session;
  }

  async function identifyVin() {
    setError('');
    setVinBusy(true);
    setStatus('MODE 09 / PID 02: LENDO VIN');
    try {
      const session = getSession();
      const parsed = await readVehicleVin(session);
      if (!parsed.ok || !parsed.vin) throw new Error(parsed.reason ?? 'VIN não foi retornado pela ECU.');
      setVin(parsed.vin);
      const current = await readVehicleProfile(basePath());
      if (current) {
        const updated = { ...current, vin: parsed.vin, lastModified: new Date().toISOString() };
        await createVehicleProfile(basePath(), updated);
        updateAutoSaveState((state) => { state.vehicle = updated; });
        await forceSaveOnObdEvent();
      }
      setStatus('VIN REAL OBD CONFIRMADO');
    } catch (cause) {
      setStatus('MODE 09 SEM VIN VÁLIDO');
      setError(cause instanceof Error ? cause.message : 'Falha ao ler VIN');
    } finally {
      setVinBusy(false);
    }
  }

  async function captureFreezeFrame() {
    setError('');
    setFreezeBusy(true);
    setStatus('MODE 02: CAPTURANDO FREEZE FRAME');
    try {
      const session = getSession();
      const results = await autoTripService.withPollingPaused(() => readFreezeFramePids(session));
      setFreezeResults(results);
      const valid = results.map((item) => item.reading).filter((reading) => reading.status === 'RESPONDEU' && reading.value != null);
      if (!valid.length) throw new Error('ECU não forneceu Freeze Frame válido para os PIDs consultados.');
      const snapshot: FreezeFrameSnapshot = {
        id: `ff-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        capturedAt: new Date().toISOString(),
        ...(selectedDtc ? { dtcCode: selectedDtc } : {}),
        protocol: getSharedObdConnection()?.protocol ?? getAutoSaveState().obd.lastKnownProtocol,
        source: 'REAL_OBD',
        readings: valid,
      };
      await appendFreezeFrameSnapshot(basePath(), snapshot);
      setHistory(await readFreezeFrameSnapshots(basePath()));
      setStatus(`FREEZE FRAME SALVO • ${valid.length} PIDs`);
    } catch (cause) {
      setStatus('FREEZE FRAME NÃO DISPONÍVEL');
      setError(cause instanceof Error ? cause.message : 'Falha ao capturar Freeze Frame');
    } finally {
      setFreezeBusy(false);
    }
  }

  const activeDtcs = getAutoSaveState().dtcs.filter((item) => ['CURRENT', 'CONFIRMED', 'PENDING', 'PERMANENT'].includes(item.status));

  return (
    <SafeAreaView style={styles.container} edges={['top','bottom','left','right']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}>
        <View style={[styles.frame, { maxWidth: layout.maxContentWidth }]}>
          <Text style={styles.title}>DIAGNÓSTICO AVANÇADO</Text>
          <Text style={styles.subtitle}>MODE 02 • FREEZE FRAME • MODE 09</Text>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>IDENTIFICAÇÃO REAL DO VEÍCULO</Text>
            <Text style={styles.hint}>Mode 09 / PID 02 • VIN somente quando retornado pela ECU.</Text>
            <Text style={styles.vin}>{vin || 'N/D'}</Text>
            <TouchableOpacity style={[styles.primary, vinBusy && styles.disabled]} disabled={vinBusy} onPress={() => void identifyVin()}>
              {vinBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>🔎 LER VIN NA ECU</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>FREEZE FRAME DA ECU</Text>
            <Text style={styles.hint}>Mode 02 • snapshot armazenado pela ECU. Não representa uma leitura atual.</Text>
            <View style={styles.dtcGrid}>
              <TouchableOpacity style={[styles.dtcButton, !selectedDtc && styles.dtcSelected]} onPress={() => setSelectedDtc(undefined)}>
                <Text style={styles.dtcText}>SEM DTC</Text>
              </TouchableOpacity>
              {activeDtcs.slice(0, 8).map((dtc) => (
                <TouchableOpacity key={dtc.code} style={[styles.dtcButton, selectedDtc === dtc.code && styles.dtcSelected]} onPress={() => setSelectedDtc(dtc.code)}>
                  <Text style={styles.dtcText}>{dtc.code}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[styles.primary, freezeBusy && styles.disabled]} disabled={freezeBusy} onPress={() => void captureFreezeFrame()}>
              {freezeBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>📸 CAPTURAR FREEZE FRAME</Text>}
            </TouchableOpacity>
            {freezeResults.map((item) => (
              <View key={item.command} style={styles.row}>
                <View style={{flex:1}}><Text style={styles.name}>{item.reading.pid} • {item.reading.name}</Text><Text style={styles.detail}>{item.reading.status === 'RESPONDEU' ? item.reading.value + ' ' + item.reading.unit : item.reading.errorMessage}</Text><Text style={styles.muted}>{item.command} • {item.elapsedMs} ms</Text></View>
                <Text style={item.reading.status === 'RESPONDEU' ? styles.ok : styles.warn}>{item.reading.status === 'RESPONDEU' ? 'OK' : 'N/D'}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>HISTÓRICO DE FREEZE FRAMES</Text>
          {!history.length ? <View style={styles.empty}><Text style={styles.muted}>Nenhum snapshot armazenado.</Text></View> : history.map((snapshot) => (
            <View key={snapshot.id} style={styles.card}>
              <Text style={styles.name}>{snapshot.dtcCode ? snapshot.dtcCode + ' • ' : ''}FREEZE FRAME</Text>
              <Text style={styles.detail}>{new Date(snapshot.capturedAt).toLocaleString()} • {snapshot.protocol ?? 'PROTOCOLO N/D'}</Text>
              {snapshot.readings.map((reading) => <Text key={reading.pid + reading.timestamp} style={styles.detail}>{reading.pid} • {reading.value} {reading.unit}</Text>)}
            </View>
          ))}

          <View style={styles.notice}><Text style={styles.muted}>{status}</Text>{error ? <Text style={styles.error}>{error}</Text> : null}</View>
          <TouchableOpacity style={styles.back} onPress={() => { const { router } = require('expo-router'); router.back(); }}><Text style={styles.backText}>← VOLTAR</Text></TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
  container:{flex:1,backgroundColor:'#07111f'},content:{flexGrow:1,paddingVertical:14,paddingBottom:30},frame:{width:'100%',alignSelf:'center'},
  title:{color:'#f8fafc',fontSize:23,fontWeight:'900',letterSpacing:1},subtitle:{color:'#7db3ff',fontSize:9,fontWeight:'900',marginTop:3,marginBottom:13},
  card:{backgroundColor:'#0e1b2d',borderRadius:14,borderWidth:1,borderColor:'#28415f',padding:14,marginBottom:10},sectionTitle:{color:'#7db3ff',fontSize:11,fontWeight:'900',letterSpacing:1},hint:{color:'#8194ad',fontSize:9,lineHeight:14,marginTop:4},vin:{color:'#e5edf7',fontSize:19,fontWeight:'900',letterSpacing:2,marginVertical:12},
  primary:{backgroundColor:'#2563eb',borderRadius:11,padding:14,alignItems:'center',marginTop:10},primaryText:{color:'#fff',fontSize:10,fontWeight:'900'},disabled:{opacity:0.5},
  dtcGrid:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:10},dtcButton:{paddingVertical:9,paddingHorizontal:12,borderRadius:9,borderWidth:1,borderColor:'#315071',backgroundColor:'#0a1626'},dtcSelected:{borderColor:'#7db3ff',backgroundColor:'#10284a'},dtcText:{color:'#dbe7f4',fontSize:9,fontWeight:'900'},row:{backgroundColor:'#0a1626',borderRadius:10,padding:10,marginTop:8,flexDirection:'row',alignItems:'center'},name:{color:'#e5edf7',fontSize:11,fontWeight:'900'},detail:{color:'#8ea2ba',fontSize:9,marginTop:3},muted:{color:'#7185a1',fontSize:9},ok:{color:'#4ade80',fontSize:9,fontWeight:'900'},warn:{color:'#fb7185',fontSize:9,fontWeight:'900'},empty:{backgroundColor:'#0e1b2d',borderRadius:12,padding:15},notice:{marginVertical:8,padding:10,borderRadius:10,backgroundColor:'#0b1829'},error:{color:'#fb7185',fontSize:9,marginTop:4},back:{padding:14,alignItems:'center'},backText:{color:'#7db3ff',fontSize:10,fontWeight:'900'}
});
