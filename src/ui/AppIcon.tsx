import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from './theme';

const ICONS = {
  cockpit: 'speedometer-outline',
  bluetooth: 'bluetooth-outline',
  more: 'grid-outline',
  diagnostic: 'build-outline',
  data: 'analytics-outline',
  trips: 'navigate-outline',
  coolant: 'thermometer-outline',
  manualPid: 'search-outline',
  sensors: 'flask-outline',
  vehicle: 'car-sport-outline',
  learning: 'school-outline',
  health: 'medkit-outline',
  history: 'document-text-outline',
  settings: 'settings-outline',
  connectivity: 'cellular-outline',
  wifi: 'wifi-outline',
  offline: 'cloud-offline-outline',
  weather: 'partly-sunny-outline',
  internet: 'globe-outline',
  shield: 'shield-checkmark-outline',
  refresh: 'refresh-outline',
  cloud: 'cloud-outline',
  arrowRight: 'chevron-forward-outline',
  back: 'arrow-back-outline',
  lock: 'lock-closed-outline',
  share: 'share-social-outline',
  knowledge: 'book-outline',
  network: 'git-network-outline',
  battery: 'battery-half-outline',
  time: 'time-outline',
  warning: 'warning-outline',
  check: 'checkmark-circle-outline',
} as const satisfies Record<string, ComponentProps<typeof Ionicons>['name']>;

export type AppIconName = keyof typeof ICONS;

export function AppIcon({
  name,
  size = 22,
  color = COLORS.accent,
}: {
  name: AppIconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={ICONS[name]} size={size} color={color} />;
}
