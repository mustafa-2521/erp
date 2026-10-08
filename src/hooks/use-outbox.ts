import { useCallback, useEffect, useState } from 'react';
import { listOutbox, OUTBOX_EVENT, type OutboxItem } from '@/lib/offline/outbox';

export function useOutbox() {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const refresh = useCallback(() => { listOutbox().then(setItems).catch(() => setItems([])); }, []);
  useEffect(() => {
    refresh();
    window.addEventListener(OUTBOX_EVENT, refresh);
    return () => window.removeEventListener(OUTBOX_EVENT, refresh);
  }, [refresh]);
  return items;
}
