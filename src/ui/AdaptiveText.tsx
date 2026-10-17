import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text as NativeText, type TextProps } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { readAppSettings, subscribeAppSettings } from '../database/appSettings';

let bound = false;
let largeTextValue = true;
const listeners = new Set<(value: boolean) => void>();
function publish(value: boolean) { largeTextValue = value; for (const listener of listeners) listener(value); }
function bindOnce() {
  if (bound) return;
  bound = true;
  subscribeAppSettings((settings) => publish(settings.largeText));
  void readAppSettings(`${FileSystem.documentDirectory}MERIVA_SMART`).then((settings) => publish(settings.largeText)).catch(() => {});
}
export const AdaptiveText = React.forwardRef<React.ComponentRef<typeof NativeText>, TextProps>(
  function AdaptiveText({ style, ...props }, ref) {
    const [largeText, setLargeText] = useState(largeTextValue);
    useEffect(() => { listeners.add(setLargeText); setLargeText(largeTextValue); bindOnce(); return () => { listeners.delete(setLargeText); }; }, []);
    const scaled = useMemo(() => {
      if (!largeText) return style;
      const flat = StyleSheet.flatten(style);
      if (!flat || typeof flat.fontSize !== 'number' || flat.fontSize > 32) return style;
      return { ...flat, fontSize: Math.round(flat.fontSize * 1.12) };
    }, [largeText, style]);
    return <NativeText {...props} ref={ref} style={scaled} />;
  },
);
AdaptiveText.displayName = 'AdaptiveText';
