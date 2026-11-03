import { Dimensions, useWindowDimensions, type ScaledSize } from 'react-native';

export interface MidLayout {
  landscape: boolean;
  compact: boolean;
  landscapeCompact: boolean;
  landscapeVeryCompact: boolean;
  horizontalPadding: number;
  maxContentWidth: number;
  titleSize: number;
  valueSize: number;
  cardPadding: number;
  gap: number;
}

export function getMidLayout(size: Pick<ScaledSize, 'width' | 'height'>): MidLayout {
  const landscape = size.width > size.height;
  const compact = Math.min(size.width, size.height) < 430;
  // Breakpoints use the current window size in dp, not the Samsung panel's pixel resolution.
  const landscapeCompact = landscape && size.height < 400;
  const landscapeVeryCompact = landscape && size.height < 340;

  return {
    landscape,
    compact,
    landscapeCompact,
    landscapeVeryCompact,
    horizontalPadding: landscape ? 24 : compact ? 14 : 18,
    maxContentWidth: landscape ? Math.min(size.width - 48, 900) : 680,
    titleSize: landscape
      ? landscapeVeryCompact ? 18 : landscapeCompact ? 20 : 22
      : compact ? 22 : 26,
    valueSize: landscape
      ? landscapeVeryCompact ? 36 : landscapeCompact ? 40 : 42
      : compact ? 36 : 40,
    cardPadding: landscape
      ? landscapeVeryCompact ? 8 : landscapeCompact ? 12 : 16
      : compact ? 12 : 16,
    gap: landscape
      ? landscapeVeryCompact ? 6 : landscapeCompact ? 8 : 12
      : 10,
  };
}

export function getInitialMidLayout(): MidLayout {
  const { width, height } = Dimensions.get('window');
  return getMidLayout({ width, height });
}

export function useMidLayout(): MidLayout {
  const { width, height } = useWindowDimensions();
  return getMidLayout({ width, height });
}
