'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { post, ApiError } from '@/lib/api';
import { ApiOffline, AuthCard, authLink, primaryBtn, useAuthStatus } from '@/components/auth-shared';
import { PasswordInput } from '@/components/password-input';

export default function SignupPage() {
  const router = useRouter();
  const { status, offline, retry } = useAuthStatus();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (offline) return <ApiOffline onRetry={retry} />;

  // Single-person app: every page belongs to the one account, so a second
  // account would see the first person's book. Sign-up closes after the first.
  if (status?.hasUser) {
    return (
      <AuthCard kicker="sign up" title="This book has an owner">
        <p className="text-sm text-[#3b3934]">
          Groundwork holds one person&apos;s book, and an account already exists on this database. Log in with that username and password.
        </p>
        <Link href="/login" className={`${primaryBtn} text-center`}>
          Go to log in
        </Link>
      </AuthCard>
    );
  }

  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      await post('/auth/setup', { username: username.trim(), password });
      router.replace('/universe');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard kicker="first page" title="Start your book" onSubmit={submit}>
      <p className="text-sm text-[color:var(--label)]">
        Pick a username and a password. They are stored only in your own database, with the password hashed.
      </p>
      <label className="flex flex-col gap-1">
        <span className="p-label">Username</span>
        <input
          className="hand-input"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          minLength={3}
          maxLength={40}
          pattern="[A-Za-z0-9_.\-]+"
          title="Letters, numbers, and _ . - only"
          autoFocus
        />
        <span className="text-xs text-[color:var(--label)]">3–40 characters: letters, numbers, _ . -</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="p-label">Password</span>
        <PasswordInput
          className="hand-input"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          maxLength={200}
        />
        <span className="text-xs text-[color:var(--label)]">At least 8 characters</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="p-label">Password again</span>
        <PasswordInput
          className="hand-input"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          aria-invalid={mismatch}
        />
        {mismatch && <span className="text-xs text-red-700">Doesn&apos;t match yet</span>}
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button disabled={busy || !status || mismatch} className={primaryBtn}>
        {busy ? '…' : 'Create my book'}
      </button>
      <p className="text-sm text-[color:var(--label)]">
        Already have an account?{' '}
        <Link href="/login" className={authLink}>
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}
