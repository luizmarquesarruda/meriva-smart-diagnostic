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
  return (
    <View style={styles.container}>
      <AppIcon name={presentation.icon} size={13} color={toneColor} />
      <Text style={[styles.label, { color: toneColor }]} numberOfLines={1}>{presentation.shortLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontSize: 8, fontWeight: '900', letterSpacing: 0.35 },
});
