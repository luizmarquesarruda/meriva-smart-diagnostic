import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { checkStorageQuota, getStorageBreakdown, StorageQuotaConfig } from '../src/storage/quotaManager';
import { cleanupOldLogs, cleanupOldReadings } from '../src/storage/cleanup';

const DEFAULT_QUOTA: StorageQuotaConfig = { limitMb: 2048, warningThreshold: 0.9, cleanupTargetMb: 1536, autoCleanupEnabled: true };

export default function ArmazenamentoScreen() {
  const [basePath,setBasePath]=useState<string|null>(null); const [quota,setQuota]=useState<{warning:boolean;critical:boolean;message:string}|null>(null);
  const [usageBreakdown,setUsageBreakdown]=useState<Record<string,number>>({}); const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false);
  async function refresh(path:string){ setQuota(await checkStorageQuota(path,DEFAULT_QUOTA)); setUsageBreakdown(await getStorageBreakdown(path)); }
  useEffect(()=>{const path=`${FileSystem.documentDirectory}MERIVA_SMART`; setBasePath(path); void refresh(path);},[]);
  async function handleClean(){if(!basePath||busy)return;setBusy(true);setMessage('LIMPANDO...');try{const logs=await cleanupOldLogs(basePath);const readings=await cleanupOldReadings(basePath);setMessage(`REMOVIDOS: ${logs} LOGS • ${readings} LEITURAS`);await refresh(basePath);}catch{setMessage('FALHA NA LIMPEZA');}finally{setBusy(false);}}
  const used=Object.values(usageBreakdown).reduce((a,b)=>a+b,0);
  const percent=Math.min(100,(used/DEFAULT_QUOTA.limitMb)*100);
  return <ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.kicker}>MERIVA SMART</Text><Text style={styles.title}>ARMAZENAMENTO</Text>
    <View style={styles.statusCard}><Text style={styles.statusLabel}>STATUS</Text><Text style={[styles.status,quota?.critical?styles.red:quota?.warning?styles.amber:styles.green]}>{quota?.message||'VERIFICANDO...'}</Text><View style={styles.bar}><View style={[styles.fill,{width:`${percent}%`}]} /></View><Text style={styles.foot}>{used.toFixed(1)} MB usados • limite {DEFAULT_QUOTA.limitMb} MB</Text></View>
    {!!message&&<Text style={styles.message}>{message}</Text>}
    {Object.entries(usageBreakdown).map(([dir,size])=><View key={dir} style={styles.row}><View><Text style={styles.label}>{dir}</Text><Text style={styles.sub}>dados locais do aplicativo</Text></View><Text style={styles.value}>{size.toFixed(1)} MB</Text></View>)}
    <TouchableOpacity style={styles.button} onPress={handleClean} disabled={!basePath||busy}><Text style={styles.buttonText}>{busy?'LIMPANDO...':'LIMPAR DADOS ANTIGOS'}</Text></TouchableOpacity>
    <Text style={styles.note}>A limpeza remove apenas logs e leituras antigas conforme as regras do aplicativo.</Text>
  </ScrollView>;
}
const styles=StyleSheet.create({container:{flexGrow:1,padding:18,backgroundColor:'#0b1118'},kicker:{color:'#7dd3fc',fontSize:12,fontWeight:'800',letterSpacing:2},title:{color:'#f8fafc',fontSize:28,fontWeight:'900',marginBottom:18,marginTop:3},statusCard:{backgroundColor:'#111a24',borderWidth:1,borderColor:'#263646',borderRadius:16,padding:16,marginBottom:16},statusLabel:{color:'#64748b',fontSize:10,fontWeight:'900'},status:{fontSize:16,fontWeight:'900',marginTop:5},green:{color:'#4ade80'},amber:{color:'#fbbf24'},red:{color:'#f87171'},bar:{height:8,backgroundColor:'#25313d',borderRadius:5,overflow:'hidden',marginTop:16},fill:{height:8,backgroundColor:'#38bdf8'},foot:{color:'#64748b',fontSize:11,marginTop:8},message:{color:'#7dd3fc',fontWeight:'800',marginBottom:12},row:{backgroundColor:'#111a24',borderWidth:1,borderColor:'#243443',borderRadius:12,padding:14,marginBottom:8,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},label:{color:'#e2e8f0',fontWeight:'800'},sub:{color:'#64748b',fontSize:10,marginTop:3},value:{color:'#7dd3fc',fontWeight:'900'},button:{backgroundColor:'#0284c7',borderRadius:12,padding:15,alignItems:'center',marginTop:8},buttonText:{color:'#fff',fontWeight:'900'},note:{color:'#64748b',fontSize:11,lineHeight:16,marginTop:12}
});