'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, CloudUpload, X } from 'lucide-react';
import { createRecord, listRecords, loadLookups, signOut, syncPending, type Form, type Row, type Tab } from '@/lib/erp';
import { DATA_TABS, NAV_NAMES } from '@/lib/nav';
import { discard, retry } from '@/lib/offline/outbox';
import { useOnline } from '@/hooks/use-online';
import { useOutbox } from '@/hooks/use-outbox';
import { useInstall } from '@/hooks/use-install';
import { AppShell } from '@/components/app-shell';
import { Dashboard } from '@/components/dashboard';
import { RecordForm } from '@/components/record-form';
import { RecordsView, ReportsView } from '@/components/records-view';

const CREATE_LABEL: Record<string, string> = {
  Sales: 'New sale', Purchases: 'New purchase', Recipes: 'Add recipe', Production: 'Start batch',
  Inventory: 'Add item', Customers: 'Add customer', Vendors: 'Add vendor', Expenses: 'Add expense',
};
const SINGULAR: Record<string, string> = { Inventory: 'Item', Recipes: 'Recipe', Production: 'Batch' };
const blankForm = (): Form => ({ lines: [{ itemId: '', qty: '', rate: '' }], paymentMethod: 'CASH' });

type Notice = { kind: 'ok' | 'queued' | 'error'; text: string };

export default function Home() {
  const [tab, setTab] = useState('Dashboard');
  const [lookups, setLookups] = useState<{ dashboard: Row; items: Row[]; customers: Row[]; vendors: Row[]; recipes: Row[] }>({ dashboard: {}, items: [], customers: [], vendors: [], recipes: [] });
  const [lookupsReady, setLookupsReady] = useState(false);
  const [records, setRecords] = useState<{ rows: Row[]; fromCache: boolean; savedAt: number | null }>({ rows: [], fromCache: false, savedAt: null });
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState<Form>(blankForm());

  const online = useOnline();
  const outbox = useOutbox();
  const { canInstall, showIosHint, install } = useInstall();
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const say = useCallback((n: Notice) => {
    setNotice(n);
    clearTimeout(noticeTimer.current);
    if (n.kind !== 'error') noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const l = await loadLookups();
      setLookups({ dashboard: l.dashboard, items: l.items, customers: l.customers, vendors: l.vendors, recipes: l.recipes });
      setLookupsReady(true);
    } catch (e) { setLookupsReady(true); say({ kind: 'error', text: e instanceof Error ? e.message : 'Could not load data.' }); }
  }, [say]);

  const loadTab = useCallback(async (name: string) => {
    if (!DATA_TABS.includes(name)) return;
    setLoading(true);
    try { const r = await listRecords(name as Tab); if (tabRef.current === name) setRecords(r); }
    catch (e) { if (tabRef.current === name) { setRecords({ rows: [], fromCache: false, savedAt: null }); say({ kind: 'error', text: e instanceof Error ? e.message : 'Could not load records.' }); } }
    finally { if (tabRef.current === name) setLoading(false); }
  }, [say]);

  const refresh = useCallback(() => Promise.all([loadAll(), loadTab(tabRef.current)]), [loadAll, loadTab]);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const { synced, failed } = await syncPending();
      if (synced) { say({ kind: 'ok', text: `${synced} offline record${synced > 1 ? 's' : ''} synced` }); await refresh(); }
      if (failed) say({ kind: 'error', text: `${failed} record${failed > 1 ? 's were' : ' was'} rejected. Review them in the list.` });
    } finally { setSyncing(false); }
  }, [refresh, say]);

  // Deep link: /?tab=Sales
  useEffect(() => {
    const t = new URLSearchParams(location.search).get('tab');
    if (t && NAV_NAMES.includes(t)) setTab(t);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { setRecords({ rows: [], fromCache: false, savedAt: null }); loadTab(tab); }, [tab, loadTab]);

  // Send queued records on start-up, when the connection returns, and when the app is brought back to the foreground.
  useEffect(() => {
    const run = () => { if (navigator.onLine) void sync(); };
    run();
    window.addEventListener('online', run);
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('online', run); document.removeEventListener('visibilitychange', onVisible); };
  }, [sync]);

  const go = useCallback((name: string, create = false) => {
    setTab(name); setSearch('');
    history.replaceState(null, '', name === 'Dashboard' ? '/' : `/?tab=${name}`);
    if (create) { setForm(blankForm()); setModal(true); }
  }, []);

  const closeModal = useCallback(() => setModal(false), []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { queued } = await createRecord(tab as Tab, form);
      setModal(false);
      const noun = SINGULAR[tab] ?? tab.slice(0, -1);
      say(queued ? { kind: 'queued', text: `${noun} saved on this device. It will sync when you are online.` } : { kind: 'ok', text: `${noun} saved` });
      if (!queued) await refresh();
    } catch (e) { say({ kind: 'error', text: e instanceof Error ? e.message : 'Could not save this record.' }); }
    finally { setSaving(false); }
  };

  const handleSignOut = async () => {
    if (outbox.length) { say({ kind: 'error', text: 'Some records have not synced yet. Sync or discard them before signing out.' }); return; }
    await signOut();
    window.location.href = '/login';
  };

  const pendingHere = outbox.filter(o => o.tab === tab);

  return (
    <AppShell tab={tab} onTab={name => go(name)} online={online} pending={outbox.length} syncing={syncing} onSync={sync}
      onSignOut={handleSignOut} canInstall={canInstall} showIosHint={showIosHint} onInstall={install}>
      {tab === 'Dashboard' ? <Dashboard data={lookups.dashboard} items={lookups.items} loading={!lookupsReady} onGo={go} />
        : tab === 'Reports' ? <ReportsView data={lookups.dashboard} />
        : <RecordsView tab={tab} rows={records.rows} loading={loading} search={search} onSearch={setSearch} createLabel={CREATE_LABEL[tab]}
            onCreate={() => { setForm(blankForm()); setModal(true); }} pending={pendingHere} onRetry={retry} onDiscard={discard}
            savedAt={records.savedAt} fromCache={records.fromCache} />}

      {modal && <RecordForm tab={tab} title={CREATE_LABEL[tab] ?? tab} form={form} setForm={updater => setForm(updater)} saving={saving} online={online}
        onClose={closeModal} onSubmit={submit} lookups={lookups} />}

      {notice && (
        <div role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`fixed inset-x-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg lg:bottom-6 lg:left-auto lg:right-6 lg:mx-0 ${notice.kind === 'error' ? 'bg-danger text-white dark:text-slate-950' : 'bg-nav text-white'}`}>
          {notice.kind === 'error' ? <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden /> : notice.kind === 'queued' ? <CloudUpload size={18} className="mt-0.5 shrink-0" aria-hidden /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden />}
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="-m-2 grid h-11 w-11 place-items-center"><X size={16} aria-hidden /></button>
        </div>
      )}
    </AppShell>
  );
}
