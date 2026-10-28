import { StyleSheet, Text, View } from 'react-native';
import { AppIcon, type AppIconName } from './AppIcon';
import { COLORS } from './theme';

const states: ReadonlyArray<{ label: string; detail: string; icon: AppIconName; color: string }> = [
  { label: 'MEDIDO', detail: 'Resposta válida de OBD ou GPS.', icon: 'check', color: COLORS.success },
  { label: 'ESTIMADO', detail: 'Calculado por fórmula ou buffer.', icon: 'time', color: COLORS.warning },
  { label: 'REFERÊNCIA', detail: 'Seed/manual; não é leitura atual.', icon: 'knowledge', color: COLORS.accent },
  { label: 'SIMULADO', detail: 'Teste; não misturar ao histórico real.', icon: 'sensors', color: COLORS.textMuted },
  { label: 'INDISPONÍVEL', detail: 'Ausente, inválido ou vencido.', icon: 'warning', color: COLORS.danger },
];

/** Explains provenance; it never upgrades a reading or creates a value. */
export function SourceStatusLegend({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]} accessibilityLabel="Como interpretar a origem e a validade dos dados">
      <View style={styles.heading}>
        <AppIcon name="shield" size={16} color={COLORS.accent} />
        <Text style={styles.headingText}>{compact ? 'ORIGEM DOS DADOS' : 'COMO INTERPRETAR OS DADOS'}</Text>
      </View>
      <View style={styles.grid}>
        {states.map((item) => (
          <View key={item.label} style={[styles.item, compact && styles.itemCompact]}>
            <AppIcon name={item.icon} size={16} color={item.color} />
            <View style={styles.itemCopy}>
              <Text style={[styles.label, { color: item.color }]}>{item.label}</Text>
              {!compact && <Text style={styles.detail}>{item.detail}</Text>}
            </View>
          </View>
        ))}
      </View>
      {!compact && (
        <Text style={styles.note}>
          A origem e o horário da amostra determinam a validade. A legenda explica os estados possíveis; não garante que exista uma leitura atual.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: COLORS.surface, borderRadius: 13, borderWidth: 1, borderColor: COLORS.border, padding: 10, marginBottom: 10 },
  containerCompact: { padding: 9 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  headingText: { color: COLORS.text, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 },
  item: { width: '48%', minHeight: 50, flexDirection: 'row', alignItems: 'flex-start', gap: 6, padding: 7, borderRadius: 9, backgroundColor: COLORS.surfaceInset, borderWidth: 1, borderColor: COLORS.border },
  itemCompact: { width: '31.5%', minHeight: 34, alignItems: 'center', paddingVertical: 6, paddingHorizontal: 5, gap: 5 },
  itemCopy: { flex: 1, minWidth: 0 },
  label: { fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 0.3 },
  detail: { color: COLORS.textMuted, fontSize: 8, lineHeight: 11, marginTop: 2 },
  note: { color: COLORS.textSubtle, fontSize: 8, lineHeight: 12, marginTop: 8 },
});
