import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { gpsTracker } from '../src/gps';
import { getMaintenanceStatuses, readMaintenanceState, recordMaintenance, setSevereUse, setVehicleOdometer, type MaintenanceItemStatus, type MaintenanceRecord, type MaintenanceState } from '../src/maintenance/maintenanceService';

const basePath = (FileSystem.documentDirectory ?? '') + 'MERIVA_SMART';

export default function MaintenanceScreen() {
  const [state, setState] = useState<MaintenanceState | null>(null);
  const [odometerInput, setOdometerInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    void readMaintenanceState(basePath).then(setState);
    const unsubscribe = gpsTracker.subscribe((gps) => {
      if (gps.running) void readMaintenanceState(basePath).then(setState);
    });
    return unsubscribe;
  }, []);

  const statuses = useMemo(() => state ? getMaintenanceStatuses(state) : [], [state]);

  async function saveOdometer() {
    const km = Number(odometerInput.replace(',', '.'));
    if (!Number.isFinite(km) || km < 0) return setError('Digite uma quilometragem válida.');
    try { setError(null); setState(await setVehicleOdometer(basePath, km)); setOdometerInput(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
  }

  async function saveRecord(status: MaintenanceItemStatus, value: string, details: Pick<MaintenanceRecord, 'brand' | 'location' | 'observation'>) {
    const km = Number(value.replace(',', '.'));
    if (!Number.isFinite(km) || km < 0) return setError('Digite a quilometragem em que o item foi trocado.');
    try { setSavingId(status.item.id); setError(null); setState(await recordMaintenance(basePath, status.item.id, km, details)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a troca.'); }
    finally { setSavingId(null); }
  }

  return <SafeAreaView style={styles.container}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}><Text style={styles.title}>MANUTENÇÃO</Text><Text style={styles.subtitle}>Plano da Meriva Maxx 1.4 • simples e sem burocracia</Text></View>
    <View style={styles.odometerCard}>
      <Text style={styles.sectionTitle}>QUILOMETRAGEM DO PAINEL</Text>
      <Text style={styles.bigValue}>{state?.vehicleOdometerKm == null ? 'N/D' : Math.round(state.vehicleOdometerKm).toLocaleString('pt-BR') + ' km'}</Text>
      <Text style={styles.help}>Digite o número do hodômetro do painel. O OBD-II padrão não fornece o hodômetro total. O GPS fica separado como distância monitorada e nunca altera este valor.</Text>
      <View style={styles.inputRow}><TextInput value={odometerInput} onChangeText={setOdometerInput} keyboardType="numeric" placeholder="Ex.: 128500" placeholderTextColor="#7185a1" style={styles.input}/><TouchableOpacity style={styles.button} onPress={() => void saveOdometer()}><Text style={styles.buttonText}>SALVAR KM</Text></TouchableOpacity></View>
      <View style={styles.sourceBadge}><Text style={styles.sourceBadgeText}>HODÔMETRO: PAINEL</Text></View><Text style={styles.monitored}>Distância monitorada pelo GPS: {state?.monitoredDistanceKm == null ? '0' : state.monitoredDistanceKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km</Text>
      <View style={styles.switchRow}><View style={{ flex: 1 }}><Text style={styles.switchTitle}>USO SEVERO</Text><Text style={styles.help}>Ative para óleo: 5.000 km ou 6 meses.</Text></View><Switch value={state?.severeUse ?? false} onValueChange={(value) => void setSevereUse(basePath, value).then(setState)}/></View>
    </View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Text style={styles.sectionTitle}>ITENS DO PLANO</Text>
    {statuses.map((status) => <MaintenanceCard key={status.item.id} status={status} saving={savingId === status.item.id} onSave={saveRecord}/>)}
    <Text style={styles.source}>Referência: Manual do Proprietário Chevrolet Meriva 2012, Seção 13. Intervalos não documentados como simples não são inventados pelo aplicativo.</Text>
  </ScrollView></SafeAreaView>;
}

function MaintenanceCard({ status, saving, onSave }: { status: MaintenanceItemStatus; saving: boolean; onSave: (status: MaintenanceItemStatus, value: string, details: Pick<MaintenanceRecord, 'brand' | 'location' | 'observation'>) => Promise<void>; }) {
  const [km, setKm] = useState(status.lastKm == null ? '' : String(Math.round(status.lastKm)));
  const [brand, setBrand] = useState('');
  const [location, setLocation] = useState<MaintenanceRecord['location']>();
  const [observation, setObservation] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => setKm(status.lastKm == null ? '' : String(Math.round(status.lastKm))), [status.lastKm]);
  const statusLabel = status.status === 'VENCIDA' ? 'VENCIDA' : status.status === 'PROXIMA' ? 'PRÓXIMA' : status.status === 'OK' ? 'OK' : 'SEM HISTÓRICO';
  return <View style={styles.card}>
    <View style={styles.cardTop}><View style={{ flex: 1 }}><Text style={styles.itemName}>{status.item.name}</Text><Text style={styles.category}>{status.item.category}</Text></View><Text style={[styles.status, status.status === 'VENCIDA' && styles.statusBad, status.status === 'PROXIMA' && styles.statusWarn]}>{statusLabel}</Text></View>
    <Text style={styles.note}>{status.note}</Text>
    <View style={styles.kmGrid}><View><Text style={styles.label}>ÚLTIMA</Text><Text style={styles.value}>{status.lastKm == null ? 'Não informada' : Math.round(status.lastKm).toLocaleString('pt-BR') + ' km'}</Text></View><View><Text style={styles.label}>PRÓXIMA</Text><Text style={styles.value}>{status.dueKm == null ? 'Manual / condição' : Math.round(status.dueKm).toLocaleString('pt-BR') + ' km'}</Text></View><View><Text style={styles.label}>{status.overdueKm != null ? 'ATRASO' : 'FALTA'}</Text><Text style={styles.value}>{status.remainingKm == null ? 'N/D' : status.remainingKm <= 0 ? Math.round(status.overdueKm ?? 0).toLocaleString('pt-BR') + ' km' : Math.round(status.remainingKm).toLocaleString('pt-BR') + ' km'}</Text></View></View>
    {status.dependentChangesSinceLast != null ? <Text style={styles.dependent}>Trocas de óleo desde este filtro: {status.dependentChangesSinceLast}</Text> : null}
    <View style={styles.inputRow}><TextInput value={km} onChangeText={setKm} keyboardType="numeric" placeholder="KM da troca" placeholderTextColor="#7185a1" style={styles.input}/><TouchableOpacity style={styles.secondaryButton} disabled={saving} onPress={() => void onSave(status, km, { brand, location, observation })}><Text style={styles.buttonText}>{saving ? 'SALVANDO' : 'REGISTRAR TROCA'}</Text></TouchableOpacity></View>
    <TouchableOpacity onPress={() => setDetailsOpen((value) => !value)} style={styles.detailsButton}><Text style={styles.detailsText}>{detailsOpen ? 'OCULTAR DETALHES' : 'DETALHES OPCIONAIS'}</Text></TouchableOpacity>
    {detailsOpen ? <View style={styles.detailsBox}><TextInput value={brand} onChangeText={setBrand} placeholder="Marca (opcional)" placeholderTextColor="#7185a1" style={styles.detailInput}/><View style={styles.locationRow}>{(['CASA','OFICINA','OUTRO'] as const).map((value) => <TouchableOpacity key={value} onPress={() => setLocation(location === value ? undefined : value)} style={[styles.locationButton, location === value && styles.locationSelected]}><Text style={styles.locationText}>{value}</Text></TouchableOpacity>)}</View><TextInput value={observation} onChangeText={setObservation} placeholder="Observação (opcional)" placeholderTextColor="#7185a1" style={[styles.detailInput, styles.observation]} multiline/></View> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220' }, content: { padding: 14, paddingBottom: 30 }, header: { marginBottom: 12 }, title: { color: '#f8fafc', fontSize: 22, fontWeight: '900', letterSpacing: 1 }, subtitle: { color: '#9fb4cf', fontSize: 11, marginTop: 3 }, sectionTitle: { color: '#7db3ff', fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 8 }, odometerCard: { backgroundColor: '#111c2e', borderRadius: 14, borderWidth: 1, borderColor: '#29415f', padding: 14, marginBottom: 14 }, bigValue: { color: '#f8fafc', fontSize: 30, fontWeight: '900', marginBottom: 3 }, help: { color: '#7185a1', fontSize: 10, lineHeight: 15 }, inputRow: { flexDirection: 'row', gap: 8, marginTop: 10 }, input: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: '#34506f', backgroundColor: '#0e192a', color: '#f8fafc', paddingHorizontal: 12, fontWeight: '800' }, button: { backgroundColor: '#2563eb', borderRadius: 10, minHeight: 44, paddingHorizontal: 13, justifyContent: 'center' }, secondaryButton: { backgroundColor: '#1d4ed8', borderRadius: 10, minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' }, buttonText: { color: '#fff', fontSize: 10, fontWeight: '900' }, sourceBadge: { alignSelf: 'flex-start', marginTop: 9, borderRadius: 999, borderWidth: 1, borderColor: '#315b91', paddingHorizontal: 8, paddingVertical: 4 }, sourceBadgeText: { color: '#8fc0ff', fontSize: 8, fontWeight: '900' }, switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#243652' }, switchTitle: { color: '#e5edf7', fontSize: 10, fontWeight: '900' }, error: { color: '#fb7185', fontSize: 11, fontWeight: '800', marginBottom: 10 }, card: { backgroundColor: '#111c2e', borderRadius: 14, borderWidth: 1, borderColor: '#243652', padding: 13, marginBottom: 9 }, cardTop: { flexDirection: 'row', alignItems: 'flex-start' }, itemName: { color: '#f1f5f9', fontSize: 14, fontWeight: '900' }, category: { color: '#7185a1', fontSize: 9, fontWeight: '900', marginTop: 2 }, status: { color: '#4ade80', fontSize: 9, fontWeight: '900' }, statusWarn: { color: '#fbbf24' }, statusBad: { color: '#fb7185' }, note: { color: '#9fb4cf', fontSize: 10, lineHeight: 14, marginTop: 8 }, dependent: { color: '#7db3ff', fontSize: 9, fontWeight: '800', marginTop: 7 }, kmGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }, label: { color: '#60748f', fontSize: 8, fontWeight: '900' }, value: { color: '#e5edf7', fontSize: 12, fontWeight: '900', marginTop: 2 }, detailsButton: { marginTop: 10, alignSelf: 'flex-start' }, detailsText: { color: '#7185a1', fontSize: 8, fontWeight: '900' }, detailsBox: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#243652' }, detailInput: { minHeight: 40, borderRadius: 9, borderWidth: 1, borderColor: '#34506f', backgroundColor: '#0e192a', color: '#f8fafc', paddingHorizontal: 10, marginBottom: 8 }, observation: { minHeight: 60, textAlignVertical: 'top', paddingTop: 10 }, locationRow: { flexDirection: 'row', gap: 6, marginBottom: 8 }, locationButton: { borderWidth: 1, borderColor: '#34506f', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 }, locationSelected: { borderColor: '#7db3ff', backgroundColor: '#17345c' }, locationText: { color: '#9fb4cf', fontSize: 8, fontWeight: '900' }, source: { color: '#60748f', fontSize: 9, lineHeight: 14, marginTop: 8 },
});
