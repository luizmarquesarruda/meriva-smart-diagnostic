import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import { AppIcon, type AppIconName } from '../src/ui/AppIcon';
import { COLORS, SCREEN_TITLE_STYLE } from '../src/ui/theme';

const groups = [
  { title: 'DIAGNÓSTICO E CONEXÃO', icon: 'diagnostic', hint: 'Validar comunicação, ECU, códigos e sensores.', items: [
    ['manualPid', 'CONSULTA MANUAL DE PID', 'Consultar valores atuais e PIDs descobertos', '/laboratorio'],
    ['sensors', 'TESTES DE SENSORES', 'Cinco leituras válidas por PID', '/testes-sensores'],
    ['health', 'SAÚDE DO VEÍCULO', 'DTCs, evidências e hipóteses locais', '/saude'],
    ['bluetooth', 'BLUETOOTH / ELM327', 'Dispositivos, conexão e validação da ECU', '/bluetooth'],
  ] },
  { title: 'VEÍCULO E CONDUÇÃO', icon: 'vehicle', hint: 'Perfil do veículo, viagens e manutenção.', items: [
    ['vehicle', 'VEÍCULO', 'Perfil, motor, combustível e ECU', '/veiculo'],
    ['trips', 'VIAGENS E GPS', 'Percursos, distância e consumo registrado', '/viagens'],
    ['vehicle', 'MANUTENÇÃO E ABASTECIMENTO', 'Lembretes por km/data e abastecimentos', '/manutencao'],
  ] },
  { title: 'DADOS E APRENDIZADO', icon: 'data', hint: 'Telemetria, origem das leituras e confiança.', items: [
    ['data', 'DADOS EM TEMPO REAL', 'PIDs, séries temporais e estado da ECU', '/dados'],
    ['learning', 'APRENDIZADO', 'Amostras reais, referência e confiança', '/aprendizado'],
  ] },
  { title: 'ARQUIVOS E EXPORTAÇÃO', icon: 'history', hint: 'Espaço usado, fila CSV e arquivos exportados.', items: [
    ['history', 'ARMAZENAMENTO E EXPORTAÇÃO', 'Uso local, limpeza, JSON e CSV', '/armazenamento'],
  ] },
  { title: 'SISTEMA E PREFERÊNCIAS', icon: 'settings', hint: 'Recursos complementares e configuração local.', items: [
    ['connectivity', 'CONECTIVIDADE 4G/5G', 'Rede disponível; diagnóstico segue offline', '/conectividade'],
    ['settings', 'CONFIGURAÇÕES', 'Preferências e parâmetros do aplicativo', '/configuracoes'],
  ] },
] as const;

export default function MaisScreen() {
  const layout = useMidLayout();
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]} showsHorizontalScrollIndicator={false}>
        <View style={[styles.screenFrame, { maxWidth: layout.maxContentWidth }]}>
          <Text style={styles.title}>MAIS RECURSOS</Text>
          <Text style={styles.subtitle}>ATALHOS NATIVOS • DADOS LOCAIS • SEM LOGIN</Text>
          {groups.map((group) => (
            <View key={group.title} style={styles.group}>
              <View style={styles.groupHeading}>
                <View style={styles.groupIconWrap}>
                  <AppIcon name={group.icon as AppIconName} size={21} color={COLORS.accent} />
                </View>
                <View style={styles.groupCopy}>
                  <Text style={styles.groupTitle}>{group.title}</Text>
                  <Text style={styles.groupHint}>{group.hint}</Text>
                </View>
              </View>
              <View style={[styles.itemsGrid, layout.landscape && styles.itemsGridLandscape]}>
                {group.items.map(([icon, title, hint, href]) => (
                  <Link key={href} href={href} asChild>
                    <TouchableOpacity
                      style={[styles.item, layout.landscape && styles.itemLandscape]}
                      accessibilityRole="button"
                      accessibilityLabel={'Abrir ' + title.toLocaleLowerCase('pt-BR')}
                      activeOpacity={0.75}
                    >
                      <View style={styles.iconWrap}>
                        <AppIcon name={icon as AppIconName} size={22} color={COLORS.accent} />
                      </View>
                      <View style={styles.itemBody}>
                        <Text style={styles.itemTitle} numberOfLines={2}>{title}</Text>
                        <Text style={styles.hint} numberOfLines={2}>{hint}</Text>
                      </View>
                      <AppIcon name="arrowRight" size={18} color={COLORS.textSubtle} />
                    </TouchableOpacity>
                  </Link>
                ))}
              </View>
            </View>
          ))}
          <Link href="/" asChild>
            <TouchableOpacity style={styles.back} accessibilityRole="button" accessibilityLabel="Voltar ao cockpit">
              <AppIcon name="back" size={16} color={COLORS.accent} />
              <Text style={styles.backText}>VOLTAR AO COCKPIT</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.screen },
  content: { flexGrow: 1, width: '100%', paddingVertical: 14, paddingBottom: 30 },
  screenFrame: { width: '100%', alignSelf: 'center' },
  group: { marginBottom: 13 },
  groupHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 7, paddingHorizontal: 2 },
  groupIconWrap: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceInset, borderWidth: 1, borderColor: COLORS.border },
  groupCopy: { flex: 1, minWidth: 0 },
  groupTitle: { color: COLORS.textStrong, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  groupHint: { color: COLORS.textSubtle, fontSize: 9, lineHeight: 13, marginTop: 2 },
  itemsGrid: { width: '100%' },
  itemsGridLandscape: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { backgroundColor: COLORS.surface, borderRadius: 13, borderWidth: 1, borderColor: COLORS.border, padding: 11, marginBottom: 7, flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 64 },
  itemLandscape: { width: '48.5%', marginBottom: 0 },
  iconWrap: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surfaceInset, borderWidth: 1, borderColor: COLORS.border },
  itemBody: { flex: 1, minWidth: 0 },
  itemTitle: { color: COLORS.text, fontSize: 11, lineHeight: 15, fontWeight: '900' },
  hint: { color: COLORS.textSubtle, fontSize: 9, lineHeight: 13, marginTop: 3 },
  title: { ...SCREEN_TITLE_STYLE, marginBottom: 6 },
  subtitle: { color: COLORS.accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginTop: 3, marginBottom: 15 },
  back: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  backText: { color: COLORS.accent, fontSize: 10, fontWeight: '900' },
});
