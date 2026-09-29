import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { VehicleProfile } from '../src/database/vehicleConfig';

export default function ConfiguracaoScreen() {
  const [storageBase, setStorageBase] = useState<string | null>(null);
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [status, setStatus] = useState('INICIALIZANDO...');

  useEffect(() => {
    async function initStorage() {
      const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
      const info = await FileSystem.getInfoAsync(basePath);

      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(basePath, { intermediates: true });
        const dirs = ['CONFIG', 'BANCO', 'LEITURAS', 'APRENDIZADO', 'DTC', 'LOGS', 'VIAGENS', 'BACKUP'];
        for (const dir of dirs) {
          await FileSystem.makeDirectoryAsync(`${basePath}/${dir}`, { intermediates: true });
        }
        setStatus('ARMAZENAMENTO CRIADO');
      } else {
        setStatus('ARMAZENAMENTO PRONTO');
      }
      setStorageBase(basePath);
    }

    void initStorage();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CONFIGURAÇÕES</Text>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.info}>Local: {storageBase || 'INICIALIZANDO'}</Text>
      <TouchableOpacity style={styles.button}><Text style={styles.buttonText}>DEFINIR VEÍCULO</Text></TouchableOpacity>
      <TouchableOpacity style={styles.button}><Text style={styles.buttonText}>FAZER BACKUP</Text></TouchableOpacity>
      <TouchableOpacity style={styles.button}><Text style={styles.buttonText}>LIMPAR LOGS ANTIGOS</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#eef3fb' },
  title: { fontSize: 24, fontWeight: '700', color: '#1f2937', marginBottom: 16 },
  status: { color: '#2563eb', fontWeight: '700', marginBottom: 12 },
  info: { color: '#374151', marginBottom: 20 },
  button: { backgroundColor: '#2563eb', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
