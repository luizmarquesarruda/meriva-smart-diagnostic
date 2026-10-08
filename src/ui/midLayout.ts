import { Dimensions, useWindowDimensions, type ScaledSize } from 'react-native';

export interface MidLayout {
  landscape: boolean;
  compact: boolean;
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

  return {
    landscape,
    compact,
    horizontalPadding: landscape ? 24 : compact ? 14 : 18,
    maxContentWidth: landscape ? Math.min(size.width - 48, 900) : 680,
    titleSize: landscape ? 22 : compact ? 22 : 26,
    valueSize: landscape ? 42 : compact ? 36 : 40,
    cardPadding: landscape ? 16 : compact ? 12 : 16,
    gap: landscape ? 12 : 10,
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
