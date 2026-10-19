import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { StartupProgress } from './startupProgress';

interface StartupScreenProps {
  progress: StartupProgress;
}

export function StartupScreen({ progress }: StartupScreenProps) {
  const isWorking = progress.terminal === 'progress';
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar barStyle="light-content" backgroundColor="#07111f" />
      <View style={styles.root}>
        <View style={styles.center}>
          <View style={styles.logoMark} accessibilityLabel="Logotipo Meriva Smart, diagnóstico OBD-II">
            <View style={styles.logoRing}><View style={styles.logoCore}><Text style={styles.carGlyph}>🚘</Text></View></View>
            <View style={styles.obdBadge}><Text style={styles.obdBadgeText}>OBD</Text></View>
          </View>
          <Text style={styles.brand}>MERIVA SMART</Text>
          <Text style={styles.subtitle}>DIAGNÓSTICO INTELIGENTE</Text>
          <View style={styles.protocolPill}>
            <Text style={styles.protocolText}>OBD-II</Text><View style={styles.protocolDot} /><Text style={styles.protocolText}>BLUETOOTH CLASSIC</Text>
          </View>
          <View style={styles.statusBlock} accessibilityLiveRegion="polite">
            <Text style={styles.statusTitle}>{progress.title}</Text>
            <Text style={styles.statusDetail}>{progress.detail}</Text>
          </View>
        </View>
        <View style={styles.bottomDock}>
          <View style={styles.progressTrack} accessible accessibilityRole="progressbar" accessibilityLabel={'Progresso de inicialização: ' + progress.percent + '%'} accessibilityValue={{ min: 0, max: 100, now: progress.percent }}>
            <View style={[styles.progressFill, { width: (String(progress.percent) + '%') as any }]} />
          </View>
          <View style={styles.progressMeta}>
            <Text style={styles.progressCaption}>INICIALIZAÇÃO DO DIAGNÓSTICO</Text>
            <View style={styles.percentGroup}>
              {isWorking ? <ActivityIndicator size="small" color="#60a5fa" /> : <Text style={[styles.terminalMark, progress.terminal === 'ready' ? styles.readyMark : styles.offlineMark]}>{progress.terminal === 'ready' ? '✓' : '!'}</Text>}
              <Text style={styles.percentText}>{progress.percent}%</Text>
            </View>
          </View>
          <Text style={styles.disclaimer}>A conexão só é confirmada após uma resposta OBD válida da ECU.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#07111f' },
  root: { flex: 1, backgroundColor: '#07111f', justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: 16 },
  logoMark: { width: 106, height: 106, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  logoRing: { width: 94, height: 94, borderRadius: 47, borderWidth: 2, borderColor: '#2c5f91', backgroundColor: '#0b1c31', alignItems: 'center', justifyContent: 'center', shadowColor: '#3b82f6', shadowOpacity: 0.28, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 5 },
  logoCore: { width: 76, height: 76, borderRadius: 38, borderWidth: 1, borderColor: '#244665', backgroundColor: '#102641', alignItems: 'center', justifyContent: 'center' },
  carGlyph: { fontSize: 43, includeFontPadding: false },
  obdBadge: { position: 'absolute', right: 0, bottom: 0, minWidth: 42, height: 25, paddingHorizontal: 7, borderRadius: 8, borderWidth: 1, borderColor: '#5d96d2', backgroundColor: '#173958', alignItems: 'center', justifyContent: 'center' },
  obdBadgeText: { color: '#d9ecff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  brand: { color: '#f4f8ff', fontSize: 25, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  subtitle: { color: '#85a9cf', marginTop: 7, fontSize: 11, fontWeight: '800', letterSpacing: 2.1, textAlign: 'center' },
  protocolPill: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0c1b2c', borderColor: '#213d5d', borderWidth: 1, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8 },
  protocolText: { color: '#9bb6d5', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  protocolDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#4ade80' },
  statusBlock: { marginTop: 34, width: '100%', maxWidth: 420, minHeight: 82, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { color: '#e5edf7', fontSize: 13, fontWeight: '900', letterSpacing: 1.1, textAlign: 'center' },
  statusDetail: { color: '#8196b1', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 8, maxWidth: 340 },
  bottomDock: { width: '100%', paddingHorizontal: 20, paddingBottom: 12, paddingTop: 14 },
  progressTrack: { height: 5, width: '100%', overflow: 'hidden', backgroundColor: '#182a40', borderRadius: 3, borderWidth: 1, borderColor: '#243e5d' },
  progressFill: { height: '100%', minWidth: 3, backgroundColor: '#60a5fa', borderRadius: 3 },
  progressMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 12 },
  progressCaption: { color: '#7186a1', fontSize: 8, fontWeight: '800', letterSpacing: 1, flexShrink: 1 },
  percentGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  percentText: { color: '#d5e8ff', fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  terminalMark: { fontSize: 12, fontWeight: '900' },
  readyMark: { color: '#4ade80' },
  offlineMark: { color: '#fbbf24' },
  disclaimer: { color: '#51657e', fontSize: 8, textAlign: 'center', marginTop: 9, lineHeight: 12 },
});
