import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import { AppIcon } from '../src/ui/AppIcon';
import { COLORS, SCREEN_TITLE_STYLE } from '../src/ui/theme';
import { getNetworkPresentation } from '../src/network/networkStatus';
import { useNetworkStatus } from '../src/network/useNetworkStatus';
import { getLocationProviderPresentation, normalizeLocationProviderSnapshot, type LocationProviderPresentation } from '../src/network/locationProviders';

export default function ConectividadeScreen() {
  const layout = useMidLayout();
  const snapshot = useNetworkStatus();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [providerPresentation, setProviderPresentation] = useState<LocationProviderPresentation | null>(null);
  const [providerStatusFailed, setProviderStatusFailed] = useState(false);

  const refreshLocationProviders = useCallback(async () => {
    try {
      const status = await Location.getProviderStatusAsync();
      setProviderPresentation(getLocationProviderPresentation(normalizeLocationProviderSnapshot(status)));
      setProviderStatusFailed(false);
    } catch {
      setProviderPresentation(null);
      setProviderStatusFailed(true);
    }
  }, []);

  useEffect(() => {
    void refreshLocationProviders();
  }, [refreshLocationProviders]);

  const refreshNetwork = async () => {
    setRefreshing(true);
    try {
      await NetInfo.refresh();
      await refreshLocationProviders();
      setRefreshFailed(false);
    } catch {
      setRefreshFailed(true);
    } finally {
      setRefreshing(false);
    }
  };
  const presentation = getNetworkPresentation(snapshot);
  const toneColor = presentation.tone === 'success'
    ? COLORS.success
    : presentation.tone === 'warning'
      ? COLORS.warning
      : presentation.tone === 'danger'
        ? COLORS.danger
        : COLORS.textMuted;

  return (
    <SafeAreaView style={styles.container} edges={["top","bottom","left","right"]}>
      <ScrollView contentContainerStyle={[styles.content,{paddingHorizontal:layout.horizontalPadding}]} showsVerticalScrollIndicator={false}>
        <View style={[styles.screenFrame,{maxWidth:layout.maxContentWidth}]}>
          <Text style={styles.title}>CONECTIVIDADE</Text>
          <Text style={styles.subtitle}>4G / 5G • WI-FI • OFFLINE-FIRST</Text>
          <View style={styles.hero}>
            <View style={styles.heroHeading}>
              <View style={[styles.heroIcon,{borderColor:toneColor}]}>
                <AppIcon name={presentation.icon} size={28} color={toneColor} />
              </View>
              <View style={styles.heroBody}>
                <Text style={styles.heroTitle}>{presentation.title}</Text>
                <Text style={[styles.internetLabel,{color:toneColor}]}>{presentation.internetLabel}</Text>
              </View>
            </View>
            <Text style={styles.heroDetail}>{presentation.detail}</Text>
          </View>
          <TouchableOpacity
            style={[styles.refreshButton, refreshing && styles.refreshButtonDisabled]}
            onPress={() => { void refreshNetwork(); }}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Atualizar estado da rede"
          >
            <AppIcon name="refresh" size={16} color={COLORS.accent} />
            <Text style={styles.refreshButtonText}>{refreshing ? 'VERIFICANDO REDE…' : 'VERIFICAR REDE NOVAMENTE'}</Text>
          </TouchableOpacity>
          {refreshFailed ? <Text style={styles.refreshError}>Não foi possível atualizar agora. O diagnóstico local continua disponível.</Text> : null}
          <Text style={styles.section}>ESTADO DA REDE</Text>
          <View style={[styles.infoGrid,layout.landscape && styles.infoGridLandscape]}>
            <InfoCard title="TRANSPORTE ATIVO" value={presentation.transportLabel} />
            <InfoCard title="GERAÇÃO MÓVEL" value={presentation.generationLabel} />
            <InfoCard title="TARIFAÇÃO" value={presentation.meteredLabel} />
            <InfoCard title="SINAL WI-FI" value={presentation.signalLabel} />
          </View>
          <Text style={styles.section}>PROVEDORES DE LOCALIZAÇÃO DO ANDROID</Text>
          <View style={[styles.infoGrid,layout.landscape && styles.infoGridLandscape]}>
            <InfoCard title="SERVIÇOS DE LOCALIZAÇÃO" value={providerPresentation?.servicesLabel ?? 'CONSULTANDO…'} />
            <InfoCard title="GPS / GNSS" value={providerPresentation?.gpsLabel ?? 'N/D'} />
            <InfoCard title="PROVEDOR PELA REDE" value={providerPresentation?.networkLabel ?? 'N/D'} />
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoBody}>{providerPresentation?.explanation ?? 'O Android ainda não informou o estado dos provedores. O Meriva Smart não usa barras 4G/5G como coordenadas.'}</Text>
            {providerStatusFailed ? <Text style={styles.refreshError}>Não foi possível consultar os provedores de localização. O diagnóstico OBD permanece disponível.</Text> : null}
            <Text style={styles.infoBody}>A disponibilidade do provedor não confirma qual fonte produziu uma posição nem sua precisão. O cálculo de viagem deve aceitar apenas amostras GPS que passem pelos filtros já existentes.</Text>
          </View>
          <Text style={styles.section}>DIAGNÓSTICO OFFLINE</Text>
          <View style={styles.infoCard}>
            <View style={styles.inlineHeading}>
              <AppIcon name="shield" size={18} color={COLORS.success} />
              <Text style={styles.infoTitle}>A rede não comanda a ECU</Text>
            </View>
            <Text style={styles.infoBody}>Leitura OBD, consulta manual de PIDs, testes de sensores, histórico local e regras da IA embarcada continuam funcionando sem internet. A rede não altera o ciclo de conexão Bluetooth nem a fila serial ELM327.</Text>
          </View>
          <Text style={styles.section}>IDEIAS PARA A INTERNET</Text>
          <View style={styles.infoCard}>
            <Idea icon="weather" title="Cidade e clima" body="Já disponível na tela inicial quando a permissão de localização existente e a internet permitem. Falhas online não bloqueiam o diagnóstico." />
            <Idea icon="manualPid" title="Pesquisa técnica sob comando" body="Próxima fase: pesquisar documentação e boletins quando o usuário pedir, sem enviar telemetria ou histórico automaticamente." />
            <Idea icon="share" title="Compartilhamento consciente" body="Próxima fase: compartilhar um TXT escolhido pelo usuário, com prévia e confirmação explícita. Nenhum upload automático." />
            <Idea icon="knowledge" title="Base local atualizável" body="Próxima fase: baixar um pacote de conhecimento assinado, validar versão/integridade e permitir reversão antes de substituir regras locais." />
          </View>
          <Link href="/" asChild>
            <TouchableOpacity style={styles.back} accessibilityRole="button" accessibilityLabel="Voltar ao cockpit">
              <AppIcon name="back" size={17} color={COLORS.accent} />
              <Text style={styles.backText}>VOLTAR AO COCKPIT</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return <View style={styles.infoCard}><Text style={styles.infoLabel}>{title}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

function Idea({ icon, title, body }: { icon: 'weather' | 'manualPid' | 'share' | 'knowledge'; title: string; body: string }) {
  return (
    <View style={styles.ideaRow}>
      <AppIcon name={icon} size={18} color={COLORS.accent} />
      <View style={styles.ideaBody}><Text style={styles.ideaTitle}>{title}</Text><Text style={styles.infoBody}>{body}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:COLORS.screen},
  content:{flexGrow:1,width:'100%',paddingVertical:14,paddingBottom:28},
  screenFrame:{width:'100%',alignSelf:'center'},
  title:{...SCREEN_TITLE_STYLE,marginBottom:6},
  subtitle:{color:COLORS.accent,fontSize:9,fontWeight:'900',letterSpacing:1,marginBottom:14},
  hero:{backgroundColor:COLORS.surface,borderWidth:1,borderColor:COLORS.border,borderRadius:16,padding:15,marginBottom:14},
  heroHeading:{flexDirection:'row',alignItems:'center',gap:12},
  heroIcon:{width:54,height:54,borderRadius:15,borderWidth:1,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.surfaceInset},
  heroBody:{flex:1,minWidth:0},
  heroTitle:{color:COLORS.textStrong,fontSize:17,fontWeight:'900'},
  internetLabel:{fontSize:10,fontWeight:'900',letterSpacing:.6,marginTop:5},
  heroDetail:{color:COLORS.textMuted,fontSize:11,lineHeight:17,marginTop:12},
  refreshButton:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderRadius:12,borderWidth:1,borderColor:COLORS.border,backgroundColor:COLORS.surface,paddingHorizontal:12,marginBottom:12},
  refreshButtonDisabled:{opacity:0.6},
  refreshButtonText:{color:COLORS.accent,fontSize:10,fontWeight:'900',letterSpacing:.5},
  refreshError:{color:COLORS.warning,fontSize:10,lineHeight:15,marginBottom:10},
  section:{color:COLORS.accent,fontSize:10,fontWeight:'900',letterSpacing:1,marginTop:5,marginBottom:8},
  infoGrid:{gap:8},
  infoGridLandscape:{flexDirection:'row',flexWrap:'wrap'},
  infoCard:{backgroundColor:COLORS.surface,borderWidth:1,borderColor:COLORS.border,borderRadius:12,padding:13,marginBottom:8},
  infoLabel:{color:COLORS.textSubtle,fontSize:9,fontWeight:'900',letterSpacing:.7},
  infoValue:{color:COLORS.text,fontSize:12,fontWeight:'800',lineHeight:17,marginTop:5},
  inlineHeading:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:6},
  infoTitle:{color:COLORS.textStrong,fontSize:12,fontWeight:'900'},
  infoBody:{color:COLORS.textMuted,fontSize:10,lineHeight:16,marginTop:4},
  ideaRow:{flexDirection:'row',alignItems:'flex-start',gap:10,paddingVertical:5},
  ideaBody:{flex:1,minWidth:0},
  ideaTitle:{color:COLORS.textStrong,fontSize:11,fontWeight:'900'},
  back:{minHeight:48,padding:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:7},
  backText:{color:COLORS.accent,fontSize:10,fontWeight:'900'},
});
