'use client';

import { useEffect, useState } from 'react';
import { CloudOff, Download, LogOut, MoreHorizontal, Moon, Package, PanelLeftClose, PanelLeftOpen, RefreshCw, Share, Sun, X } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';
import { NAV } from '@/lib/nav';

type Props = {
  tab: string;
  onTab: (name: string) => void;
  online: boolean;
  pending: number;
  syncing: boolean;
  onSync: () => void;
  onSignOut: () => void;
  canInstall: boolean;
  showIosHint: boolean;
  onInstall: () => void;
  children: React.ReactNode;
};

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg"><Package size={20} aria-hidden /></div>
      {!compact && <div><div className="font-bold tracking-wide">MUSTAFA INKS</div><div className="text-[11px] tracking-[.18em] opacity-70">MANUFACTURING ERP</div></div>}
    </div>
  );
}

export function AppShell({ tab, onTab, online, pending, syncing, onSync, onSignOut, canInstall, showIosHint, onInstall, children }: Props) {
  const [more, setMore] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const ThemeIcon = theme === 'dark' ? Sun : Moon;
  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  const primary = NAV.filter(n => n.primary);
  const secondary = NAV.filter(n => !n.primary);
  const moreActive = secondary.some(n => n.name === tab);

  useEffect(() => {
    if (!more && !iosHelp) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMore(false); setIosHelp(false); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [more, iosHelp]);

  useEffect(() => { try { setCollapsed(localStorage.getItem('sidebar') === 'collapsed'); } catch { /* storage unavailable */ } }, []);
  const toggleSidebar = () => setCollapsed(c => {
    try { localStorage.setItem('sidebar', c ? 'open' : 'collapsed'); } catch { /* storage unavailable */ }
    return !c;
  });

  const go = (name: string) => { onTab(name); setMore(false); };

  return (
    <div className="min-h-dvh">
      <aside className={`fixed inset-y-0 left-0 z-20 hidden flex-col bg-nav py-4 text-nav-fg transition-[width] duration-200 lg:flex ${collapsed ? 'w-[72px] px-2' : 'w-[248px] px-3'}`} aria-label="Sidebar">
        <div className={`mb-4 flex shrink-0 items-center text-white ${collapsed ? 'justify-center' : 'justify-between px-2'}`}>
          {collapsed ? null : <Brand />}
          <button onClick={toggleSidebar} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-white/10" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}>
            {collapsed ? <PanelLeftOpen size={19} aria-hidden /> : <PanelLeftClose size={19} aria-hidden />}
          </button>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5" aria-label="Primary">
          {NAV.map(({ name, icon: Icon }) => (
            <button key={name} onClick={() => go(name)} aria-current={tab === name ? 'page' : undefined} aria-label={collapsed ? name : undefined} title={collapsed ? name : undefined}
              className={`flex min-h-[44px] w-full items-center rounded-lg text-sm font-medium transition-colors ${collapsed ? 'justify-center' : 'gap-3 px-3'} ${tab === name ? 'bg-accent text-accent-fg' : 'hover:bg-white/10 hover:text-white'}`}>
              <Icon size={18} aria-hidden />{!collapsed && name}
            </button>
          ))}
        </nav>
        <div className="mt-3 shrink-0 space-y-1 border-t border-white/10 pt-3">
          {([
            [themeLabel, toggleTheme, ThemeIcon, true],
            ['Install app', onInstall, Download, canInstall],
            ['Sign out', onSignOut, LogOut, true],
          ] as const).filter(r => r[3]).map(([label, fn, Icon]) => (
            <button key={label} onClick={fn} aria-label={collapsed ? label : undefined} title={collapsed ? label : undefined}
              className={`flex min-h-[44px] w-full items-center rounded-lg text-sm font-medium hover:bg-white/10 hover:text-white ${collapsed ? 'justify-center' : 'gap-3 px-3'}`}>
              <Icon size={18} aria-hidden />{!collapsed && label}
            </button>
          ))}
        </div>
      </aside>

      <div className={`transition-[padding] duration-200 ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-[248px]'}`}>
        <header className="sticky top-0 z-10 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <span className="lg:hidden"><Brand compact /></span>
              <p className="truncate text-base font-semibold lg:text-lg">{tab === 'Dashboard' ? 'Overview' : tab}</p>
            </div>
            <div className="flex items-center gap-1">
              <SyncChip online={online} pending={pending} syncing={syncing} onSync={onSync} />
              <button onClick={toggleTheme} className="icon-btn lg:hidden" aria-label={themeLabel}><ThemeIcon size={19} aria-hidden /></button>
              {canInstall && <button onClick={onInstall} className="icon-btn lg:hidden" aria-label="Install app"><Download size={19} aria-hidden /></button>}
              {showIosHint && <button onClick={() => setIosHelp(true)} className="icon-btn lg:hidden" aria-label="How to install on iPhone"><Download size={19} aria-hidden /></button>}
              <button onClick={onSignOut} className="icon-btn lg:hidden" aria-label="Sign out"><LogOut size={19} aria-hidden /></button>
            </div>
          </div>
        </header>

        {!online && (
          <div role="status" className="flex items-center gap-2 bg-warn-soft px-4 py-2 text-sm font-medium text-warn md:px-8">
            <CloudOff size={16} className="shrink-0" aria-hidden />Offline. Showing saved data; new records are stored here and sent when you reconnect.
          </div>
        )}

        <main id="main" className="mx-auto max-w-[1400px] px-4 py-5 pb-28 md:px-8 md:py-8 lg:pb-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Primary">
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {primary.map(({ name, icon: Icon }) => (
            <li key={name}>
              <button onClick={() => go(name)} aria-current={tab === name ? 'page' : undefined}
                className={`flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${tab === name ? 'text-accent' : 'text-muted'}`}>
                <Icon size={21} aria-hidden />{name}
              </button>
            </li>
          ))}
          <li>
            <button onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more}
              className={`flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${moreActive ? 'text-accent' : 'text-muted'}`}>
              <MoreHorizontal size={21} aria-hidden />More
            </button>
          </li>
        </ul>
      </nav>

      {more && (
        <div className="fixed inset-0 z-30 flex items-end bg-slate-950/50 lg:hidden" onMouseDown={e => e.target === e.currentTarget && setMore(false)}>
          <div role="dialog" aria-modal="true" aria-label="More sections" className="sheet-enter w-full rounded-t-2xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">More</h2><button className="icon-btn" onClick={() => setMore(false)} aria-label="Close"><X size={20} aria-hidden /></button></div>
            <div className="grid grid-cols-3 gap-2">
              {secondary.map(({ name, icon: Icon }) => (
                <button key={name} onClick={() => go(name)} aria-current={tab === name ? 'page' : undefined}
                  className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border text-sm font-medium ${tab === name ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface2 text-fg'}`}>
                  <Icon size={22} aria-hidden />{name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {iosHelp && (
        <div className="fixed inset-0 z-30 flex items-end bg-slate-950/50" onMouseDown={e => e.target === e.currentTarget && setIosHelp(false)}>
          <div role="dialog" aria-modal="true" aria-label="Install on iPhone" className="sheet-enter w-full rounded-t-2xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <h2 className="mb-2 font-semibold">Install on iPhone / iPad</h2>
            <p className="text-sm text-muted">Tap <Share size={14} className="mx-0.5 inline" aria-label="Share" /> in Safari, then choose <b>Add to Home Screen</b>.</p>
            <button className="btn-primary mt-4 w-full" onClick={() => setIosHelp(false)}>Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SyncChip({ online, pending, syncing, onSync }: { online: boolean; pending: number; syncing: boolean; onSync: () => void }) {
  if (online && pending === 0 && !syncing) return null;
  const label = !online ? (pending ? `Offline · ${pending} pending` : 'Offline') : syncing ? 'Syncing…' : `${pending} pending`;
  return (
    <button onClick={onSync} disabled={!online || syncing} aria-label={online ? `${label}. Sync now` : label}
      className="badge min-h-[32px] bg-warn-soft text-warn disabled:cursor-default">
      {syncing ? <RefreshCw size={13} className="animate-spin" aria-hidden /> : !online ? <CloudOff size={13} aria-hidden /> : <RefreshCw size={13} aria-hidden />}
      {label}
    </button>
  );
}
