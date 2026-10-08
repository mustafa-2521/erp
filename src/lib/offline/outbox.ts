import { outboxAll, outboxDelete, outboxPut } from './db';

export type Status = 'pending' | 'sending' | 'failed' | 'review';

export type OutboxItem = {
  id: string;
  tab: string;
  form: Record<string, unknown>;
  label: string;
  createdAt: number;
  status: Status;
  error?: string;
};

export const OUTBOX_EVENT = 'inks:outbox-changed';
const notify = () => window.dispatchEvent(new Event(OUTBOX_EVENT));

export class NetworkError extends Error {
  constructor(message = 'You appear to be offline.') { super(message); this.name = 'NetworkError'; }
}
export const isNetworkError = (e: unknown) => e instanceof NetworkError;

export const listOutbox = async () => (await outboxAll<OutboxItem>()).sort((a, b) => a.createdAt - b.createdAt);

export async function enqueue(tab: string, form: Record<string, unknown>, label: string) {
  const item: OutboxItem = { id: crypto.randomUUID(), tab, form, label, createdAt: Date.now(), status: 'pending' };
  await outboxPut(item);
  notify();
  return item;
}

export async function discard(id: string) { await outboxDelete(id); notify(); }
export async function retry(id: string) {
  const item = (await outboxAll<OutboxItem>()).find(i => i.id === id);
  if (item) { await outboxPut({ ...item, status: 'pending', error: undefined }); notify(); }
}

type Sender = (tab: string, form: Record<string, unknown>) => Promise<void>;

/**
 * Sends pending items oldest-first. A Web Lock keeps two tabs from sending the same item.
 * An item left in `sending` by a closed tab may or may not have reached the server, so it is
 * parked as `review` for the user instead of being re-sent automatically (avoids duplicate ledger entries).
 */
export async function syncOutbox(send: Sender): Promise<{ synced: number; failed: number }> {
  const result = { synced: 0, failed: 0 };
  if (!navigator.onLine) return result;

  const work = async () => {
    for (const stale of (await listOutbox()).filter(i => i.status === 'sending')) {
      await outboxPut({ ...stale, status: 'review', error: 'Sync was interrupted. Check the list before sending again.' });
    }
    for (const item of (await listOutbox()).filter(i => i.status === 'pending')) {
      await outboxPut({ ...item, status: 'sending' });
      notify();
      try {
        await send(item.tab, item.form);
        await outboxDelete(item.id);
        result.synced++;
      } catch (e) {
        if (isNetworkError(e)) { await outboxPut({ ...item, status: 'pending' }); break; }
        await outboxPut({ ...item, status: 'failed', error: e instanceof Error ? e.message : 'Rejected by the server.' });
        result.failed++;
      }
      notify();
    }
  };

  if (navigator.locks) await navigator.locks.request('inks-outbox-sync', { ifAvailable: true }, lock => (lock ? work() : undefined));
  else await work();
  notify();
  return result;
}
