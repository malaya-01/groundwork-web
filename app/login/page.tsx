'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { post, ApiError } from '@/lib/api';
import { ApiOffline, AuthCard, authLink, primaryBtn, useAuthStatus } from '@/components/auth-shared';
import { PasswordInput } from '@/components/password-input';

export default function LoginPage() {
  const router = useRouter();
  const { status, offline, retry } = useAuthStatus();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // No account yet: there is nothing to log in to, so go and create one.
  useEffect(() => {
    if (status && !status.hasUser) router.replace('/signup');
  }, [status, router]);

  if (offline) return <ApiOffline onRetry={retry} />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await post('/auth/login', { username: username.trim(), password });
      router.replace('/universe');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard kicker="welcome back" title="Open your book" onSubmit={submit}>
      <label className="flex flex-col gap-1">
        <span className="p-label">Username</span>
        <input className="hand-input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} autoFocus />
      </label>
      <label className="flex flex-col gap-1">
        <span className="p-label">Password</span>
        <PasswordInput
          className="hand-input"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button disabled={busy || !status} className={primaryBtn}>
        {busy ? '…' : 'Open'}
      </button>
      <p className="text-sm text-[color:var(--label)]">
        New here?{' '}
        <Link href="/signup" className={authLink}>
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}
