import { Link } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AppIcon } from '../src/ui/AppIcon';
import { COLORS } from '../src/ui/theme';

/**
 * Floot layout port preview.
 * Native Expo implementation of the Floot cockpit visual structure.
 * All vehicle readings remain N/D until supplied by the real OBD services.
 */
export default function FlootLayoutPreviewScreen() {
  const nav = [
    { href: '/', icon: 'cockpit' as const, label: 'Painel' },
    { href: '/bluetooth', icon: 'bluetooth' as const, label: 'Conexões' },
    { href: '/laboratorio', icon: 'diagnostic' as const, label: 'Diagnóstico' },
    { href: '/viagens', icon: 'trips' as const, label: 'Viagem' },
    { href: '/dados', icon: 'data' as const, label: 'Laboratório' },
    { href: '/mais', icon: 'more' as const, label: 'Configurações' },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar style="light" backgroundColor={styles.screen.backgroundColor as string} />
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text numberOfLines={1} style={styles.brand}>MERIVA SMART</Text>
            <Text style={styles.subtitle}>COCKPIT DE DIAGNÓSTICO</Text>
          </View>
          <View style={styles.connectionPill}>
            <View style={styles.statusDot} />
            <Text style={styles.connectionText}>ECU DESCONECTADA</Text>
          </View>
        </View>

        <View style={styles.weatherCard}>
          <View style={styles.weatherIcon}><AppIcon name="weather" size={25} color={COLORS.accent} /></View>
          <View style={styles.weatherCopy}>
            <Text style={styles.weatherTitle}>MERIVA MAXX 1.4</Text>
            <Text style={styles.weatherValue}>N/D <Text style={styles.weatherDescription}>CLIMA INDISPONÍVEL</Text></Text>
          </View>
          <View style={styles.networkCopy}>
            <AppIcon name="network" size={23} color={COLORS.success} />
            <Text style={styles.networkTitle}>REDE</Text>
            <Text style={styles.networkState}>NÃO VERIFICADA</Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>DADOS OBD EM TEMPO REAL</Text>
          <Text style={styles.heroValue}>N/D</Text>
          <Text style={styles.heroHint}>CONECTE A ECU PARA IDENTIFICAR OS PIDs SUPORTADOS</Text>
          <Text style={styles.switchHint}>◌  PIDs 1/1  •  OBD  •  TOQUE PARA TROCAR  •  10 S</Text>
          <View style={styles.metricRow}>
            <Metric label="MÉDIA HISTÓRICA" />
            <Metric label="AUTONOMIA ATUAL" />
            <Metric label="FALHAS ATIVAS" />
          </View>
          <View style={styles.coolantCard}>
            <View style={styles.coolantCopy}>
              <View style={styles.coolantHeading}><AppIcon name="coolant" size={17} color={COLORS.accent} /><Text style={styles.coolantLabel}>LÍQUIDO DE ARREFECIMENTO</Text></View>
              <Text style={styles.coolantHint}>ECU DESCONECTADA</Text>
            </View>
            <Text style={styles.coolantValue}>N/D</Text>
          </View>
        </View>

        <View style={styles.spacer} />
        <View style={styles.bottomNav}>
          {nav.map((item, index) => (
            <Link key={item.href} href={item.href as never} asChild>
              <TouchableOpacity
                style={styles.navItem}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityHint={`Abre a seção ${item.label}`}
                activeOpacity={0.75}
              >
                <AppIcon name={item.icon} size={28} color={index === 0 ? '#f8fafc' : COLORS.accent} />
              </TouchableOpacity>
            </Link>
          ))}
        </View>
        <Text style={styles.footer}>DIÁRIO DE BORDO • AGUARDANDO ECU</Text>
      </View>
    </SafeAreaView>
  );
}

