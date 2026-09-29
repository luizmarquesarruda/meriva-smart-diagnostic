import React, { useEffect, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { checkStorageQuota, StorageQuotaConfig } from '../src/storage/quotaManager';

const DEFAULT_QUOTA: StorageQuotaConfig = { limitMb: 2048, warningThreshold: 0.9, cleanupTargetMb: 1536, autoCleanupEnabled: true };

export default function ArmazenamentoScreen() {
  const [basePath, setBasePath] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ warning: boolean; critical: boolean; message: string } | null>(null);
  const [usageBreakdown, setUsageBreakdown] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    async function checkQuota() {
      const path = `${FileSystem.documentDirectory}MERIVA_SMART`;
      setBasePath(path);
      const status = await checkStorageQuota(path, DEFAULT_QUOTA);
      setQuota(status);

      const dirs = ['CONFIG', 'BANCO', 'LEITURAS', 'LOGS', 'APRENDIZADO', 'DTC'];
      const breakdown: { [key: string]: number } = {};
      for (const dir of dirs) {
        const dirPath = `${path}/${dir}`;
        const info = await FileSystem.getInfoAsync(dirPath);
        breakdown[dir] = info.size ? Math.round(info.size / 1024 / 1024) : 0;
      }
      setUsageBreakdown(breakdown);
    }

    void checkQuota();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>ARMAZENAMENTO</Text>
      <Text style={[styles.status, quota?.critical ? styles.critical : quota?.warning ? styles.warning : styles.ok]}>{quota?.message || 'VERIFICANDO'}</Text>
      {Object.entries(usageBreakdown).map(([dir, sizesMb]) => (
        <View key={dir} style={styles.row}>
          <Text style={styles.label}>{dir}</Text>
          <Text style={styles.value}>{sizesMb} MB</Text>
        </View>
      ))}
      <TouchableOpacity style={styles.button}><Text style={styles.buttonText}>LIMPAR DADOS ANTIGOS</Text></TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#eef3fb' },
  title: { fontSize: 24, fontWeight: '700', color: '#1f2937', marginBottom: 16 },
  status: { fontWeight: '700', marginBottom: 16 },
  ok: { color: '#16a34a' },
  warning: { color: '#d97706' },
  critical: { color: '#dc2626' },
  row: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: '#1f2937', fontWeight: '600' },
  value: { color: '#2563eb', fontWeight: '700' },
  button: { backgroundColor: '#2563eb', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
