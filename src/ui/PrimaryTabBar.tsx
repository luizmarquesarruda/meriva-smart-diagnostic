import { Link } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from './AppIcon';
import { COLORS } from './theme';

export type PrimaryTabKey = 'cockpit' | 'diagnostic' | 'data' | 'trips' | 'more';

export function PrimaryTabBar({ active }: { active: PrimaryTabKey }) {
  return (
    <View style={styles.bar} accessibilityLabel="Navegação principal">
      <Link href="/" asChild>
        <TouchableOpacity style={[styles.tab, active === 'cockpit' && styles.tabActive]} activeOpacity={0.78} accessibilityRole="tab" accessibilityState={{ selected: active === 'cockpit' }} accessibilityLabel={active === 'cockpit' ? 'Painel, seção atual' : 'Painel'} accessibilityHint="Abre o cockpit do veículo">
          <AppIcon name="cockpit" size={21} color={active === 'cockpit' ? COLORS.textStrong : COLORS.accent} />
          <Text style={[styles.tabLabel, active === 'cockpit' && styles.tabLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Painel</Text>
        </TouchableOpacity>
      </Link>
      <Link href="/laboratorio" asChild>
        <TouchableOpacity style={[styles.tab, active === 'diagnostic' && styles.tabActive]} activeOpacity={0.78} accessibilityRole="tab" accessibilityState={{ selected: active === 'diagnostic' }} accessibilityLabel={active === 'diagnostic' ? 'Diagnóstico, seção atual' : 'Diagnóstico'} accessibilityHint="Abre o diagnóstico OBD e a consulta manual de PIDs">
          <AppIcon name="diagnostic" size={21} color={active === 'diagnostic' ? COLORS.textStrong : COLORS.accent} />
          <Text style={[styles.tabLabel, active === 'diagnostic' && styles.tabLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Diagnóstico</Text>
        </TouchableOpacity>
      </Link>
      <Link href="/dados" asChild>
        <TouchableOpacity style={[styles.tab, active === 'data' && styles.tabActive]} activeOpacity={0.78} accessibilityRole="tab" accessibilityState={{ selected: active === 'data' }} accessibilityLabel={active === 'data' ? 'Dados, seção atual' : 'Dados'} accessibilityHint="Abre as leituras e gráficos de telemetria">
          <AppIcon name="data" size={21} color={active === 'data' ? COLORS.textStrong : COLORS.accent} />
          <Text style={[styles.tabLabel, active === 'data' && styles.tabLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Dados</Text>
        </TouchableOpacity>
      </Link>
      <Link href="/viagens" asChild>
        <TouchableOpacity style={[styles.tab, active === 'trips' && styles.tabActive]} activeOpacity={0.78} accessibilityRole="tab" accessibilityState={{ selected: active === 'trips' }} accessibilityLabel={active === 'trips' ? 'Viagens, seção atual' : 'Viagens'} accessibilityHint="Abre as viagens registradas">
          <AppIcon name="trips" size={21} color={active === 'trips' ? COLORS.textStrong : COLORS.accent} />
          <Text style={[styles.tabLabel, active === 'trips' && styles.tabLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Viagens</Text>
        </TouchableOpacity>
      </Link>
      <Link href="/mais" asChild>
        <TouchableOpacity style={[styles.tab, active === 'more' && styles.tabActive]} activeOpacity={0.78} accessibilityRole="tab" accessibilityState={{ selected: active === 'more' }} accessibilityLabel={active === 'more' ? 'Mais recursos, seção atual' : 'Mais recursos'} accessibilityHint="Abre os módulos complementares do aplicativo">
          <AppIcon name="more" size={21} color={active === 'more' ? COLORS.textStrong : COLORS.accent} />
          <Text style={[styles.tabLabel, active === 'more' && styles.tabLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Mais</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { width: '100%', flexDirection: 'row', gap: 3, padding: 4, marginTop: 8, backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border },
  tab: { flex: 1, minWidth: 0, minHeight: 58, paddingHorizontal: 2, paddingVertical: 5, borderRadius: 11, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabActive: { backgroundColor: '#17345b', borderWidth: 1, borderColor: '#315c8c' },
  tabLabel: { color: COLORS.textMuted, fontSize: 8, lineHeight: 10, fontWeight: '800', letterSpacing: -0.15, textAlign: 'center', flexShrink: 1 },
  tabLabelActive: { color: COLORS.textStrong },
});
