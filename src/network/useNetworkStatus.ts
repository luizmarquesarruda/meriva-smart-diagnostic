import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { INITIAL_NETWORK_SNAPSHOT, normalizeNetworkSnapshot, type NetworkSnapshot } from './networkStatus';

/**
 * Event-driven network monitoring; never controls the OBD lifecycle or polling.
 */
export function useNetworkStatus(): NetworkSnapshot {
  const [snapshot, setSnapshot] = useState<NetworkSnapshot>(INITIAL_NETWORK_SNAPSHOT);
  useEffect(() => NetInfo.addEventListener((state) => {
    setSnapshot(normalizeNetworkSnapshot(state));
  }), []);
  return snapshot;
}
