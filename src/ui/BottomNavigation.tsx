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
  // Botões individuais deixam espaço visual e aumentam a área de toque sem
  // alterar a hierarquia, os destinos ou os rótulos de acessibilidade.
  bar: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'space-between', gap: 8, width: '100%', marginTop: 12 },
  item: { flex: 1, minWidth: 0, minHeight: 78, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: '#28415f', backgroundColor: '#0e1b2d', gap: 6 },
  selected: { backgroundColor: '#152a45', borderColor: '#3b82f6' },
  icon: { color: '#9fb4cf', fontSize: 24, lineHeight: 27, fontWeight: '900' },
  label: { color: '#9fb4cf', fontSize: 10, lineHeight: 12, fontWeight: '900', letterSpacing: 0.15, textAlign: 'center' },
  selectedText: { color: '#7db3ff' },
});
