import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Elm327Session, ObdTransport } from '../src/obd/elm327';
import { parsePidResponse } from '../src/obd/parser';

class UnavailableTransport implements ObdTransport {
  async open(): Promise<void> { throw new Error('TRANSPORTE BLUETOOTH NÃO CONFIGURADO'); }
  async close(): Promise<void> {}
  async write(): Promise<void> { throw new Error('TRANSPORTE BLUETOOTH NÃO CONFIGURADO'); }
  async readUntilPrompt(): Promise<string> { throw new Error('TRANSPORTE BLUETOOTH NÃO CONFIGURADO'); }
}

export default function LaboratorioScreen() {
  const [pid, setPid] = useState('010C');
  const [tx, setTx] = useState('');
  const [rx, setRx] = useState('');
  const [status, setStatus] = useState('ELM327 NÃO CONECTADO');
  const [error, setError] = useState('');
  const session = useMemo(() => new Elm327Session(new UnavailableTransport()), []);

  async function testPid() {
    setError('');
    setStatus('CONECTANDO...');
    try {
      const result = await session.queryPid(pid);
      setTx(result.tx);
      setRx(result.rx);
      setStatus(result.parsed.status);
    } catch (cause) {
      setStatus('ELM CONECTADO / ECU SEM RESPOSTA');
      setError(cause instanceof Error ? cause.message : 'ERRO DESCONHECIDO');
    }
  }

  const parsed = rx ? parsePidResponse(pid, rx) : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>LABORATÓRIO OBD</Text>
      <Text style={styles.status}>{status}</Text>
      <TextInput value={pid} onChangeText={setPid} autoCapitalize="characters" style={styles.input} placeholder="PID, ex.: 010C" />
      <TouchableOpacity style={styles.button} onPress={testPid}><Text style={styles.buttonText}>TESTAR PID</Text></TouchableOpacity>
      <View style={styles.panel}>
        <Text style={styles.label}>TX</Text><Text style={styles.value}>{tx || 'SEM DADOS'}</Text>
        <Text style={styles.label}>RX</Text><Text style={styles.value}>{rx || 'SEM DADOS'}</Text>
        <Text style={styles.label}>VALOR</Text><Text style={styles.value}>{parsed?.value === null || !parsed ? 'SEM DADOS' : `${parsed.value} ${parsed.unit}`}</Text>
        <Text style={styles.label}>RAW PRESERVADO</Text><Text style={styles.value}>{parsed?.rawResponse || 'SEM DADOS'}</Text>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#eef3fb' },
  title: { fontSize: 24, fontWeight: '700', color: '#1f2937', marginBottom: 14 },
  status: { color: '#2563eb', fontWeight: '700', marginBottom: 16 },
  input: { backgroundColor: '#fff', borderColor: '#cbd5e1', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
  button: { backgroundColor: '#2563eb', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
  panel: { backgroundColor: '#1f2937', borderRadius: 14, padding: 16, marginTop: 18 },
  label: { color: '#93c5fd', marginTop: 8 },
  value: { color: '#f8fafc', fontSize: 16, marginTop: 3 },
  error: { color: '#c2410c', marginTop: 16 },
});
