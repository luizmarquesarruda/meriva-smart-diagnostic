import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { readDriveCycles, type DriveCycle } from '../src/storage/driveCycleStorage';
import { getDriveCycleSummary } from '../src/data/driveCycles';

export default function ViagensScreen() {
  const [cycles, setCycles] = useState<DriveCycle[]>([]);
  useEffect(() => { void readDriveCycles(FileSystem.documentDirectory + 'MERIVA_SMART').then(setCycles).catch(() => setCycles([])); }, []);
  const summary = getDriveCycleSummary(cycles);
  return <SafeAreaView style={styles.container}><ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.title}>VIAGENS</Text><Text style={styles.subtitle}>CICLOS • CONSUMO • DISTÂNCIA</Text>
    <View style={styles.grid}><Metric l="CICLOS" v={String(cycles.length)} /><Metric l="DISTÂNCIA" v={summary.totalDistanceKm.toFixed(1) + ' km'} /><Metric l="CONSUMO MÉDIO" v={summary.avgConsumptionKml > 0 ? summary.avgConsumptionKml.toFixed(1) + ' km/L' : 'N/D'} /></View>
    <Text style={styles.section}>HISTÓRICO DE CICLOS</Text>
    {cycles.length ? cycles.slice().reverse().slice(0, 20).map((c, i) => <View style={styles.row} key={String(c.id ?? i)}><Text style={styles.name}>{c.startedAt ? new Date(c.startedAt).toLocaleString() : 'CICLO ' + (i + 1)}</Text><Text style={styles.detail}>{Number(c.distanceTotalKm ?? 0).toFixed(2)} km</Text></View>) : <View style={styles.empty}><Text style={styles.emptyText}>Nenhuma viagem registrada ainda.</Text></View>}
    <Link href="/armazenamento" asChild><TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>🗂️ ABRIR HISTÓRICO E EXPORTAÇÃO</Text></TouchableOpacity></Link>
    <Link href="/" asChild><TouchableOpacity style={styles.back}><Text style={styles.backText}>← VOLTAR</Text></TouchableOpacity></Link>
  </ScrollView></SafeAreaView>;
}
function Metric({ l, v }: { l: string; v: string }) { return <View style={styles.metric}><Text style={styles.label}>{l}</Text><Text style={styles.value}>{v}</Text></View>; }
const styles=StyleSheet.create({container:{flex:1,backgroundColor:'#07111f'},content:{padding:14,paddingBottom:30},title:{color:'#f8fafc',fontSize:24,fontWeight:'900'},subtitle:{color:'#7db3ff',fontSize:9,fontWeight:'900',marginTop:3,marginBottom:12},grid:{flexDirection:'row',gap:8,marginBottom:12},metric:{flex:1,backgroundColor:'#0e1b2d',borderRadius:12,borderWidth:1,borderColor:'#233a56',padding:12},label:{color:'#7185a1',fontSize:8,fontWeight:'900'},value:{color:'#e5edf7',fontSize:16,fontWeight:'900',marginTop:4},section:{color:'#7db3ff',fontSize:10,fontWeight:'900',marginBottom:7},row:{backgroundColor:'#0e1b2d',borderRadius:11,borderWidth:1,borderColor:'#233a56',padding:12,marginBottom:7,flexDirection:'row',justifyContent:'space-between'},name:{color:'#dbeafe',fontSize:10,fontWeight:'800'},detail:{color:'#9fc5f7',fontSize:10,fontWeight:'900'},empty:{backgroundColor:'#0e1b2d',padding:15,borderRadius:11},emptyText:{color:'#94a3b8',fontSize:10,textAlign:'center'},primary:{backgroundColor:'#2563eb',borderRadius:11,padding:14,alignItems:'center',marginTop:8},primaryText:{color:'#fff',fontSize:10,fontWeight:'900'},back:{padding:14,alignItems:'center'},backText:{color:'#7db3ff',fontSize:10,fontWeight:'900'}});