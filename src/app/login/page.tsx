'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Brand } from '@/components/app-shell';
import { useOnline } from '@/hooks/use-online';

export default function Login() {
  const router = useRouter();
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!online) { setError('You are offline. Connect to the internet to sign in.'); return; }
    setBusy(true); setError('');
    try {
      const { error } = await createClient().auth.signInWithPassword({ email, password });
      if (error) { setError('Invalid email or password.'); setBusy(false); return; }
      router.replace('/');
      router.refresh();
    } catch { setError('Could not reach the server. Check your connection.'); setBusy(false); }
  };

  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-bg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-5 p-6 shadow-xl sm:p-8" aria-labelledby="login-h">
        <Brand />
        <div><h1 id="login-h" className="text-xl font-bold">Sign in</h1><p className="mt-1 text-sm text-muted">Use your owner account to continue.</p></div>
        {error && <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">{error}</div>}
        <label className="block space-y-1.5"><span className="text-sm font-medium">Email</span>
          <input required type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} className="field" />
        </label>
        <label className="block space-y-1.5"><span className="text-sm font-medium">Password</span>
          <div className="relative">
            <input required type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="field pr-12" />
            <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="icon-btn absolute right-0 top-0">{show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}</button>
          </div>
        </label>
        <button disabled={busy} className="btn-primary w-full">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
