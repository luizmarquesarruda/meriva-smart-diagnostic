import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getSharedObdConnection } from '../src/obd/sharedConnection';
import { gpsTracker } from '../src/gps';

type Metric={label:string;value:string};
const defs=[['010C','RPM'],['0105','TEMP'],['010F','IAT'],['010B','MAP'],['0111','TPS']];
export default function TempoRealScreen(){
 const [metrics,setMetrics]=useState<Metric[]>(defs.map(x=>({label:x[1],value:'N/D'})));
 const [gps,setGps]=useState(gpsTracker.getState());
 const running=useRef(false);
 useEffect(()=>gpsTracker.subscribe(setGps),[]);
 useEffect(()=>{let alive=true; async function poll(){if(!alive)return;const c=getSharedObdConnection();if(c&&!running.current){running.current=true;for(const [pid,label] of defs){try{const r=await c.session.queryPid(pid);const v=r.parsed.value; if(alive)setMetrics(m=>m.map(x=>x.label===label?{label,value:v==null?'N/D':`${v} ${r.parsed.unit||''}`}:x));}catch{} }running.current=false;} setTimeout(poll,1200)} poll();return()=>{alive=false}},[]);
 return <ScrollView contentContainerStyle={styles.c}><Text style={styles.title}>DADOS EM TEMPO REAL</Text><Text style={styles.sub}>Somente PIDs que responderem são exibidos como dados válidos.</Text><View style={styles.grid}>{metrics.map(m=><View key={m.label} style={styles.card}><Text style={styles.label}>{m.label}</Text><Text style={styles.value}>{m.value}</Text></View>)}</View><View style={styles.card}><Text style={styles.label}>GPS</Text><Text style={styles.value}>{gps.currentSpeedKmh.toFixed(1)} km/h</Text><Text style={styles.meta}>{gps.distanceKm.toFixed(2)} km • precisão {gps.lastAccuracyM==null?'N/D':gps.lastAccuracyM.toFixed(0)+' m'}</Text></View></ScrollView>
}
const styles=StyleSheet.create({c:{flexGrow:1,padding:16,backgroundColor:'#f5f7fb'},title:{fontSize:23,fontWeight:'900',color:'#123c70'},sub:{color:'#64748b',marginVertical:8},grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'},card:{width:'48.5%',backgroundColor:'#fff',borderRadius:14,borderWidth:1,borderColor:'#dce4ee',padding:14,marginBottom:9},label:{color:'#8291a3',fontSize:9,fontWeight:'900'},value:{fontSize:20,fontWeight:'900',color:'#26384f',marginTop:5},meta:{color:'#64748b',fontSize:10,marginTop:5}});
