'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, post, ApiError } from '@/lib/api';

type Status = { hasUser: boolean; authenticated: boolean; username: string | null };

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [offline, setOffline] = useState(false);

  const check = useCallback(() => {
    setOffline(false);
    api<Status>('/auth/status')
      .then((s) => {
        if (s.authenticated) router.replace('/universe');
        else setStatus(s);
      })
      .catch(() => setOffline(true));
  }, [router]);

  useEffect(check, [check]);

  const setup = status && !status.hasUser;

  if (offline) {
    return (
      <main className="min-h-dvh grid place-items-center p-4">
        <div className="paper w-full max-w-md" style={{ minHeight: 0 }}>
          <div className="p-head">
            <div>
              <div className="p-kicker">Groundwork</div>
              <div className="p-title">The API isn&apos;t running</div>
            </div>
          </div>
          <p className="text-sm text-[#3b3934]">
            The book can&apos;t open until the backend is up. In a terminal:
          </p>
          <pre className="rounded-lg bg-[#1f2128] p-3 text-[13px] text-zinc-100">cd groundwork-api{'\n'}npm run dev</pre>
          <p className="text-sm text-[#3b3934]">
            Wait for <b>&ldquo;Groundwork API on http://localhost:4000/api&rdquo;</b>, then press Retry. The first time, you&apos;ll see a form to create your account.
          </p>
          <button onClick={check} className="rounded-lg bg-[#23358f] px-4 py-2.5 font-semibold text-white hover:bg-[#1b2a75]">
            Retry
          </button>
        </div>
      </main>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (setup && password !== confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      await post(setup ? '/auth/setup' : '/auth/login', { username: username.trim(), password });
      router.replace('/universe');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh grid place-items-center p-4">
      <form onSubmit={submit} className="paper w-full max-w-md" style={{ minHeight: 0 }}>
        <div className="p-head">
          <div>
            <div className="p-kicker">Groundwork · {setup ? 'first page' : 'welcome back'}</div>
            <div className="p-title">{setup ? 'Start your book' : 'Open your book'}</div>
          </div>
        </div>
        {setup && (
          <p className="text-sm text-[color:var(--label)]">
            This is a single-person app. Pick a username and a password (8+ characters). They are stored only in your own database.
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className="p-label">Username</span>
          <input className="hand-input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="p-label">Password</span>
          <input
            className="hand-input"
            type="password"
            autoComplete={setup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {setup && (
          <label className="flex flex-col gap-1">
            <span className="p-label">Password again</span>
            <input className="hand-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          disabled={busy || !status}
          className="mt-2 rounded-lg bg-[#23358f] px-4 py-2.5 font-semibold text-white hover:bg-[#1b2a75] disabled:opacity-50"
        >
          {busy ? '…' : setup ? 'Create my book' : 'Open'}
        </button>
        <div className="p-foot">
          <span>Groundwork</span>
          <span>Never miss twice</span>
        </div>
      </form>
    </main>
  );
}
