import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import { AppIcon } from '../src/ui/AppIcon';
import { COLORS, SCREEN_TITLE_STYLE } from '../src/ui/theme';
import { useMidLayout } from '../src/ui/midLayout';
import {
  evaluateMaintenance,
  getMaintenanceTasks,
  parseLocalDate,
  type MaintenanceRecord,
  type MaintenanceTaskId,
} from '../src/maintenance/maintenanceRules';
import {
  readMaintenanceData,
  writeMaintenanceData,
  type FuelingRecord,
  type FuelingType,
  type MaintenanceData,
} from '../src/database/maintenanceStorage';

type Draft = { date: string; odometer: string };
type Drafts = Record<MaintenanceTaskId, Draft>;

const EMPTY_DRAFTS: Drafts = {
  ENGINE_OIL: { date: '', odometer: '' },
  GENERAL_INSPECTION: { date: '', odometer: '' },
  COOLANT: { date: '', odometer: '' },
  BRAKE_FLUID: { date: '', odometer: '' },
  TIRE_ROTATION: { date: '', odometer: '' },
};

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatKm(value: number | null): string {
  return value == null || !Number.isFinite(value) ? 'N/D' : Math.round(value).toLocaleString('pt-BR') + ' km';
}

function formatDate(value: string | null): string {
  if (!value) return 'N/D';
  const parsed = parseLocalDate(value);
  return parsed ? parsed.toLocaleDateString('pt-BR') : 'N/D';
}

function buildDrafts(data: MaintenanceData): Drafts {
  const drafts = { ...EMPTY_DRAFTS } as Drafts;
  for (const id of Object.keys(EMPTY_DRAFTS) as MaintenanceTaskId[]) {
    const record = data.records[id];
    if (record) drafts[id] = {
      date: record.lastServiceAt ?? '',
      odometer: record.lastServiceOdometerKm == null ? '' : String(record.lastServiceOdometerKm),
    };
  }
  return drafts;
}

