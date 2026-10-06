import type { BluetoothDeviceInfo } from './bluetoothClassicTransport';

function normalizeAddress(address: string): string {
  return address.replace(/:/g, '').toUpperCase();
}

export function prioritizeBluetoothCandidates(
  devices: BluetoothDeviceInfo[],
  lastConnectedAddress: string | null,
  looksLikeElm: (device: BluetoothDeviceInfo) => boolean,
): BluetoothDeviceInfo[] {
  const unique: BluetoothDeviceInfo[] = [];
  const seen = new Set<string>();

  for (const device of devices) {
    const key = normalizeAddress(device.address);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(device);
  }

  const last = lastConnectedAddress ? normalizeAddress(lastConnectedAddress) : null;

  return unique.sort((a, b) => {
    const aLast = last !== null && normalizeAddress(a.address) === last;
    const bLast = last !== null && normalizeAddress(b.address) === last;
    if (aLast !== bLast) return aLast ? -1 : 1;

    const aElm = looksLikeElm(a);
    const bElm = looksLikeElm(b);
    if (aElm !== bElm) return aElm ? -1 : 1;

    return 0;
  });
}
