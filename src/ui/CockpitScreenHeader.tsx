import { StyleSheet, Text, View } from 'react-native';
import { cockpitTheme } from './cockpitTheme';

export interface CockpitScreenHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}

/** Shared page heading used by secondary routes; mirrors the cockpit's dark card hierarchy. */
export function CockpitScreenHeader({ title, subtitle, eyebrow }: CockpitScreenHeaderProps) {
  return (
    <View style={styles.container}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: cockpitTheme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: cockpitTheme.border,
    padding: 14,
    marginBottom: 12,
  },
  eyebrow: {
    color: cockpitTheme.accent,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    color: cockpitTheme.text,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
  },
  subtitle: {
    color: cockpitTheme.accent,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
    lineHeight: 14,
    marginTop: 4,
  },
});
