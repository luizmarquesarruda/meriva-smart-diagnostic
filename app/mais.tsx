import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import { AppIcon, type AppIconName } from '../src/ui/AppIcon';
import { COLORS, SCREEN_TITLE_STYLE } from '../src/ui/theme';

const items = [
  ['manualPid', 'CONSULTA MANUAL DE PID', 'Consultar valores atuais e escolher códigos da lista descoberta', '/laboratorio'],
  ['sensors', 'TESTES DE SENSORES', 'Varredura guiada com cinco leituras válidas por PID', '/testes-sensores'],
  ['vehicle', 'VEÍCULO', 'Perfil, motor, combustível e ECU', '/veiculo'],
  ['trips', 'VIAGENS', 'Distância, consumo e ciclos registrados', '/viagens'],
  ['learning', 'APRENDIZADO', 'Amostras reais, confiança e contaminação', '/aprendizado'],
  ['health', 'SAÚDE', 'DTCs, evidências e hipóteses locais', '/saude'],
  ['bluetooth', 'BLUETOOTH / ELM327', 'Dispositivos, conexão e validação', '/bluetooth'],
  ['connectivity', 'CONECTIVIDADE 4G/5G', 'Rede ativa, internet, geração móvel e modo offline', '/conectividade'],
  ['history', 'HISTÓRICO E ARQUIVOS', 'Autosave, TXT e exportações', '/armazenamento'],
  ['settings', 'CONFIGURAÇÕES', 'Preferências e parâmetros do aplicativo', '/configuracoes'],
] as const;

export default function MaisScreen() {
  const layout = useMidLayout();
  return (
    <SafeAreaView style={styles.container} edges={["top","bottom","left","right"]}>
      <ScrollView contentContainerStyle={[styles.content,{paddingHorizontal:layout.horizontalPadding}]} showsHorizontalScrollIndicator={false}>
        <View style={[styles.screenFrame,{maxWidth:layout.maxContentWidth}]}>
          <Text style={styles.title}>MAIS RECURSOS</Text>
          <Text style={styles.subtitle}>MÓDULOS DO SMART OBD DIAGNOSTIC</Text>
          <View style={[styles.itemsGrid, layout.landscape && styles.itemsGridLandscape]}>
            {items.map(([icon,title,hint,href]) => (
              <Link key={href} href={href} asChild>
                <TouchableOpacity style={[styles.item, layout.landscape && styles.itemLandscape]} accessibilityRole="button">
                  <View style={styles.iconWrap}><AppIcon name={icon as AppIconName} size={23} color={COLORS.accent} /></View>
                  <View style={styles.itemBody}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{title}</Text>
                    <Text style={styles.hint} numberOfLines={2}>{hint}</Text>
                  </View>
                  <AppIcon name="arrowRight" size={19} color={COLORS.textSubtle} />
                </TouchableOpacity>
              </Link>
            ))}
          </View>
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
  container:{flex:1,backgroundColor:COLORS.screen},
  content:{flexGrow:1,width:'100%',paddingVertical:14,paddingBottom:30},
  screenFrame:{width:'100%',alignSelf:'center'},
  itemsGrid:{width:'100%'},
  itemsGridLandscape:{flexDirection:'row',flexWrap:'wrap',gap:8},
  item:{backgroundColor:COLORS.surface,borderRadius:14,borderWidth:1,borderColor:COLORS.border,padding:13,marginBottom:8,flexDirection:'row',alignItems:'center',gap:10,minHeight:68},
  itemLandscape:{width:'48.5%',marginBottom:0},
  iconWrap:{width:32,height:32,alignItems:'center',justifyContent:'center'},
  itemBody:{flex:1,minWidth:0},
  itemTitle:{color:COLORS.text,fontSize:12,fontWeight:'900'},
  hint:{color:COLORS.textSubtle,fontSize:9,marginTop:3},
  title:{...SCREEN_TITLE_STYLE,marginBottom:6},
  subtitle:{color:COLORS.accent,fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:3,marginBottom:14},
  back:{minHeight:48,padding:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7},
  backText:{color:COLORS.accent,fontSize:10,fontWeight:'900'},
});
