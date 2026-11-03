export const COLORS = {
  screen: '#07111f',
  surface: '#0e1b2d',
  surfaceRaised: '#111c2e',
  surfaceInset: '#091626',
  border: '#456a92',
  borderSubtle: '#28415f',
  borderAccent: '#4b82b8',
  successBorder: '#4ade80',
  dangerBorder: '#fb7185',
  tripBorder: '#42b8aa',
  tripAccentBorder: '#55d6be',
  text: '#e5edf7',
  textStrong: '#f8fafc',
  white: '#fff',
  textMuted: '#9fb4cf',
  textSubtle: '#7185a1',
  accent: '#7db3ff',
  primary: '#2563eb',
  success: '#4ade80',
  warning: '#fbbf24',
  danger: '#fb7185',
} as const;

export const SCREEN_TITLE_STYLE = {
  color: COLORS.textStrong,
  fontSize: 23,
  fontWeight: '900' as const,
  letterSpacing: 0.6,
};

export const SCREEN_SUBTITLE_STYLE = {
  color: COLORS.accent,
  fontSize: 9,
  fontWeight: '900' as const,
  letterSpacing: 0.6,
};
