import { Link } from 'expo-router';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function IndexScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>MERIVA SMART</Text>
        <Text style={styles.subtitle}>DIAGNOSTIC</Text>
        <Text style={styles.text}>Scanner OBD offline baseado em dados reais</Text>
        <Text style={styles.status}>SEM CONEXÃO ELM327</Text>
      </View>
      <Link href="/laboratorio" asChild>
        <TouchableOpacity style={styles.button}><Text style={styles.buttonText}>LABORATÓRIO OBD</Text></TouchableOpacity>
      </Link>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#eef3fb' },
  card: { backgroundColor: '#1f2937', borderRadius: 18, padding: 24, alignItems: 'center' },
  title: { color: '#dbeafe', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#60a5fa', fontSize: 24, fontWeight: '700', marginBottom: 16 },
  text: { color: '#e5e7eb', textAlign: 'center' },
  status: { color: '#9ca3af', marginTop: 18, fontWeight: '700' },
  button: { backgroundColor: '#2563eb', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
