import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Bluetooth,
  Brain,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Database,
  FileText,
  Folder,
  Fuel,
  Gauge,
  Home,
  LayoutGrid,
  LineChart,
  Plug,
  Radio,
  Route,
  Settings,
  ShieldCheck,
  Thermometer,
  Wrench,
} from 'lucide-react-native';

const ICONS = {
  activity: Activity,
  alert: AlertTriangle,
  battery: BatteryCharging,
  bluetooth: Bluetooth,
  learning: Brain,
  vehicle: Car,
  success: CheckCircle2,
  back: ChevronLeft,
  forward: ChevronRight,
  cpu: Cpu,
  database: Database,
  files: FileText,
  history: Folder,
  fuel: Fuel,
  dashboard: Gauge,
  home: Home,
  resources: LayoutGrid,
  charts: LineChart,
  connection: Plug,
  radio: Radio,
  trips: Route,
  settings: Settings,
  health: ShieldCheck,
  temperature: Thermometer,
  diagnostics: Wrench,
  sensors: Activity,
} as const;

export type AppIconName = keyof typeof ICONS;

type AppIconProps = {
  name: AppIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function AppIcon({
  name,
  size = 20,
  color = '#7db3ff',
  strokeWidth = 2,
}: AppIconProps) {
  const Icon = ICONS[name];
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}

type AppIconBadgeTone = 'blue' | 'gold' | 'success' | 'warning' | 'danger';

type AppIconBadgeProps = {
  name: AppIconName;
  size?: number;
  color?: string;
  tone?: AppIconBadgeTone;
};

const BADGE_TONES: Record<AppIconBadgeTone, { borderColor: string; backgroundColor: string }> = {
  blue: { borderColor: '#315579', backgroundColor: '#102743' },
  gold: { borderColor: '#8e7132', backgroundColor: '#2b271b' },
  success: { borderColor: '#28613e', backgroundColor: '#10261b' },
  warning: { borderColor: '#8e7132', backgroundColor: '#2b271b' },
  danger: { borderColor: '#713043', backgroundColor: '#28151c' },
};

export function AppIconBadge({
  name,
  size = 44,
  color = '#7db3ff',
  tone,
}: AppIconBadgeProps) {
  const effectiveTone = tone ?? (color === '#e8b54b' ? 'gold' : 'blue');
  const badgeTone = BADGE_TONES[effectiveTone];

  return (
    <View
      accessible={false}
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderColor: badgeTone.borderColor,
        },
      ]}
    >
      <View style={[styles.inner, { backgroundColor: badgeTone.backgroundColor }]}>
        <AppIcon name={name} size={Math.round(size * 0.52)} color={color} strokeWidth={1.9} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 13,
    backgroundColor: '#0a1727',
    padding: 3,
  },
  inner: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
});
