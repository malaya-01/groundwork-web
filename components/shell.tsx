'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, ChevronDown, LogOut, Network, Orbit, Settings as Cog, UserRound } from 'lucide-react';
import clsx from 'clsx';
import { api, post } from '@/lib/api';
import { useHandFont, useSettings, useUpdateSettings } from '@/lib/hooks';
import { HAND_FONTS } from '@/lib/fonts';
import { todayHref } from '@/lib/book';
import { useU } from '@/lib/universe';

export function Shell({ children }: { children: React.ReactNode }) {
  useHandFont();
  const path = usePathname();
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  // the universe runs full-bleed: the bar floats over it and steps aside while you read or write
  const immersive = path.startsWith('/universe');
  const mode = useU((s) => s.mode);
  const focusMode = useU((s) => s.focusMode);
  const hidden = immersive && (mode === 'open' || mode === 'write' || focusMode);

  const nav = [
    { href: '/universe', match: '/universe', label: 'Universe', icon: Orbit },
    { href: todayHref(), match: '/book', label: 'Book', icon: BookOpen },
    { href: '/maps', match: '/maps', label: 'Roadmaps', icon: Network },
    { href: '/settings', match: '/settings', label: 'Settings', icon: Cog },
  ];

  return (
    <div className="min-h-dvh">
      <header
        className={clsx(
          'top-0 z-30 transition-transform duration-500',
          immersive
            ? 'fixed inset-x-0 bg-linear-to-b from-[#050914]/85 via-[#050914]/45 to-transparent'
            : 'sticky border-b border-white/[0.06] bg-[#0e1015]/90 backdrop-blur',
          hidden && '-translate-y-full',
        )}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-5">
          <Link href="/universe" className="mr-2 flex items-baseline gap-2">
            <span className="text-lg font-black tracking-tight text-white">Groundwork</span>
            <span className="hidden font-hand text-[color:#c9b98f] lg:inline" style={{ fontSize: 'calc(18px * var(--hand-scale))' }}>
              never miss twice
            </span>
          </Link>
          <nav className="flex gap-1.5 sm:ml-4">
            {nav.map(({ href, match, label, icon: Icon }) => (
              <Link
                key={match}
                href={href}
                aria-current={path.startsWith(match) ? 'page' : undefined}
                className={clsx(
                  'gw-navlink relative flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13.5px] tracking-[0.01em] transition-colors',
                  path.startsWith(match) ? 'text-white' : 'text-[#aab6c8] hover:text-white',
                )}
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <label className="hidden text-xs text-zinc-400 md:block" htmlFor="font-switch">
              Handwriting
            </label>
            <select
              id="font-switch"
              value={settings?.font ?? 'Caveat'}
              onChange={(e) => update.mutate({ font: e.target.value })}
              className="hidden h-8 max-w-[150px] rounded-lg border border-white/10 bg-[#14161c] px-2 text-sm text-zinc-200 sm:block"
              style={{ fontFamily: `"${settings?.font ?? 'Caveat'}", cursive`, fontSize: 16 }}
              title="Switch the handwriting font"
            >
              {HAND_FONTS.map((f) => (
                <option key={f.name} value={f.name} style={{ fontFamily: `"${f.name}", cursive` }}>
                  {f.name}
                </option>
              ))}
            </select>
            <AccountMenu />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

/** Avatar button: who's signed in, settings, and log out. */
function AccountMenu() {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { data } = useQuery({ queryKey: ['auth-status'], queryFn: () => api<{ username: string | null }>('/auth/status') });
  const name = data?.username ?? '';

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  async function logout() {
    setBusy(true);
    try {
      await post('/auth/logout');
    } finally {
      qc.clear(); // nothing of this account stays in memory
      router.replace('/login');
    }
  }

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex h-9 items-center gap-1.5 rounded-full border pl-1 pr-2 text-sm transition-colors',
          open ? 'border-[#5ce1e6]/60 bg-[#5ce1e6]/10' : 'border-white/10 hover:border-white/25',
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        title={name ? `Signed in as ${name}` : 'Account'}
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#1d2129] text-[13px] font-bold uppercase text-[#c8f6f7]">
          {name ? name[0] : <UserRound size={15} />}
        </span>
        <ChevronDown size={14} className="text-zinc-400" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-40 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#14161c] shadow-2xl">
          <div className="border-b border-white/[0.06] px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Signed in as</div>
            <div className="truncate font-semibold text-zinc-100">{name || '…'}</div>
          </div>
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2.5 text-sm text-zinc-200 hover:bg-white/[0.06]">
            <Cog size={15} /> Settings
          </Link>
          <button role="menuitem" onClick={() => void logout()} disabled={busy} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[#ff9b9b] hover:bg-white/[0.06] disabled:opacity-50">
            <LogOut size={15} /> {busy ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  );
}
