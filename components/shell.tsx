'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Network, Orbit, Settings as Cog } from 'lucide-react';
import clsx from 'clsx';
import { useHandFont, useSettings, useUpdateSettings } from '@/lib/hooks';
import { HAND_FONTS } from '@/lib/fonts';
import { todayHref } from '@/lib/book';

export function Shell({ children }: { children: React.ReactNode }) {
  useHandFont();
  const path = usePathname();
  const { data: settings } = useSettings();
  const update = useUpdateSettings();

  const nav = [
    { href: '/universe', match: '/universe', label: 'Universe', icon: Orbit },
    { href: todayHref(), match: '/book', label: 'Book', icon: BookOpen },
    { href: '/maps', match: '/maps', label: 'Roadmaps', icon: Network },
    { href: '/settings', match: '/settings', label: 'Settings', icon: Cog },
  ];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#17181c]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4">
          <Link href="/universe" className="mr-2 flex items-baseline gap-2">
            <span className="text-lg font-black tracking-tight text-white">Groundwork</span>
            <span className="hidden font-hand text-[color:#c9b98f] sm:inline" style={{ fontSize: 'calc(18px * var(--hand-scale))' }}>
              never miss twice
            </span>
          </Link>
          <nav className="flex gap-1">
            {nav.map(({ href, match, label, icon: Icon }) => (
              <Link
                key={match}
                href={href}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm',
                  path.startsWith(match) ? 'bg-white text-black' : 'text-zinc-300 hover:bg-white/10',
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
              className="h-8 max-w-[150px] rounded-lg border border-white/10 bg-[#24262c] px-2 text-sm text-zinc-200"
              style={{ fontFamily: `"${settings?.font ?? 'Caveat'}", cursive`, fontSize: 16 }}
              title="Switch the handwriting font"
            >
              {HAND_FONTS.map((f) => (
                <option key={f.name} value={f.name} style={{ fontFamily: `"${f.name}", cursive` }}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
