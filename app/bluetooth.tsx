import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Link } from 'expo-router';
import { BluetoothDeviceInfo } from '../src/obd/bluetoothClassicTransport';
import { discoverPairedDevices, ensureBluetoothReady, createRealElmSession } from '../src/obd/bluetoothManager';
import { getSharedObdConnection, subscribeSharedObd, disconnectSharedObd } from '../src/obd/sharedConnection';
import { readAppSettings, writeAppSettings } from '../src/database/appSettings';

export default function BluetoothScreen() {
  const [devices, setDevices] = useState<BluetoothDeviceInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState('VERIFICANDO BLUETOOTH');
  const [error, setError] = useState('');
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [protocol, setProtocol] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeSharedObd((connection) => {
      setConnectedName(connection?.device.name ?? null);
      setProtocol(connection?.protocol ?? null);
      if (connection) setStatus('ELM327 VALIDADO');
    });
    return unsubscribe;
  }, []);

  const loadPaired = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await ensureBluetoothReady();
      const paired = await discoverPairedDevices();
      setDevices(paired);
      const active = getSharedObdConnection();
      if (active) setSelected(active.device.address);
      setStatus(paired.length ? `${paired.length} DISPOSITIVO(S) PAREADO(S)` : 'NENHUM DISPOSITIVO PAREADO');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'NÃO FOI POSSÍVEL ACESSAR O BLUETOOTH';
      setError(message);
      setStatus('BLUETOOTH NÃO PRONTO');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPaired(); }, [loadPaired]);

  async function connectSelected() {
    if (!selected) return;
    const device = devices.find((item) => item.address === selected);
    if (!device) return;

    setConnecting(true);
    setError('');
    setStatus('ABRINDO BLUETOOTH CLASSIC...');
    try {
      const connection = await createRealElmSession(device);
      const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
      const settings = await readAppSettings(basePath);
      await writeAppSettings(basePath, { ...settings, selectedAdapterAddress: device.address });
      setStatus(connection.protocol ? 'ELM327 CONECTADO E VALIDADO' : 'ELM327 RESPONDEU');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'FALHA AO CONECTAR AO ELM327';
      setError(message);
      setStatus('FALHA DE CONEXÃO');
      Alert.alert('ELM327', message);
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    try {
      await disconnectSharedObd();
      setStatus('DESCONECTADO');
      setConnectedName(null);
      setProtocol(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'FALHA AO DESCONECTAR');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>BLUETOOTH</Text>
          <Text style={styles.subtitle}>ELM327 • BLUETOOTH CLASSIC • SPP</Text>
        </View>

        <View style={styles.connectionCard}>
          <Text style={styles.label}>STATUS</Text>
          <Text style={connectedName ? styles.online : styles.waiting}>{connectedName ? '🟢 CONECTADO' : '🟡 AGUARDANDO'}</Text>
          <Text style={styles.detail}>{connectedName ?? status}</Text>
          {protocol ? <Text style={styles.detail}>PROTOCOLO: {protocol}</Text> : null}
        </View>

        <TouchableOpacity style={styles.primary} onPress={() => void loadPaired()} disabled={loading || connecting}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>BUSCAR DISPOSITIVOS PAREADOS</Text>}
        </TouchableOpacity>

        <Text style={styles.section}>DISPOSITIVOS PAREADOS</Text>
        {devices.map((device) => (
          <TouchableOpacity
            key={device.address}
            style={[styles.device, selected === device.address && styles.selected]}
            onPress={() => setSelected(device.address)}
          >
            <Text style={styles.deviceName}>{device.name || 'DISPOSITIVO SEM NOME'}</Text>
            <Text style={styles.address}>{device.address}</Text>
            <Text style={styles.deviceType}>{device.bonded ? 'PAREADO • BLUETOOTH CLASSIC' : 'DISPOSITIVO'}</Text>
          </TouchableOpacity>
        ))}
        {!devices.length && !loading ? <Text style={styles.empty}>Pareie o ELM327 nas configurações do Android e volte aqui.</Text> : null}

        <TouchableOpacity style={[styles.primary, (!selected || connecting) && styles.disabled]} onPress={() => void connectSelected()} disabled={!selected || connecting}>
          {connecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>CONECTAR E VALIDAR ELM327</Text>}
        </TouchableOpacity>

        {connectedName ? (
          <TouchableOpacity style={styles.secondary} onPress={() => void disconnect()}>
            <Text style={styles.secondaryText}>DESCONECTAR</Text>
          </TouchableOpacity>
        ) : null}

        {error ? <Text style={styles.error}>ERRO: {error}</Text> : null}

        <View style={styles.ruleCard}>
          <Text style={styles.ruleTitle}>COMO O APP CONSIDERA CONECTADO</Text>
          <Text style={styles.rule}>1. Bluetooth do Android autorizado.</Text>
          <Text style={styles.rule}>2. ELM327 pareado localizado.</Text>
          <Text style={styles.rule}>3. Bluetooth Classic / SPP aberto.</Text>
          <Text style={styles.rule}>4. ELM327 responde aos comandos de inicialização.</Text>
          <Text style={styles.rule}>5. ECU responde ao teste OBD.</Text>
          <Text style={styles.rule}>Somente depois disso: 🟢 CONECTADO.</Text>
        </View>

        <View style={styles.bottomNav}>
          <Link href="/" asChild>
            <TouchableOpacity style={styles.bottomItem}>
              <Text style={styles.bottomIcon}>🚗</Text>
              <Text style={styles.bottomText}>CARRO</Text>
            </TouchableOpacity>
          </Link>
          <TouchableOpacity style={[styles.bottomItem, styles.bottomActive]}>
            <Text style={styles.bottomIcon}>🔵</Text>
            <Text style={styles.bottomActiveText}>BLUETOOTH</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220' },
  content: { flexGrow: 1, padding: 14, paddingBottom: 28 },
  header: { paddingVertical: 8, marginBottom: 10 },
  title: { color: '#f8fafc', fontSize: 25, fontWeight: '900', letterSpacing: 1 },
  subtitle: { color: '#7db3ff', fontSize: 10, fontWeight: '900', marginTop: 3, letterSpacing: 0.8 },
  connectionCard: { backgroundColor: '#111c2e', borderRadius: 14, borderWidth: 1, borderColor: '#29415f', padding: 15, marginBottom: 10 },
  label: { color: '#7185a1', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  online: { color: '#4ade80', fontSize: 24, fontWeight: '900', marginTop: 3 },
  waiting: { color: '#fbbf24', fontSize: 24, fontWeight: '900', marginTop: 3 },
  detail: { color: '#cbd5e1', fontSize: 11, marginTop: 4 },
  section: { color: '#7db3ff', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 7, marginBottom: 7 },
  primary: { backgroundColor: '#2563eb', borderRadius: 11, padding: 14, alignItems: 'center', marginBottom: 9 },
  primaryText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  device: { backgroundColor: '#111c2e', borderRadius: 11, borderWidth: 1, borderColor: '#243652', padding: 13, marginBottom: 8 },
  selected: { borderColor: '#60a5fa', borderWidth: 2 },
  deviceName: { color: '#f8fafc', fontSize: 14, fontWeight: '900' },
  address: { color: '#9fb4cf', fontSize: 11, marginTop: 3 },
  deviceType: { color: '#7185a1', fontSize: 9, fontWeight: '800', marginTop: 4 },
  empty: { color: '#94a3b8', fontSize: 11, padding: 10, textAlign: 'center' },
  secondary: { backgroundColor: '#1e293b', borderRadius: 11, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: '#475569', marginBottom: 9 },
  secondaryText: { color: '#e2e8f0', fontWeight: '900', fontSize: 11 },
  error: { color: '#fb7185', fontSize: 10, fontWeight: '800', marginVertical: 8 },
  ruleCard: { backgroundColor: '#111c2e', borderRadius: 12, borderWidth: 1, borderColor: '#243652', padding: 13, marginTop: 4 },
  ruleTitle: { color: '#7db3ff', fontSize: 10, fontWeight: '900', marginBottom: 6 },
  rule: { color: '#a9b9cc', fontSize: 10, lineHeight: 17 },
  bottomNav: { flexDirection: 'row', backgroundColor: '#111c2e', borderRadius: 14, borderWidth: 1, borderColor: '#29415f', marginTop: 12, padding: 5 },
  bottomItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  bottomActive: { backgroundColor: '#1a3150' },
  bottomIcon: { fontSize: 17, marginBottom: 2 },
  bottomText: { color: '#9fb4cf', fontSize: 9, fontWeight: '900' },
  bottomActiveText: { color: '#7db3ff', fontSize: 9, fontWeight: '900' },
});
