import { useEffect, useState } from 'react';
import { subscribeAppEvents, type AppEventType } from '../state/appEventBus';

export function useAppEventRevision(types?: AppEventType[]): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeAppEvents((event) => {
    if (!types || types.includes(event.type)) setRevision((value) => value + 1);
  }), [types]);
  return revision;
}
