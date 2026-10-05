import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { ensureBluetoothReady, discoverPairedDevices } from '../src/obd/bluetoothManager';
import { connectPreferredElm, disconnectSharedObd, getSharedObdConnection, getSharedObdLastError, subscribeSharedObd } from '../src/obd/sharedConnection';
import { readAppSettings } from '../src/database/appSettings';

export default function ConexaoScreen() {
  const [devices, setDevices] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [stage, setStage] = useState('Bluetooth');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [protocol, setProtocol] = useState('N/D');
  const [adapter, setAdapter] = useState('N/D');

  useEffect(() => subscribeSharedObd((c) => {
    if (c) { setAdapter(c.device.name || c.device.address); setProtocol(c.protocol || 'N/D'); setStage('OBD pronto'); }
  }), []);

  async function scan() {
    setBusy(true); setError(''); setStage('Verificando Bluetooth');
    try {
      await ensureBluetoothReady();
      setStage('Procurando ELM327 pareado');
      const list = await discoverPairedDevices();
      setDevices(list);
      setSelected((await readAppSettings(`${FileSystem.documentDirectory}MERIVA_SMART`)).selectedAdapterAddress || list[0]?.address || null);
      setStage(list.length ? 'ELM encontrado' : 'Nenhum adaptador pareado');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setStage('Falha no Bluetooth'); }
    finally { setBusy(false); }
  }

  async function connect() {
    setBusy(true); setError(''); setStage('Conectando Bluetooth → ELM327');
    try {
      const c = await connectPreferredElm(selected);
      setAdapter(c.device.name || c.device.address);
      setProtocol(c.protocol || 'N/D');
      setStage('OBD pronto: ELM + ECU validados');
    } catch (e) { setError(e instanceof Error ? e.message : getSharedObdLastError() || 'Falha ao conectar'); setStage('ELM não respondeu'); }
    finally { setBusy(false); }
  }

  async function disconnect() { await disconnectSharedObd(); setStage('Desconectado'); setProtocol('N/D'); }

  const connected = !!getSharedObdConnection();
  const steps = [['Bluetooth','OK'],['ELM327',connected?'OK':'Aguardando'],['ECU',connected?'OK':'Aguardando'],['OBD',connected?'PRONTO':'Aguardando']];
  return <ScrollView contentContainerStyle={styles.c}>
    <Text style={styles.title}>CONEXÃO ELM327</Text>
    <Text style={styles.sub}>Conexão Bluetooth Classic SPP. O app só libera o OBD depois da validação.</Text>
    <View style={styles.pipeline}>{steps.map(([a,b],i)=><View key={a} style={styles.step}><View style={[styles.dot,b==='OK'||b==='PRONTO'?styles.ok:styles.wait]}><Text>{b==='OK'||b==='PRONTO'?'✓':'○'}</Text></View><Text style={styles.label}>{a}</Text><Text style={styles.value}>{b}</Text>{i<3&&<View style={styles.line}/>}</View>)}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>ESTADO</Text><Text style={styles.big}>{stage}</Text><Text>Adaptador: {adapter}</Text><Text>Protocolo: {protocol}</Text></View>
    <View style={styles.row}><TouchableOpacity style={styles.btn} onPress={scan} disabled={busy}><Text style={styles.btnText}>{busy?'AGUARDANDO...':'BUSCAR PAREADOS'}</Text></TouchableOpacity><TouchableOpacity style={styles.btn} onPress={connect} disabled={busy}><Text style={styles.btnText}>CONECTAR</Text></TouchableOpacity></View>
    {devices.map(d=><TouchableOpacity key={d.address} style={[styles.device,selected===d.address&&styles.selected]} onPress={()=>setSelected(d.address)}><Text style={styles.deviceName}>{d.name||'ELM327'}</Text><Text>{d.address}</Text></TouchableOpacity>)}
    <TouchableOpacity style={styles.secondary} onPress={disconnect} disabled={!connected}><Text style={styles.secondaryText}>DESCONECTAR</Text></TouchableOpacity>
    {error?<Text style={styles.error}>{error}</Text>:null}
  </ScrollView>;
}
const styles=StyleSheet.create({c:{flexGrow:1,padding:16,backgroundColor:'#f5f7fb'},title:{fontSize:23,fontWeight:'900',color:'#123c70'},sub:{color:'#64748b',marginVertical:8},pipeline:{backgroundColor:'#fff',borderRadius:14,padding:14,flexDirection:'row',marginVertical:10},step:{flex:1,alignItems:'center',position:'relative'},dot:{width:28,height:28,borderRadius:14,alignItems:'center',justifyContent:'center',borderWidth:1},ok:{backgroundColor:'#e7f7ed',borderColor:'#9bd3ad'},wait:{backgroundColor:'#f1f5f9',borderColor:'#cbd5e1'},line:{position:'absolute',height:1,backgroundColor:'#d9e1ea',left:'65%',right:'-35%',top:14},label:{fontSize:9,fontWeight:'900',color:'#64748b',marginTop:5},value:{fontSize:9,fontWeight:'800',color:'#26384f'},card:{backgroundColor:'#fff',padding:15,borderRadius:14,borderWidth:1,borderColor:'#dce4ee',marginBottom:10},cardTitle:{fontSize:10,fontWeight:'900',color:'#718096'},big:{fontSize:18,fontWeight:'900',color:'#1769d1',marginVertical:5},row:{flexDirection:'row',gap:8},btn:{flex:1,backgroundColor:'#1769d1',padding:13,borderRadius:10,alignItems:'center'},btnText:{color:'#fff',fontWeight:'900',fontSize:10},device:{backgroundColor:'#fff',padding:12,borderRadius:10,borderWidth:1,borderColor:'#dce4ee',marginTop:8},selected:{borderColor:'#1769d1',borderWidth:2},deviceName:{fontWeight:'900',color:'#26384f'},secondary:{padding:12,alignItems:'center',marginTop:10},secondaryText:{color:'#1769d1',fontWeight:'900'},error:{color:'#bd343c',backgroundColor:'#fff0f1',padding:10,borderRadius:8,marginTop:10,fontWeight:'700'}});
