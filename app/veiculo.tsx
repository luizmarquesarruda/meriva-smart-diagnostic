import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import * as FileSystem from 'expo-file-system';
import { ensureMerivaVehicleProfile, type VehicleProfile } from '../src/database/vehicleConfig';
import { getAutoSaveState } from '../src/meriva/autosaveManager';
import { useAppEventRevision } from '../src/ui/useAppEventRevision';

export default function VeiculoScreen() {
  const layout = useMidLayout();
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [state, setState] = useState(getAutoSaveState());
  const eventRevision = useAppEventRevision();
  useEffect(() => {
    const base = FileSystem.documentDirectory + 'MERIVA_SMART';
    void ensureMerivaVehicleProfile(base).then(setProfile);
  }, []);
  useEffect(() => {
    setState(getAutoSaveState());
  }, [eventRevision]);
  return <SafeAreaView style={styles.container} edges={["top","bottom","left","right"]}><ScrollView contentContainerStyle={[styles.content,{paddingHorizontal:layout.horizontalPadding}]} showsHorizontalScrollIndicator={false}><View style={[styles.screenFrame,{maxWidth:layout.maxContentWidth}]}>
    <Text style={styles.title}>VEÍCULO</Text><Text style={styles.subtitle}>PERFIL DO MERIVA + ECU</Text>
    <View style={[styles.vehicleColumns, layout.landscape && styles.vehicleColumnsLandscape]}>
      {profile ? <View style={[styles.hero, layout.landscape && styles.heroLandscape]}><Text style={styles.name}>{profile.vehicleName}</Text><Text style={styles.engine}>{profile.engine} • {profile.displacementCm3} cm³ • {profile.cylinders} cilindros</Text><Text style={styles.fuel}>{profile.fuel}</Text></View> : null}
      <View style={[styles.card, layout.landscape && styles.cardLandscape]}>
      <Row l="ANO" v={profile ? String(profile.year) : 'N/D'} /><Row l="TANQUE" v={profile ? profile.tankCapacityL + ' L' : 'N/D'} />
      <Row l="RESERVA" v={profile ? profile.reserveCapacityL + ' L' : 'N/D'} /><Row l="PROTOCOLO BASE" v={profile?.protocolBaseline ?? 'N/D'} />
        <Row l="ECU" v={state.obd.ecuAddress ?? profile?.ecuAddress ?? 'N/D'} /><Row l="VALIDAÇÃO" v={state.obd.ecuValidatedAt ?? 'NÃO REGISTRADA'} /><Row l="ADAPTADOR" v={state.obd.adapterName ?? 'NÃO CONECTADO'} />
      </View>
    </View>
    <Link href="/bluetooth" asChild><TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>📡 GERENCIAR CONEXÃO</Text></TouchableOpacity></Link>
    <Link href="/" asChild><TouchableOpacity style={styles.back}><Text style={styles.backText}>← VOLTAR</Text></TouchableOpacity></Link>
  </View></ScrollView></SafeAreaView>;
}
function Row({ l, v }: { l: string; v: string }) { return <View style={styles.row}><Text style={styles.label}>{l}</Text><Text style={styles.value}>{v}</Text></View>; }
const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#07111f'},content:{flexGrow:1,width:'100%',paddingVertical:14,paddingBottom:30},screenFrame:{width:'100%',alignSelf:'center'},title:{color:'#f8fafc',fontSize:24,fontWeight:'900'},subtitle:{color:'#7db3ff',fontSize:9,fontWeight:'900',marginTop:3,marginBottom:12},
  vehicleColumns:{width:'100%',gap:10},vehicleColumnsLandscape:{flexDirection:'row',alignItems:'flex-start'},hero:{backgroundColor:'#0f2035',borderRadius:16,borderWidth:1,borderColor:'#2d5278',padding:16,marginBottom:10},name:{color:'#f8fafc',fontSize:23,fontWeight:'900'},engine:{color:'#9fc5f7',fontSize:10,marginTop:5},fuel:{color:'#7185a1',fontSize:10,marginTop:3},
  heroLandscape:{flex:0.72,minWidth:0,marginBottom:0},cardLandscape:{flex:1,minWidth:0},card:{backgroundColor:'#0e1b2d',borderRadius:14,borderWidth:1,borderColor:'#28415f',padding:5},row:{padding:11,borderBottomWidth:1,borderBottomColor:'#1c3048'},label:{flex:1,minWidth:0,color:'#7185a1',fontSize:8,fontWeight:'900'},value:{color:'#dbeafe',fontSize:11,fontWeight:'800',marginTop:3,flexShrink:1,textAlign:'right'},
  primary:{backgroundColor:'#2563eb',borderRadius:11,padding:14,alignItems:'center',marginTop:10},primaryText:{color:'#fff',fontSize:10,fontWeight:'900'},back:{padding:14,alignItems:'center'},backText:{color:'#7db3ff',fontSize:10,fontWeight:'900'}
});