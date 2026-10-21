import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from './AppIcon';
import { COLORS } from './theme';
import type { StartupProgress } from './startupProgress';

interface StartupScreenProps {
  progress: StartupProgress;
}

export function StartupScreen({ progress }: StartupScreenProps) {
  const isWorking = progress.terminal === 'progress';
  const ecuVerified = progress.terminal === 'ready' && progress.detail.includes('ECU validada');
  const protocolDotColor = ecuVerified
    ? COLORS.success
    : progress.terminal === 'offline' || progress.terminal === 'partial'
      ? COLORS.warning
      : COLORS.accent;
  const fillWidth = `${progress.percent}%` as `${number}%`;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.screen} />
      <View style={styles.root}>
        <View style={styles.center}>
          <View style={styles.logoMark} accessible accessibilityLabel="Logotipo Smart OBD Diagnostic">
            <View style={styles.logoRing}>
              <View style={styles.logoCore}>
                <AppIcon name="vehicle" size={46} color={COLORS.accent} />
              </View>
            </View>
            <View style={styles.obdBadge}>
              <Text style={styles.obdBadgeText}>OBD-II</Text>
            </View>
          </View>
          <Text style={styles.brand}>MERIVA SMART</Text>
          <Text style={styles.subtitle}>DIAGNÓSTICO INTELIGENTE</Text>
          <View style={styles.protocolPill}>
            <Text style={styles.protocolText}>OBD-II</Text>
            <View style={[styles.protocolDot, { backgroundColor: protocolDotColor }]} />
            <Text style={styles.protocolText}>BLUETOOTH CLASSIC</Text>
          </View>
          <View style={styles.statusBlock} accessibilityLiveRegion="polite">
            <Text style={styles.statusTitle}>{progress.title}</Text>
            <Text style={styles.statusDetail}>{progress.detail}</Text>
            {progress.pidDetail ? <Text style={styles.pidProgressDetail}>{progress.pidDetail}</Text> : null}
          </View>
        </View>

        <View style={styles.bottomDock}>
          <View
            style={styles.progressTrack}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`Progresso de inicialização: ${progress.percent}%`}
            accessibilityValue={{ min: 0, max: 100, now: progress.percent }}
          >
            <View style={[styles.progressFill, { width: fillWidth }]} />
          </View>
          <View style={styles.progressMeta}>
            <Text style={styles.progressCaption}>INICIALIZAÇÃO DO DIAGNÓSTICO</Text>
            <View style={styles.percentGroup}>
              {isWorking ? (
                <ActivityIndicator size="small" color={COLORS.accent} />
              ) : (
                <AppIcon name={progress.terminal === 'ready' ? 'check' : 'warning'} size={16} color={progress.terminal === 'ready' ? COLORS.success : COLORS.warning} />
              )}
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
  safeArea: { flex: 1, backgroundColor: COLORS.screen },
  root: { flex: 1, backgroundColor: COLORS.screen, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: 16 },
  logoMark: { width: 106, height: 106, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  logoRing: { width: 94, height: 94, borderRadius: 47, borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.surfaceInset, alignItems: 'center', justifyContent: 'center', elevation: 5 },
  logoCore: { width: 76, height: 76, borderRadius: 38, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  obdBadge: { position: 'absolute', right: 0, bottom: 0, minWidth: 46, height: 25, paddingHorizontal: 7, borderRadius: 8, borderWidth: 1, borderColor: COLORS.accent, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  obdBadgeText: { color: COLORS.textStrong, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  brand: { color: COLORS.textStrong, fontSize: 27, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  subtitle: { color: COLORS.accent, marginTop: 7, fontSize: 11, fontWeight: '800', letterSpacing: 2.1, textAlign: 'center' },
  protocolPill: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.surfaceInset, borderColor: COLORS.border, borderWidth: 1, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8 },
  protocolText: { color: COLORS.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  protocolDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.success },
  statusBlock: { marginTop: 34, width: '100%', maxWidth: 420, minHeight: 82, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { color: COLORS.textStrong, fontSize: 13, fontWeight: '900', letterSpacing: 1.1, textAlign: 'center' },
  statusDetail: { color: COLORS.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 8, maxWidth: 340 },
  pidProgressDetail: { color: COLORS.accent, fontSize: 10, fontWeight: '800', lineHeight: 15, textAlign: 'center', marginTop: 8, maxWidth: 340 },
  bottomDock: { width: '100%', paddingHorizontal: 20, paddingBottom: 12, paddingTop: 14 },
  progressTrack: { height: 5, width: '100%', overflow: 'hidden', backgroundColor: COLORS.surfaceInset, borderRadius: 3, borderWidth: 1, borderColor: COLORS.border },
  progressFill: { height: '100%', minWidth: 3, backgroundColor: COLORS.accent, borderRadius: 3 },
  progressMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 12 },
  progressCaption: { color: COLORS.textSubtle, fontSize: 8, fontWeight: '800', letterSpacing: 1, flexShrink: 1 },
  percentGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  percentText: { color: COLORS.textStrong, fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  disclaimer: { color: COLORS.textSubtle, fontSize: 8, textAlign: 'center', marginTop: 9, lineHeight: 12 },
});
