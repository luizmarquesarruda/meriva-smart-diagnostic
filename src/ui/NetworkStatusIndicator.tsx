import { StyleSheet, Text, View } from 'react-native';
import { AppIcon } from './AppIcon';
import { COLORS } from './theme';
import { getNetworkPresentation } from '../network/networkStatus';
import { useNetworkStatus } from '../network/useNetworkStatus';

export function NetworkStatusIndicator() {
  const presentation = getNetworkPresentation(useNetworkStatus());
  const toneColor = presentation.tone === 'success'
    ? COLORS.success
    : presentation.tone === 'warning'
      ? COLORS.warning
      : presentation.tone === 'danger'
        ? COLORS.danger
        : COLORS.textMuted;
  const internetSummary = presentation.tone === 'success'
    ? 'INTERNET OK'
    : presentation.tone === 'warning'
      ? 'SEM INTERNET'
      : presentation.tone === 'danger'
        ? 'OFFLINE'
        : 'VERIFICANDO';

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <AppIcon name={presentation.icon} size={20} color={toneColor} />
        <Text style={[styles.label, { color: toneColor }]} numberOfLines={1}>{presentation.shortLabel}</Text>
      </View>
      <Text style={[styles.internetStatus, { color: toneColor }]} numberOfLines={1}>{internetSummary}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  label: { fontSize: 13, fontWeight: '900', letterSpacing: 0.3 },
  internetStatus: { fontSize: 10, fontWeight: '900', letterSpacing: 0.1, textAlign: 'center' },
});
