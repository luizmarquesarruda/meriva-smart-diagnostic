/**
 * Visual tokens shared by the cockpit and every secondary screen.
 * Keep layout-specific measurements local; these tokens standardize palette and hierarchy.
 */
export const cockpitTheme = {
  background: '#07111f',
  surface: '#0e1b2d',
  surfaceAlt: '#0b1829',
  border: '#28415f',
  borderSubtle: '#233a56',
  text: '#f8fafc',
  textStrong: '#e5edf7',
  textSecondary: '#c2d0df',
  muted: '#7185a1',
  mutedLight: '#94a3b8',
  accent: '#7db3ff',
  primary: '#2563eb',
  primarySoft: '#152a45',
  success: '#4ade80',
  successSurface: '#10261b',
  warning: '#fbbf24',
  warningSurface: '#2a2412',
  danger: '#fb7185',
  dangerSurface: '#28151c',
} as const;

export const cockpitLayout = {
  contentVerticalPadding: 14,
  contentBottomPadding: 30,
  cardRadius: 14,
  buttonRadius: 12,
} as const;
