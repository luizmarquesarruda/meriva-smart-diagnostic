import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import { COLORS, SCREEN_TITLE_STYLE } from '../src/ui/theme';
import * as FileSystem from 'expo-file-system';
import {
  CARSCANNER_CONDITION_LABELS,
  getCarScannerLearningCoverage,
  readLearningProfile,
  type MerivaLearningProfile,
} from '../src/database/learningProfile';

export default function AprendizadoScreen() {
  const layout = useMidLayout();
  const [profile, setProfile] = useState<MerivaLearningProfile | null>(null);
  const coverage = profile ? getCarScannerLearningCoverage(profile) : null;
  const realPidCount = profile
    ? Object.values(profile.overallStatistics).filter((stats) => stats.realSamples > 0).length
    : 0;
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
      <View style={styles.grid}><Metric landscape={layout.landscape} l="AMOSTRAS REAIS" v={String(profile.globalSampleCounts.realSamples)} /><Metric landscape={layout.landscape} l="BASE SEED" v={String(profile.globalSampleCounts.seedSamples)} /><Metric landscape={layout.landscape} l="TOTAL" v={String(profile.globalSampleCounts.totalSamples)} /><Metric landscape={layout.landscape} l="PIDs COM EVIDÊNCIA REAL" v={String(realPidCount)} /></View>
      <View style={styles.card}><Row l="PESO DO SEED" v={profile.seedWeight.toFixed(2)} /><Row l="SIMULAÇÕES DETECTADAS" v={String(profile.dataContamination.simulationDetected)} /><Row l="SIMULAÇÕES FILTRADAS" v={String(profile.dataContamination.simulationFiltered)} /><Row l="ATUALIZADO" v={new Date(profile.lastUpdated).toLocaleString()} /></View>
      {coverage ? <View style={styles.coverageCard}>
        <Text style={styles.coverageTitle}>LACUNAS DA REFERÊNCIA CARSCANNER</Text>
        <Text style={styles.coverageSummary}>Seed numérico: {coverage.seedBackedTargets}/{coverage.totalTargets} parâmetros • {coverage.totalTargets} PIDs × {coverage.totalConditions} condições</Text>
        <Text style={styles.coverageSummary}>Evidência REAL_OBD: {coverage.realObservedSlots}/{coverage.totalSlots} combinações ({coverage.realCoveragePercent}%)</Text>
        <Text style={styles.coverageGapCount}>Sem evidência real: {coverage.gapSlots} • Somente seed CarScanner: {coverage.seedOnlySlots}</Text>
        <Text style={styles.coverageNote}>A lista é recalculada automaticamente com o DNA local. Só leituras OBD reais válidas fecham lacunas; seed e simulação não contam como aprendizado real.</Text>
        {coverage.targets.map((target) => <View key={target.pid} style={styles.coverageRow}>
          <Text style={styles.coverageName}>{target.pidName} • PID {target.pid}</Text>
          <Text style={styles.coverageMeta}>{target.realSampleCount} amostras reais • {target.coveredRealContexts}/{coverage.totalConditions} condições com evidência</Text>
          {target.missingRealConditions.length > 0
            ? <Text style={styles.coverageMissing}>FALTAM: {target.missingRealConditions.map((condition) => CARSCANNER_CONDITION_LABELS[condition]).join(", ")}</Text>
            : <Text style={styles.coverageComplete}>COBERTURA REAL EM TODAS AS CONDIÇÕES</Text>}
          {target.seedOnlyConditions.length > 0
            ? <Text style={styles.coverageSeedOnly}>SOMENTE REFERÊNCIA: {target.seedOnlyConditions.map((condition) => CARSCANNER_CONDITION_LABELS[condition]).join(", ")}</Text>
            : null}
        </View>)}
      </View> : null}
    </> : <View style={styles.empty}><Text style={styles.emptyText}>Perfil de aprendizado ainda não disponível.</Text></View>}
    <Text style={styles.note}>Somente amostras REAL_OBD alimentam o raciocínio diagnóstico. Dados de simulação permanecem bloqueados para aprendizado.</Text>
    <Link href="/saude" asChild><TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>🚨 VER EVIDÊNCIAS E HIPÓTESES</Text></TouchableOpacity></Link>
    <Link href="/" asChild><TouchableOpacity style={styles.back}><Text style={styles.backText}>← VOLTAR</Text></TouchableOpacity></Link>
  </View></ScrollView></SafeAreaView>;
}
function Metric({ l, v, landscape=false }: { l: string; v: string; landscape?: boolean }) { return <View style={[styles.metric,landscape&&styles.metricLandscape]}><Text style={styles.label}>{l}</Text><Text style={styles.value}>{v}</Text></View>; }
function Row({ l, v }: { l: string; v: string }) { return <View style={styles.row}><Text style={styles.label}>{l}</Text><Text style={styles.value}>{v}</Text></View>; }
const styles=StyleSheet.create({container:{flex:1,backgroundColor:COLORS.screen},content:{flexGrow:1,width:'100%',paddingVertical:14,paddingBottom:30},screenFrame:{width:'100%',alignSelf:'center'},title: { ...SCREEN_TITLE_STYLE, marginBottom: 6 },subtitle:{color:'#7db3ff',fontSize:9,fontWeight:'900',marginTop:3,marginBottom:12},hero:{backgroundColor:'#0f2035',borderRadius:15,borderWidth:1,borderColor:'#2d5278',padding:16,marginBottom:10},status:{color:'#4ade80',fontSize:18,fontWeight:'900'},source:{color:'#8fa6c1',fontSize:9,marginTop:4},grid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:10},metric:{width:'48%',backgroundColor:'#0e1b2d',borderRadius:12,borderWidth:1,borderColor:'#233a56',padding:12},metricLandscape:{width:'auto',flex:1},label:{flex:1,minWidth:0,color:'#7185a1',fontSize:8,fontWeight:'900'},value:{color:'#e5edf7',fontSize:14,fontWeight:'900',marginTop:3},card:{backgroundColor:'#0e1b2d',borderRadius:12,borderWidth:1,borderColor:'#28415f',padding:5},row:{padding:11,borderBottomWidth:1,borderBottomColor:'#1c3048',flexDirection:'row',alignItems:'center'},note:{color:'#7185a1',fontSize:9,lineHeight:15,marginVertical:10},coverageCard:{backgroundColor:'#0e1b2d',borderRadius:12,borderWidth:1,borderColor:'#28415f',padding:12,marginTop:10,marginBottom:10},coverageTitle:{color:'#7db3ff',fontSize:11,fontWeight:'900',marginBottom:7},coverageSummary:{color:'#cbd5e1',fontSize:9,lineHeight:15,marginBottom:3},coverageGapCount:{color:'#fbbf24',fontSize:9,fontWeight:'900',lineHeight:15,marginTop:2},coverageNote:{color:'#7185a1',fontSize:9,lineHeight:14,marginTop:5,marginBottom:8},coverageRow:{paddingVertical:9,borderTopWidth:1,borderTopColor:'#1c3048'},coverageName:{color:'#e5edf7',fontSize:10,fontWeight:'900'},coverageMeta:{color:'#94a3b8',fontSize:9,marginTop:3},coverageMissing:{color:'#fbbf24',fontSize:8,fontWeight:'800',lineHeight:13,marginTop:4},coverageComplete:{color:'#4ade80',fontSize:8,fontWeight:'800',lineHeight:13,marginTop:4},coverageSeedOnly:{color:'#94a3b8',fontSize:8,lineHeight:13,marginTop:3},empty:{backgroundColor:'#0e1b2d',padding:15,borderRadius:11},emptyText:{color:'#94a3b8',fontSize:10,textAlign:'center'},primary:{backgroundColor:'#2563eb',borderRadius:11,padding:14,alignItems:'center'},primaryText:{color:'#fff',fontSize:10,fontWeight:'900'},back:{padding:14,alignItems:'center'},backText:{color:'#7db3ff',fontSize:10,fontWeight:'900'}});