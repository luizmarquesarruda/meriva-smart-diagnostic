import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import * as FileSystem from 'expo-file-system';
import { readLearningProfile, type MerivaLearningProfile } from '../src/database/learningProfile';

export default function AprendizadoScreen() {
  const layout = useMidLayout();
  const [profile, setProfile] = useState<MerivaLearningProfile | null>(null);
  useEffect(() => {
    const base = FileSystem.documentDirectory + 'MERIVA_SMART';
    const load = () => void readLearningProfile(base).then(setProfile);
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);
  return <SafeAreaView style={styles.container} edges={["top","bottom","left","right"]}><ScrollView contentContainerStyle={[styles.content,{paddingHorizontal:layout.horizontalPadding}]} showsHorizontalScrollIndicator={false}><View style={[styles.screenFrame,{maxWidth:layout.maxContentWidth}]}>
    <Text style={styles.title}>APRENDIZADO</Text><Text style={styles.subtitle}>DNA DO MERIVA • EVIDÊNCIA REAL</Text>
    {profile ? <>
      <View style={styles.hero}><Text style={styles.status}>{profile.learningStatus}</Text><Text style={styles.source}>FONTE: {profile.source}</Text></View>
      <View style={styles.grid}><Metric landscape={layout.landscape} l="AMOSTRAS REAIS" v={String(profile.globalSampleCounts.realSamples)} /><Metric landscape={layout.landscape} l="BASE SEED" v={String(profile.globalSampleCounts.seedSamples)} /><Metric landscape={layout.landscape} l="TOTAL" v={String(profile.globalSampleCounts.totalSamples)} /><Metric landscape={layout.landscape} l="PIDs APRENDIDOS" v={String(Object.keys(profile.overallStatistics).length)} /></View>
      <View style={styles.card}><Row l="PESO DO SEED" v={profile.seedWeight.toFixed(2)} /><Row l="SIMULAÇÕES DETECTADAS" v={String(profile.dataContamination.simulationDetected)} /><Row l="SIMULAÇÕES FILTRADAS" v={String(profile.dataContamination.simulationFiltered)} /><Row l="ATUALIZADO" v={new Date(profile.lastUpdated).toLocaleString()} /></View>
    </> : <View style={styles.empty}><Text style={styles.emptyText}>Perfil de aprendizado ainda não disponível.</Text></View>}
    <Text style={styles.note}>Somente amostras REAL_OBD alimentam o raciocínio diagnóstico. Dados de simulação permanecem bloqueados para aprendizado.</Text>
    <Link href="/saude" asChild><TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>🚨 VER EVIDÊNCIAS E HIPÓTESES</Text></TouchableOpacity></Link>
    <Link href="/" asChild><TouchableOpacity style={styles.back}><Text style={styles.backText}>← VOLTAR</Text></TouchableOpacity></Link>
  </View></ScrollView></SafeAreaView>;
}
function Metric({ l, v, landscape=false }: { l: string; v: string; landscape?: boolean }) { return <View style={[styles.metric,landscape&&styles.metricLandscape]}><Text style={styles.label}>{l}</Text><Text style={styles.value}>{v}</Text></View>; }
function Row({ l, v }: { l: string; v: string }) { return <View style={styles.row}><Text style={styles.label}>{l}</Text><Text style={styles.value}>{v}</Text></View>; }
const styles=StyleSheet.create({container:{flex:1,backgroundColor:'#07111f'},content:{flexGrow:1,width:'100%',paddingVertical:14,paddingBottom:30},screenFrame:{width:'100%',alignSelf:'center'},title:{color:'#f8fafc',fontSize:24,fontWeight:'900'},subtitle:{color:'#7db3ff',fontSize:9,fontWeight:'900',marginTop:3,marginBottom:12},hero:{backgroundColor:'#0f2035',borderRadius:15,borderWidth:1,borderColor:'#2d5278',padding:16,marginBottom:10},status:{color:'#4ade80',fontSize:18,fontWeight:'900'},source:{color:'#8fa6c1',fontSize:9,marginTop:4},grid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:10},metric:{width:'48%',backgroundColor:'#0e1b2d',borderRadius:12,borderWidth:1,borderColor:'#233a56',padding:12},metricLandscape:{width:'auto',flex:1},label:{color:'#7185a1',fontSize:8,fontWeight:'900'},value:{color:'#e5edf7',fontSize:14,fontWeight:'900',marginTop:3},card:{backgroundColor:'#0e1b2d',borderRadius:12,borderWidth:1,borderColor:'#28415f',padding:5},row:{padding:11,borderBottomWidth:1,borderBottomColor:'#1c3048'},note:{color:'#7185a1',fontSize:9,lineHeight:15,marginVertical:10},empty:{backgroundColor:'#0e1b2d',padding:15,borderRadius:11},emptyText:{color:'#94a3b8',fontSize:10,textAlign:'center'},primary:{backgroundColor:'#2563eb',borderRadius:11,padding:14,alignItems:'center'},primaryText:{color:'#fff',fontSize:10,fontWeight:'900'},back:{padding:14,alignItems:'center'},backText:{color:'#7db3ff',fontSize:10,fontWeight:'900'}});