export default function MaintenanceScreen() {
  const layout = useMidLayout();
  const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
  const [data, setData] = useState<MaintenanceData | null>(null);
  const [drafts, setDrafts] = useState<Drafts>(EMPTY_DRAFTS);
  const [odometerInput, setOdometerInput] = useState('');
  const [status, setStatus] = useState('CARREGANDO REGISTROS...');
  const [busy, setBusy] = useState(false);
  const [litersInput, setLitersInput] = useState('');
  const [costInput, setCostInput] = useState('');
  const [fuelType, setFuelType] = useState<FuelingType>('GASOLINA');

  useEffect(() => {
    let cancelled = false;
    void readMaintenanceData(basePath).then((loaded) => {
      if (cancelled) return;
      setData(loaded);
      setDrafts(buildDrafts(loaded));
      setOdometerInput(loaded.currentOdometerKm == null ? '' : String(loaded.currentOdometerKm));
      setStatus('REGISTROS LOCAIS PRONTOS');
    }).catch(() => {
      if (!cancelled) setStatus('NÃO FOI POSSÍVEL LER OS REGISTROS');
    });
    return () => { cancelled = true; };
  }, [basePath]);

  const tasks = useMemo(() => getMaintenanceTasks(Boolean(data?.severeUse)), [data?.severeUse]);
  const latestFueling = data?.fuelings[data.fuelings.length - 1] ?? null;

  async function persist(next: MaintenanceData, message: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await writeMaintenanceData(basePath, next);
      const saved = { ...next, updatedAt: new Date().toISOString() };
      setData(saved);
      setDrafts(buildDrafts(saved));
      setStatus(message);
    } catch {
      setStatus('FALHA AO SALVAR • DADOS NÃO CONFIRMADOS');
      Alert.alert('Falha no salvamento', 'O registro não foi confirmado. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrentOdometer(): Promise<void> {
    if (!data) return;
    const parsed = optionalNumber(odometerInput);
    if (parsed == null || odometerInput.trim() === '' || parsed > 2_000_000) {
      Alert.alert('Quilometragem inválida', 'Informe a quilometragem atual do painel, em km.');
      return;
    }
    if (latestFueling && parsed < latestFueling.odometerKm) {
      Alert.alert('Quilometragem menor que o registro anterior', 'A quilometragem atual não pode ser menor que a do último abastecimento salvo.');
      return;
    }
    await persist({ ...data, currentOdometerKm: parsed }, 'QUILOMETRAGEM ATUAL SALVA');
  }

  async function saveMaintenanceRecord(id: MaintenanceTaskId): Promise<void> {
    if (!data) return;
    const draft = drafts[id];
    const serviceDate = draft.date.trim() ? draft.date.trim() : null;
    const serviceOdometer = optionalNumber(draft.odometer);
    if (serviceDate && !parseLocalDate(serviceDate)) {
      Alert.alert('Data inválida', 'Use o formato AAAA-MM-DD com uma data real.');
      return;
    }
    if (!serviceDate && serviceOdometer == null) {
      Alert.alert('Histórico incompleto', 'Informe a data ou a quilometragem da última manutenção.');
      return;
    }
    const record: MaintenanceRecord = { lastServiceAt: serviceDate, lastServiceOdometerKm: serviceOdometer };
    await persist({
      ...data,
      records: { ...data.records, [id]: record },
    }, 'HISTÓRICO DE MANUTENÇÃO SALVO');
  }

  function markMaintenanceToday(id: MaintenanceTaskId): void {
    if (!data) return;
    Alert.alert('Confirmar manutenção', 'Este registro substituirá a data e a quilometragem da última manutenção salva.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: () => {
          const today = new Date();
          const date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
          const record: MaintenanceRecord = { lastServiceAt: date, lastServiceOdometerKm: data.currentOdometerKm };
          void persist({ ...data, records: { ...data.records, [id]: record } }, 'MANUTENÇÃO REGISTRADA');
        },
      },
    ]);
  }

  async function saveFueling(): Promise<void> {
    if (!data) return;
    const liters = optionalNumber(litersInput);
    const totalCost = optionalNumber(costInput);
    const odometer = data.currentOdometerKm;
    if (liters == null || liters <= 0 || liters > 300) {
      Alert.alert('Litros inválidos', 'Informe a quantidade abastecida, maior que zero e até 300 litros.');
      return;
    }
    if (odometer == null) {
      Alert.alert('Quilometragem necessária', 'Salve a quilometragem atual antes de registrar o abastecimento.');
      return;
    }
    if (costInput.trim() && (totalCost == null || totalCost <= 0)) {
      Alert.alert('Valor inválido', 'Informe o total pago em reais, maior que zero, ou deixe o campo vazio.');
      return;
    }
    if (latestFueling && odometer < latestFueling.odometerKm) {
      Alert.alert('Quilometragem inválida', 'O abastecimento precisa ter quilometragem igual ou superior ao último registro.');
      return;
    }
    const fueling: FuelingRecord = {
      id: `fuel-${Date.now()}`,
      occurredAt: new Date().toISOString(),
      odometerKm: odometer,
      liters,
      totalCost,
      type: fuelType,
    };
    await persist({
      ...data,
      currentOdometerKm: odometer,
      fuelings: [...data.fuelings, fueling].slice(-100),
    }, 'ABASTECIMENTO SALVO');
    setLitersInput('');
    setCostInput('');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.frame, { maxWidth: layout.maxContentWidth }]}>
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <AppIcon name="vehicle" size={24} color={COLORS.accent} />
              <Text style={styles.title}>MANUTENÇÃO E ABASTECIMENTO</Text>
            </View>
            <Text style={styles.subtitle}>LEMBRETES POR KM/DATA • REGISTROS LOCAIS</Text>
            <Text style={styles.disclaimer}>Prazos de referência do manual do Meriva 2012. Confirme o plano correto para o veículo e o uso reais.</Text>
            <Text style={styles.statusText}>{status}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>QUILOMETRAGEM ATUAL</Text>
            <View style={styles.inlineInput}>
              <TextInput
                value={odometerInput}
                onChangeText={setOdometerInput}
                keyboardType="decimal-pad"
                placeholder="Ex.: 128450"
                placeholderTextColor={COLORS.textSubtle}
                accessibilityLabel="Quilometragem atual em quilômetros"
                style={styles.input}
              />
              <TouchableOpacity style={[styles.primaryButton, busy && styles.disabled]} disabled={busy} onPress={() => void saveCurrentOdometer()}>
                <Text style={styles.primaryButtonText}>SALVAR KM</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.subtle}>Última quilometragem salva: {formatKm(data?.currentOdometerKm ?? null)}</Text>
            <View style={styles.severeRow}>
              <View style={styles.severeCopy}>
                <Text style={styles.fieldLabel}>USO SEVERO</Text>
                <Text style={styles.subtle}>Óleo: {data?.severeUse ? '5.000 km ou 6 meses' : '10.000 km ou 12 meses'} (o que ocorrer primeiro).</Text>
              </View>
              <Switch
                value={Boolean(data?.severeUse)}
                disabled={!data || busy}
                onValueChange={(value) => { if (data) void persist({ ...data, severeUse: value }, 'PLANO DE MANUTENÇÃO ATUALIZADO'); }}
                trackColor={{ false: '#30445b', true: COLORS.primary }}
                thumbColor={COLORS.textStrong}
                accessibilityLabel="Ativar intervalos de uso severo"
              />
            </View>
          </View>

          <Text style={styles.sectionHeading}>PLANO DE MANUTENÇÃO</Text>
          {tasks.map((task) => {
            const record = data?.records[task.id] ?? null;
            const evaluation = evaluateMaintenance(task, record, data?.currentOdometerKm ?? null);
            const draft = drafts[task.id];
            const due = evaluation.status === 'DUE';
            return (
              <View key={task.id} style={styles.taskCard}>
                <View style={styles.taskHeader}>
                  <View style={styles.taskCopy}>
                    <Text style={styles.taskTitle}>{task.title}</Text>
                    <Text style={styles.subtle}>{task.description}</Text>
                  </View>
                  <View style={[styles.statusPill, due ? styles.statusDue : evaluation.status === 'UP_TO_DATE' ? styles.statusOk : styles.statusUnknown]}>
                    <Text style={styles.statusPillText}>{due ? 'VENCIDA' : evaluation.status === 'UP_TO_DATE' ? 'EM DIA' : 'CADASTRAR'}</Text>
                  </View>
                </View>
                <View style={styles.intervalRow}>
                  <Text style={styles.intervalText}>Intervalo: {task.intervalKm != null ? task.intervalKm.toLocaleString('pt-BR') + ' km' : 'sem limite por km'}{task.intervalMonths != null ? ' / ' + task.intervalMonths + ' meses' : ''}</Text>
                  <Text style={styles.intervalText}>Próximo km: {formatKm(evaluation.kmDueAt)}{task.intervalKm != null ? ' • faltam ' + formatKm(evaluation.kmRemaining) : ''}</Text>
                </View>
                {task.intervalMonths != null && <Text style={styles.intervalText}>Próxima data: {formatDate(evaluation.dueDate)}</Text>}
                <View style={styles.formRow}>
                  <View style={styles.formField}>
                    <Text style={styles.fieldLabel}>ÚLTIMA MANUTENÇÃO (AAAA-MM-DD)</Text>
                    <TextInput
                      value={draft.date}
                      onChangeText={(value) => setDrafts((current) => ({ ...current, [task.id]: { ...current[task.id], date: value } }))}
                      placeholder="2026-01-15"
                      placeholderTextColor={COLORS.textSubtle}
                      style={styles.input}
                      accessibilityLabel={task.title + ': data da última manutenção'}
                    />
                  </View>
                  <View style={styles.formField}>
                    <Text style={styles.fieldLabel}>KM NA ÚLTIMA MANUTENÇÃO</Text>
                    <TextInput
                      value={draft.odometer}
                      onChangeText={(value) => setDrafts((current) => ({ ...current, [task.id]: { ...current[task.id], odometer: value } }))}
                      placeholder="Ex.: 118000"
                      placeholderTextColor={COLORS.textSubtle}
                      keyboardType="decimal-pad"
                      style={styles.input}
                      accessibilityLabel={task.title + ': quilometragem da última manutenção'}
                    />
                  </View>
                </View>
                <View style={styles.buttonRow}>
                  <TouchableOpacity style={[styles.secondaryButton, busy && styles.disabled]} disabled={busy} onPress={() => void saveMaintenanceRecord(task.id)}>
                    <Text style={styles.secondaryButtonText}>SALVAR HISTÓRICO</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.primaryButton, busy && styles.disabled]} disabled={busy} onPress={() => markMaintenanceToday(task.id)}>
                    <Text style={styles.primaryButtonText}>REGISTRAR HOJE</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <Text style={styles.sectionHeading}>ABASTECIMENTOS</Text>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>NOVO ABASTECIMENTO</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.fuelTypeButton, fuelType === 'GASOLINA' && styles.fuelTypeButtonActive]} onPress={() => setFuelType('GASOLINA')} accessibilityRole="button" accessibilityState={{ selected: fuelType === 'GASOLINA' }}>
                <Text style={styles.fuelTypeText}>GASOLINA</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.fuelTypeButton, fuelType === 'ETANOL' && styles.fuelTypeButtonActive]} onPress={() => setFuelType('ETANOL')} accessibilityRole="button" accessibilityState={{ selected: fuelType === 'ETANOL' }}>
                <Text style={styles.fuelTypeText}>ETANOL</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.formRow}>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>LITROS</Text>
                <TextInput value={litersInput} onChangeText={setLitersInput} keyboardType="decimal-pad" placeholder="30,0" placeholderTextColor={COLORS.textSubtle} style={styles.input} accessibilityLabel="Litros abastecidos" />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>TOTAL PAGO (R$ • OPCIONAL)</Text>
                <TextInput value={costInput} onChangeText={setCostInput} keyboardType="decimal-pad" placeholder="150,00" placeholderTextColor={COLORS.textSubtle} style={styles.input} accessibilityLabel="Valor total do abastecimento" />
              </View>
            </View>
            <TouchableOpacity style={[styles.primaryButton, styles.fullButton, busy && styles.disabled]} disabled={!data || busy} onPress={() => void saveFueling()}>
              <Text style={styles.primaryButtonText}>REGISTRAR ABASTECIMENTO</Text>
            </TouchableOpacity>
            <Text style={styles.subtle}>O registro usa a quilometragem salva acima e não altera cálculos de consumo OBD. Cadastre cada abastecimento manualmente.</Text>
          </View>

          <Text style={styles.sectionHeading}>HISTÓRICO RECENTE</Text>
          {data?.fuelings.length ? data.fuelings.slice(-6).reverse().map((item) => (
            <View key={item.id} style={styles.historyCard}>
              <View style={styles.historyCopy}>
                <Text style={styles.taskTitle}>{item.type} • {item.liters.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L</Text>
                <Text style={styles.subtle}>{new Date(item.occurredAt).toLocaleString('pt-BR')} • {formatKm(item.odometerKm)}</Text>
              </View>
              <Text style={styles.historyValue}>{item.totalCost != null ? item.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'VALOR N/D'}</Text>
            </View>
          )) : <View style={styles.empty}><Text style={styles.subtle}>Ainda não há abastecimentos registrados.</Text></View>}
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/mais')} accessibilityRole="button" accessibilityLabel="Voltar aos recursos">
            <AppIcon name="back" size={16} color={COLORS.accent} />
            <Text style={styles.backButtonText}>VOLTAR AOS RECURSOS</Text>
          </TouchableOpacity>
          <Text style={styles.footer}>ARMAZENAMENTO LOCAL • SEM LOGIN • SEM ALTERAR CONSUMO OBD</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.screen },
  content: { flexGrow: 1, width: '100%', paddingVertical: 14, paddingBottom: 30 },
  frame: { width: '100%', alignSelf: 'center', gap: 10 },
  header: { backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: 15, gap: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...SCREEN_TITLE_STYLE, flex: 1, fontSize: 20 },
  subtitle: { color: COLORS.accent, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  disclaimer: { color: COLORS.textSubtle, fontSize: 10, lineHeight: 15 },
  statusText: { color: COLORS.textMuted, fontSize: 9, fontWeight: '800' },
  card: { backgroundColor: COLORS.surface, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 13, gap: 9 },
  sectionTitle: { color: COLORS.textStrong, fontSize: 13, fontWeight: '900' },
  inlineInput: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceInset, color: COLORS.textStrong, paddingHorizontal: 11, paddingVertical: 8, fontSize: 13 },
  primaryButton: { minHeight: 46, minWidth: 112, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary },
  primaryButtonText: { color: COLORS.white, fontSize: 10, fontWeight: '900', letterSpacing: 0.4, textAlign: 'center' },
  secondaryButton: { flex: 1, minHeight: 46, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceInset, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: COLORS.accent, fontSize: 10, fontWeight: '900', textAlign: 'center' },
  disabled: { opacity: 0.5 },
  subtle: { color: COLORS.textSubtle, fontSize: 10, lineHeight: 15 },
  severeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 2 },
  severeCopy: { flex: 1, minWidth: 0, gap: 3 },
  fieldLabel: { color: COLORS.textMuted, fontSize: 9, fontWeight: '900' },
  sectionHeading: { color: COLORS.accent, fontSize: 13, fontWeight: '900', letterSpacing: 0.9, marginTop: 7 },
  taskCard: { backgroundColor: COLORS.surfaceRaised, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 13, gap: 10 },
  taskHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  taskCopy: { flex: 1, minWidth: 0, gap: 4 },
  taskTitle: { color: COLORS.textStrong, fontSize: 13, fontWeight: '900' },
  statusPill: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, maxWidth: 100 },
  statusDue: { backgroundColor: '#512334' },
  statusOk: { backgroundColor: '#133b32' },
  statusUnknown: { backgroundColor: '#25364a' },
  statusPillText: { color: COLORS.textStrong, fontSize: 8, fontWeight: '900' },
  intervalRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 5 },
  intervalText: { color: COLORS.textMuted, fontSize: 9, lineHeight: 14 },
  formRow: { flexDirection: 'row', gap: 8 },
  formField: { flex: 1, minWidth: 0, gap: 5 },
  buttonRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  fuelTypeButton: { flex: 1, minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceInset, alignItems: 'center', justifyContent: 'center' },
  fuelTypeButtonActive: { borderColor: COLORS.accent, backgroundColor: '#142b44' },
  fuelTypeText: { color: COLORS.textStrong, fontSize: 10, fontWeight: '900' },
  fullButton: { width: '100%' },
  historyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  historyCopy: { flex: 1, minWidth: 0, gap: 3 },
  historyValue: { color: COLORS.textStrong, fontSize: 10, fontWeight: '800', textAlign: 'right' },
  empty: { padding: 17, alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  backButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 48, gap: 7, padding: 12 },
  backButtonText: { color: COLORS.accent, fontSize: 10, fontWeight: '900' },
  footer: { color: COLORS.textSubtle, textAlign: 'center', fontSize: 8, fontWeight: '800', letterSpacing: 0.6, marginTop: 5 },
});
