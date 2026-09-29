import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { INITIAL_DRIVE_CYCLES, getDriveCycleSummary, type DriveCycle } from '../src/data/driveCycles';

export default function IndexScreen() {
  const [cycles, setCycles] = useState<DriveCycle[]>(INITIAL_DRIVE_CYCLES);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    async function loadSeededCycles() {
      try {
        const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
        const indexFile = `${basePath}/VIAGENS/index.json`;
        const info = await FileSystem.getInfoAsync(indexFile);

        if (!info.exists) {
          await FileSystem.makeDirectoryAsync(`${basePath}/VIAGENS`, { intermediates: true });
          await FileSystem.writeAsStringAsync(
            indexFile,
            JSON.stringify({ version: '1.0', cycles: INITIAL_DRIVE_CYCLES, totalCount: INITIAL_DRIVE_CYCLES.length }, null, 2),
            { encoding: FileSystem.EncodingType.UTF8 },
          );
        }

        const content = await FileSystem.readAsStringAsync(indexFile);
        const parsed = JSON.parse(content);
        const storedCycles = Array.isArray(parsed?.cycles) ? parsed.cycles : INITIAL_DRIVE_CYCLES;
        setCycles(storedCycles.length ? storedCycles : INITIAL_DRIVE_CYCLES);
      } catch {
        setCycles(INITIAL_DRIVE_CYCLES);
      } finally {
        setIsHydrated(true);
      }
    }

    void loadSeededCycles();
  }, []);

  const summary = useMemo(() => getDriveCycleSummary(cycles), [cycles]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>MERIVA SMART</Text>
          <Text style={styles.subtitle}>DIAGNOSTIC</Text>
          <Text style={styles.text}>Scanner OBD offline baseado em dados reais</Text>
          <Text style={styles.status}>{isHydrated ? 'BASE INICIAL CARREGADA' : 'CARREGANDO BASE...'}</Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Ciclos</Text>
            <Text style={styles.metricValue}>{cycles.length}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Distância</Text>
            <Text style={styles.metricValue}>{summary.totalDistanceKm.toFixed(2)} km</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Consumo</Text>
            <Text style={styles.metricValue}>{summary.avgConsumptionKml.toFixed(2)} km/L</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Média</Text>
            <Text style={styles.metricValue}>{summary.avgSpeedKmh.toFixed(1)} km/h</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>ÚLTIMO CICLO</Text>
          {summary.lastCycle ? (
            <>
              <Text style={styles.row}><Text style={styles.label}>Início:</Text> {summary.lastCycle.startedAt}</Text>
              <Text style={styles.row}><Text style={styles.label}>Fim:</Text> {summary.lastCycle.finishedAt}</Text>
              <Text style={styles.row}><Text style={styles.label}>Distância:</Text> {summary.lastCycle.distanceTotalKm.toFixed(2)} km</Text>
              <Text style={styles.row}><Text style={styles.label}>Consumo:</Text> {summary.lastCycle.avgFuelConsumptionKml.toFixed(3)} km/L</Text>
              <Text style={styles.row}><Text style={styles.label}>Fonte:</Text> {summary.lastCycle.source}</Text>
            </>
          ) : (
            <Text style={styles.empty}>Sem ciclos carregados.</Text>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>HISTÓRICO</Text>
          {cycles.map((cycle) => (
            <View key={cycle.id} style={styles.historyItem}>
              <Text style={styles.historyDate}>{cycle.startedAt}</Text>
              <Text style={styles.historyMeta}>{cycle.distanceTotalKm.toFixed(2)} km • {cycle.avgFuelConsumptionKml.toFixed(3)} km/L</Text>
            </View>
          ))}
        </View>

        <Link href="/laboratorio" asChild>
          <TouchableOpacity style={styles.button}><Text style={styles.buttonText}>LABORATÓRIO OBD</Text></TouchableOpacity>
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef3fb' },
  content: { flexGrow: 1, padding: 20, paddingBottom: 40 },
  card: { backgroundColor: '#1f2937', borderRadius: 18, padding: 24, alignItems: 'center', marginBottom: 18 },
  title: { color: '#dbeafe', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#60a5fa', fontSize: 24, fontWeight: '700', marginBottom: 16 },
  text: { color: '#e5e7eb', textAlign: 'center' },
  status: { color: '#9ca3af', marginTop: 18, fontWeight: '700' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 18 },
  metricCard: { width: '48%', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  metricLabel: { color: '#6b7280', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  metricValue: { color: '#1f2937', fontWeight: '700', fontSize: 18 },
  sectionCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 18 },
  sectionTitle: { color: '#1f2937', fontWeight: '700', fontSize: 16, marginBottom: 10 },
  row: { color: '#374151', marginBottom: 6 },
  label: { fontWeight: '700' },
  empty: { color: '#6b7280' },
  historyItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  historyDate: { color: '#1f2937', fontWeight: '600' },
  historyMeta: { color: '#6b7280', marginTop: 2 },
  button: { backgroundColor: '#2563eb', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
