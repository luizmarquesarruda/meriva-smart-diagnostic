import { Link } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type TabKey = 'painel' | 'diagnostico' | 'testes' | 'relatorios';
type Props = { active?: TabKey | null };
const ITEMS: Array<{ key: TabKey; icon: string; label: string; href: string }> = [
  { key: 'painel', icon: '◉', label: 'PAINEL', href: '/' },
  { key: 'diagnostico', icon: '⌁', label: 'DIAGNÓSTICO', href: '/laboratorio' },
  { key: 'testes', icon: '✓', label: 'TESTES', href: '/testes-sensores' },
  { key: 'relatorios', icon: '▤', label: 'RELATÓRIOS', href: '/armazenamento' },
];

export default function BottomNavigation({ active = null }: Props) {
  return (
    <View style={styles.bar} accessibilityLabel="Navegação principal">
      {ITEMS.map((item) => {
        const selected = active === item.key;
        return (
          <Link key={item.key} href={item.href as never} asChild>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={item.label}
              accessibilityState={{ selected }} activeOpacity={0.78}
              style={[styles.item, selected && styles.selected]}>
              <Text style={[styles.icon, selected && styles.selectedText]}>{item.icon}</Text>
              <Text numberOfLines={1} style={[styles.label, selected && styles.selectedText]}>{item.label}</Text>
            </TouchableOpacity>
          </Link>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', width: '100%', backgroundColor: '#0e1b2d', borderRadius: 14, borderWidth: 1, borderColor: '#28415f', padding: 3, marginTop: 8 },
  item: { flex: 1, minWidth: 0, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2, paddingVertical: 6, borderRadius: 10, gap: 3 },
  selected: { backgroundColor: '#152a45' },
  icon: { color: '#9fb4cf', fontSize: 16, fontWeight: '900' },
  label: { color: '#9fb4cf', fontSize: 8, fontWeight: '900', letterSpacing: 0.2 },
  selectedText: { color: '#7db3ff' },
});
