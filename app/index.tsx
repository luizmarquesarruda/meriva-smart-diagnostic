import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { readDriveCycles, initializeDriveCycles } from '../src/storage/driveCycleStorage';
import { getDriveCycleSummary, type DriveCycle } from '../src/data/driveCycles';
import { getAutoSaveStatus, initAutoSave, updateAutoSaveState } from '../src/meriva/autosaveManager';
import type { AutoSaveStatus } from '../src/meriva/autosaveManager';
import type { ObdConnectionState } from '../src/meriva/autosaveState';
import { calculateConsumptionKml, gpsTracker, type GpsTripState } from '../src/gps';

function formatTime(iso: string | null): string {
  if (!iso) return 'N/D';
  try { return new Date(iso).toLocaleTimeString('pt-BR'); } catch { return 'N/D'; }
}

function StateDot({ ok }: { ok: boolean }) {
  return <View style={[styles.dot, ok ? styles.dotOn : styles.dotOff]} />;
}

export default function IndexScreen() {
  const [cycles, setCycles] = useState<DriveCycle[]>([]);
  const [obd, setObd] = useState<ObdConnectionState>({ connected: false });
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>({ lastSavedAt: null, lastSaveReason: null, lastError: null });
  const [isHydrated, setIsHydrated] = useState(false);
  const [gpsState, setGpsState] = useState<GpsTripState>(gpsTracker.getState());
  const [fuelUsedL, setFuelUsedL] = useState('');

  useEffect(() => gpsTracker.subscribe(setGpsState), []);
  useEffect(() => {
    async function restoreState() {
      const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
      const restored = await initAutoSave(basePath);
      await initializeDriveCycles(basePath);
      const storedCycles = await readDriveCycles(basePath);
      const loaded = restored.driveCycles.length ? restored.driveCycles : storedCycles;
      if (!restored.driveCycles.length && loaded.length) updateAutoSaveState(state => { state.driveCycles = loaded; });
      setCycles(loaded); setObd(restored.obd); setSaveStatus(getAutoSaveStatus()); setIsHydrated(true);
    }
    void restoreState();
  }, []);

  const summary = useMemo(() => getDriveCycleSummary(cycles), [cycles]);
  const gpsConsumption = calculateConsumptionKml(gpsState.distanceKm, Number(fuelUsedL.replace(',', '.')));

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View><Text style={styles.kicker}>MERIVA SMART</Text><Text style={styles.heroTitle}>DIAGNÓSTICO</Text></View>
            <View style={styles.livePill}><StateDot ok={obd.connected} /><Text style={styles.liveText}>{obd.connected ? 'OBD ONLINE' : 'OBD OFFLINE'}</Text></View>
          </View>
          <Text style={styles.vehicle}>CHEVROLET MERIVA • ECU {obd.ecuAddress ?? 'N/D'}</Text>
          <View style={styles.heroGrid}>
            <View><Text style={styles.heroLabel}>PROTOCOLO</Text><Text style={styles.heroValue}>{obd.protocol ?? 'N/D'}</Text></View>
            <View><Text style={styles.heroLabel}>AUTOSAVE</Text><Text style={styles.heroValue}>{formatTime(saveStatus.lastSavedAt)}</Text></View>
          </View>
          <Text style={styles.heroState}>{isHydrated ? '● DADOS RESTAURADOS' : '○ CARREGANDO DADOS...'}</Text>
        </View>

        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>VIAGEM AGORA</Text><Text style={gpsState.running ? styles.green : styles.muted}>{gpsState.running ? 'GPS ATIVO' : 'GPS AGUARDANDO'}</Text></View>
        <View style={styles.speedCard}>
          <Text style={styles.metricCaption}>VELOCIDADE</Text>
          <Text style={styles.speed}>{gpsState.currentSpeedKmh.toFixed(0)}<Text style={styles.speedUnit}> km/h</Text></Text>
          <View style={styles.tripRow}>
            <View><Text style={styles.metricCaption}>DISTÂNCIA</Text><Text style={styles.tripValue}>{gpsState.distanceKm.toFixed(2)} km</Text></View>
            <View><Text style={styles.metricCaption}>MÁXIMA</Text><Text style={styles.tripValue}>{gpsState.maxSpeedKmh.toFixed(0)} km/h</Text></View>
            <View><Text style={styles.metricCaption}>PRECISÃO</Text><Text style={styles.tripValue}>{gpsState.lastAccuracyM == null ? 'N/D' : `${gpsState.lastAccuracyM.toFixed(0)} m`}</Text></View>
          </View>
        </View>

        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>CONSUMO</Text><Text style={styles.muted}>GPS + entrada manual</Text></View>
        <View style={styles.card}>
          <TextInput value={fuelUsedL} onChangeText={setFuelUsedL} keyboardType="decimal-pad" placeholder="Litros usados na viagem" placeholderTextColor="#718096" style={styles.input} />
          <Text style={styles.consumption}>{gpsConsumption == null ? 'Informe os litros usados' : `${gpsConsumption.toFixed(2)} km/L`}</Text>
          <Text style={styles.help}>O consumo real da ECU aparece quando houver dados OBD reais. O GPS sozinho não mede litros.</Text>
        </View>

        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>RESUMO REAL</Text><Text style={styles.muted}>somente dados REAL_OBD</Text></View>
        <View style={styles.metrics}>
          <View style={styles.metric}><Text style={styles.metricCaption}>CICLOS</Text><Text style={styles.metricBig}>{summary.realCycleCount}</Text></View>
          <View style={styles.metric}><Text style={styles.metricCaption}>DISTÂNCIA</Text><Text style={styles.metricBig}>{summary.totalDistanceKm.toFixed(1)} km</Text></View>
          <View style={styles.metric}><Text style={styles.metricCaption}>CONSUMO</Text><Text style={styles.metricBig}>{summary.avgConsumptionKml.toFixed(2)} km/L</Text></View>
          <View style={styles.metric}><Text style={styles.metricCaption}>MÉDIA</Text><Text style={styles.metricBig}>{summary.avgSpeedKmh.toFixed(0)} km/h</Text></View>
        </View>

        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>ÚLTIMO CICLO</Text><Text style={summary.lastRealCycle?.source === 'REAL_OBD' ? styles.green : styles.amber}>{summary.lastRealCycle ? (summary.lastRealCycle.source === 'REAL_OBD' ? 'REAL' : 'REFERÊNCIA') : 'NENHUM'}</Text></View>
        <View style={styles.card}>
          {summary.lastRealCycle ? <><Text style={styles.row}>Distância <Text style={styles.rowStrong}>{summary.lastRealCycle.distanceTotalKm.toFixed(2)} km</Text></Text><Text style={styles.row}>Consumo <Text style={styles.rowStrong}>{summary.lastRealCycle.avgFuelConsumptionKml.toFixed(3)} km/L</Text></Text><Text style={styles.row}>Início <Text style={styles.rowStrong}>{summary.lastRealCycle.startedAt}</Text></Text></> : <Text style={styles.help}>Ainda não há um ciclo real salvo.</Text>}
        </View>

        {saveStatus.lastError ? <View style={styles.alert}><Text style={styles.alertTitle}>AUTOSAVE COM FALHA</Text><Text style={styles.alertText}>{saveStatus.lastError}</Text></View> : null}

        <View style={styles.actions}>
          <Link href="/laboratorio" asChild><TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>ABRIR LABORATÓRIO OBD</Text></TouchableOpacity></Link>
          <Link href="/armazenamento" asChild><TouchableOpacity style={styles.secondary}><Text style={styles.secondaryText}>ARMAZENAMENTO</Text></TouchableOpacity></Link>
          <Link href="/configuracoes" asChild><TouchableOpacity style={styles.secondary}><Text style={styles.secondaryText}>CONFIGURAÇÕES</Text></TouchableOpacity></Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#0b1118'},content:{padding:18,paddingBottom:42},
  hero:{backgroundColor:'#111a24',borderWidth:1,borderColor:'#263646',borderRadius:18,padding:18,marginBottom:20},
  heroTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'},kicker:{color:'#7dd3fc',fontSize:12,fontWeight:'800',letterSpacing:2},heroTitle:{color:'#f8fafc',fontSize:27,fontWeight:'900',marginTop:2},
  livePill:{flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#334155',borderRadius:20,paddingHorizontal:10,paddingVertical:7},liveText:{color:'#cbd5e1',fontSize:11,fontWeight:'800'},dot:{width:7,height:7,borderRadius:4,marginRight:6},dotOn:{backgroundColor:'#22c55e'},dotOff:{backgroundColor:'#64748b'},
  vehicle:{color:'#94a3b8',fontSize:12,marginTop:16},heroGrid:{flexDirection:'row',gap:24,marginTop:18},heroLabel:{color:'#64748b',fontSize:10,fontWeight:'800'},heroValue:{color:'#e2e8f0',fontSize:13,fontWeight:'700',marginTop:3},heroState:{color:'#67e8f9',fontSize:11,fontWeight:'800',marginTop:18},
  sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8,marginTop:2},sectionTitle:{color:'#e2e8f0',fontSize:12,fontWeight:'900',letterSpacing:1.4},green:{color:'#4ade80',fontWeight:'800',fontSize:11},amber:{color:'#fbbf24',fontWeight:'800',fontSize:11},muted:{color:'#64748b',fontSize:11},
  speedCard:{backgroundColor:'#101923',borderRadius:16,borderWidth:1,borderColor:'#243443',padding:18,marginBottom:18},metricCaption:{color:'#64748b',fontSize:10,fontWeight:'800',letterSpacing:1},speed:{color:'#f8fafc',fontSize:48,fontWeight:'900',marginTop:2},speedUnit:{fontSize:15,color:'#94a3b8',fontWeight:'700'},tripRow:{flexDirection:'row',justifyContent:'space-between',borderTopWidth:1,borderTopColor:'#22303d',marginTop:14,paddingTop:14},tripValue:{color:'#e2e8f0',fontSize:14,fontWeight:'800',marginTop:3},
  card:{backgroundColor:'#111a24',borderRadius:14,borderWidth:1,borderColor:'#243443',padding:14,marginBottom:18},input:{backgroundColor:'#0b1118',borderWidth:1,borderColor:'#334155',borderRadius:10,padding:13,color:'#f8fafc',fontSize:16},consumption:{color:'#7dd3fc',fontSize:26,fontWeight:'900',marginTop:12},help:{color:'#718096',fontSize:11,lineHeight:16,marginTop:8},metrics:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginBottom:18},metric:{width:'48%',backgroundColor:'#111a24',borderRadius:12,borderWidth:1,borderColor:'#243443',padding:14,marginBottom:10},metricBig:{color:'#f1f5f9',fontSize:17,fontWeight:'900',marginTop:5},row:{color:'#94a3b8',paddingVertical:5},rowStrong:{color:'#e2e8f0',fontWeight:'800'},alert:{backgroundColor:'#2a1c10',borderWidth:1,borderColor:'#854d0e',borderRadius:12,padding:13,marginBottom:18},alertTitle:{color:'#fbbf24',fontWeight:'900',fontSize:11},alertText:{color:'#fde68a',fontSize:12,marginTop:4},actions:{gap:9},primary:{backgroundColor:'#0284c7',borderRadius:12,padding:15,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'900',letterSpacing:.5},secondary:{backgroundColor:'#111a24',borderWidth:1,borderColor:'#334155',borderRadius:12,padding:15,alignItems:'center'},secondaryText:{color:'#e2e8f0',fontWeight:'800'}
});