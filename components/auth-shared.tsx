'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export type AuthStatus = { hasUser: boolean; authenticated: boolean; username: string | null };

/** Asks the API who you are. Already logged in → straight to the universe. */
export function useAuthStatus() {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [offline, setOffline] = useState(false);

  const retry = useCallback(() => {
    setOffline(false);
    api<AuthStatus>('/auth/status')
      .then((s) => {
        if (s.authenticated) router.replace('/universe');
        else setStatus(s);
      })
      .catch(() => setOffline(true));
  }, [router]);

  useEffect(retry, [retry]);
  return { status, offline, retry };
}

/** The paper card both auth pages sit on. */
export function AuthCard({
  kicker,
  title,
  children,
  onSubmit,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
}) {
  const body = (
    <>
      <div className="p-head">
        <div>
          <div className="p-kicker">Groundwork · {kicker}</div>
          <div className="p-title">{title}</div>
        </div>
      </div>
      {children}
      <div className="p-foot">
        <span>Groundwork</span>
        <span>Never miss twice</span>
      </div>
    </>
  );
  return (
    <main className="min-h-dvh grid place-items-center p-4">
      {onSubmit ? (
        <form onSubmit={onSubmit} className="paper w-full max-w-md" style={{ minHeight: 0 }}>
          {body}
        </form>
      ) : (
        <div className="paper w-full max-w-md" style={{ minHeight: 0 }}>
          {body}
        </div>
      )}
    </main>
  );
}

export const primaryBtn =
  'mt-2 rounded-lg bg-[#23358f] px-4 py-2.5 font-semibold text-white hover:bg-[#1b2a75] disabled:opacity-50';
export const authLink = 'font-semibold text-[color:var(--ink)] underline underline-offset-2';

export function ApiOffline({ onRetry }: { onRetry: () => void }) {
  return (
    <AuthCard kicker="offline" title="The API isn't running">
      <p className="text-sm text-[#3b3934]">The book can&apos;t open until the backend is up. In a terminal:</p>
      <pre className="rounded-lg bg-[#1f2128] p-3 text-[13px] text-zinc-100">cd groundwork-api{'\n'}npm run dev</pre>
      <p className="text-sm text-[#3b3934]">
        Wait for <b>&ldquo;Groundwork API on http://localhost:4000/api&rdquo;</b>, then press Retry.
      </p>
      <button onClick={onRetry} className={primaryBtn}>
        Retry
      </button>
    </AuthCard>
  );
}