function Metric({ label }: { label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>N/D</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#07111f' },
  page: { flex: 1, paddingHorizontal: 14, paddingTop: 7, paddingBottom: 7 },
  header: { minHeight: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9, paddingHorizontal: 15, paddingVertical: 12, backgroundColor: '#0e1b2d', borderRadius: 17, borderWidth: 1, borderColor: '#28415f', marginBottom: 8 },
  headerCopy: { flex: 1, minWidth: 0 },
  brand: { color: '#f8fafc', fontSize: 20, fontWeight: '900', letterSpacing: 1.05 },
  subtitle: { color: '#7db3ff', fontSize: 10, fontWeight: '900', letterSpacing: 1.05, marginTop: 4 },
  connectionPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#091526', borderRadius: 20, borderWidth: 1, borderColor: '#29415f', flexShrink: 0 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fb7185' },
  connectionText: { color: '#dbeafe', fontSize: 9, fontWeight: '900' },
  weatherCard: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#0e1b2d', borderRadius: 16, borderWidth: 1, borderColor: '#28415f', marginBottom: 9 },
  weatherIcon: { width: 43, height: 43, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#091526', borderWidth: 1, borderColor: '#29415f' },
  weatherCopy: { flex: 1, minWidth: 0 },
  weatherTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '900', letterSpacing: 0.4 },
  weatherValue: { color: '#f8fafc', fontSize: 26, lineHeight: 32, fontWeight: '900', marginTop: 2 },
  weatherDescription: { color: '#9aacc4', fontSize: 10, fontWeight: '800' },
  networkCopy: { alignItems: 'center', justifyContent: 'center', minWidth: 92, gap: 3 },
  networkTitle: { color: '#4ade80', fontSize: 14, fontWeight: '900' },
  networkState: { color: '#4ade80', fontSize: 8, fontWeight: '900' },
  heroCard: { backgroundColor: '#0f2035', borderRadius: 20, borderWidth: 1, borderColor: '#2d5278', padding: 12, alignItems: 'center' },
  eyebrow: { color: '#7db3ff', fontSize: 11, fontWeight: '900', letterSpacing: 1.35, textAlign: 'center' },
  heroValue: { color: '#f8fafc', fontSize: 58, lineHeight: 66, fontWeight: '900', marginTop: 2 },
  heroHint: { color: '#8fa6c1', fontSize: 10, fontWeight: '800', letterSpacing: 0.4, textAlign: 'center' },
  switchHint: { color: '#6884a6', fontSize: 9, fontWeight: '900', letterSpacing: 0.4, marginTop: 7, textAlign: 'center' },
  metricRow: { width: '100%', flexDirection: 'row', gap: 7, marginTop: 12 },
  metric: { flex: 1, minWidth: 0, minHeight: 70, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, paddingVertical: 8, backgroundColor: '#091626', borderRadius: 12, borderWidth: 1, borderColor: '#233d5b' },
  metricLabel: { color: '#9aacc4', fontSize: 8, fontWeight: '900', textAlign: 'center' },
  metricValue: { color: '#e5edf7', fontSize: 17, fontWeight: '900', marginTop: 6 },
  coolantCard: { width: '100%', minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: '#091626', borderRadius: 13, borderWidth: 1, borderColor: '#315579' },
  coolantCopy: { flex: 1, minWidth: 0 },
  coolantHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  coolantLabel: { color: '#c5d8f2', fontSize: 10, fontWeight: '900' },
  coolantHint: { color: '#7185a1', fontSize: 9, fontWeight: '800', marginTop: 5 },
  coolantValue: { color: '#8fa6c1', fontSize: 28, fontWeight: '900' },
  spacer: { flexGrow: 1, minHeight: 12 },
  bottomNav: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 7, paddingVertical: 5, gap: 2, backgroundColor: '#0e1b2d', borderRadius: 17, borderWidth: 1, borderColor: '#28415f' },
  navItem: { flex: 1, minWidth: 0, minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  footer: { color: '#60748f', textAlign: 'center', fontSize: 9, marginTop: 10 },
});
