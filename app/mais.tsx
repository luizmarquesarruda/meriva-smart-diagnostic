import { Link } from 'expo-router';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AdaptiveText as Text } from '../src/ui/AdaptiveText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import { AppIcon, AppIconBadge, type AppIconName } from '../src/ui/AppIcon';

const items = [
  ['sensors', 'TESTES DE SENSORES', 'Varredura guiada com motor desligado ou ligado', '/testes-sensores'],
  ['charts', 'DADOS AO VIVO', 'Telemetria, tendências e indicadores', '/dados'],
  ['learning', 'APRENDIZADO', 'Amostras reais, confiança e contaminação', '/aprendizado'],
  ['health', 'SAÚDE', 'DTCs, evidências e hipóteses locais', '/saude'],
  ['history', 'HISTÓRICO E ARQUIVOS', 'Autosave, TXT e exportações', '/armazenamento'],
  ['settings', 'CONFIGURAÇÕES', 'Preferências e parâmetros do aplicativo', '/configuracoes'],
] as const;

export default function MaisScreen() {
  const layout = useMidLayout();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
        showsHorizontalScrollIndicator={false}
      >
        <View style={[styles.screenFrame, { maxWidth: layout.maxContentWidth }]}>
          <View style={styles.headingRow}>
            <AppIconBadge name="vehicle" size={42} color="#e8b54b" />
            <View style={styles.headingCopy}>
              <Text style={styles.title}>MAIS RECURSOS</Text>
              <Text style={styles.subtitle}>MÓDULOS DO MERIVA SMART</Text>
            </View>
          </View>

          <View style={[styles.itemsGrid, layout.landscape && styles.itemsGridLandscape]}>
            {items.map(([icon, title, hint, href]) => (
              <Link key={href} href={href} asChild>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={title + '. ' + hint}
                  activeOpacity={0.82}
                  style={[styles.item, layout.landscape && styles.itemLandscape]}
                >
                  <View style={styles.tileTopRow}>
                    <AppIconBadge
                      name={icon}
                      size={42}
                      color={icon === 'learning' || icon === 'health' ? '#e8b54b' : '#7db3ff'}
                    />
                    <View style={styles.tileArrow}><AppIcon name="forward" size={18} color="#7db3ff" /></View>
                  </View>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemTitle} numberOfLines={2}>{title}</Text>
                    <Text style={styles.hint} numberOfLines={3}>{hint}</Text>
                  </View>
                </TouchableOpacity>
              </Link>
            ))}
          </View>

          <Link href="/" asChild>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Voltar ao cockpit principal"
              style={styles.back}
            >
              <AppIcon name="back" size={18} color="#7db3ff" />
              <Text style={styles.backText}>VOLTAR AO COCKPIT</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07111f' },
  content: { flexGrow: 1, width: '100%', paddingVertical: 14, paddingBottom: 30 },
  screenFrame: { width: '100%', alignSelf: 'center' },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 16 },
  headingCopy: { flex: 1, minWidth: 0 },
  itemsGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  itemsGridLandscape: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  title: { color: '#f8fafc', fontSize: 24, fontWeight: '900', letterSpacing: 1 },
  subtitle: { color: '#7db3ff', fontSize: 12, fontWeight: '900', letterSpacing: 1, marginTop: 4 },
  item: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#0e1b2d',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#28415f',
    padding: 12,
    minHeight: 142,
    marginBottom: 0,
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 10,
  },
  itemLandscape: { width: '48%', flexGrow: 1, minHeight: 134 },
  tileTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tileArrow: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#102743', alignItems: 'center', justifyContent: 'center' },
  itemCopy: { flex: 1, minWidth: 0 },
  itemTitle: { color: '#f1f5f9', fontSize: 14, lineHeight: 19, fontWeight: '900' },
  hint: { color: '#a7bad3', fontSize: 12, lineHeight: 17, marginTop: 4 },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: 16,
    minHeight: 50,
  },
  backText: { color: '#7db3ff', fontSize: 13, fontWeight: '900' },
});
