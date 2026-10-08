'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) { setError('Invalid email or password.'); setBusy(false); return; }
    router.replace('/');
    router.refresh();
  };

  return <div className="grid min-h-screen place-items-center bg-[#f6f7fb] p-4">
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-xl">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500 text-white"><Package size={21}/></div><div><div className="font-bold tracking-wide">MUSTAFA INKS</div><div className="text-[10px] tracking-[.22em] text-slate-400">MANUFACTURING ERP</div></div></div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">Email</span><input required type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"/></label>
      <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">Password</span><input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400"/></label>
      <button disabled={busy} className="w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </div>;
}
