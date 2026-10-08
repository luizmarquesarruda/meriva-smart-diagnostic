import { useEffect, useRef, useState } from 'react';
import { subscribeAppEvents, type AppEventType } from '../state/appEventBus';

export function useAppEventRevision(types?: AppEventType[]): number {
  const [revision, setRevision] = useState(0);
  const typesRef = useRef(types);
  typesRef.current = types;

  useEffect(() => {
    let scheduled = false;
    const unsubscribe = subscribeAppEvents((event) => {
      const currentTypes = typesRef.current;
      if (currentTypes && !currentTypes.includes(event.type)) return;
      if (scheduled) return;
      scheduled = true;
      Promise.resolve().then(() => {
        scheduled = false;
        setRevision((value) => value + 1);
      });
    });
    return unsubscribe;
  }, []);
  return revision;
}
