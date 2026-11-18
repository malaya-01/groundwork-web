'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Eye, EyeOff, LogOut } from 'lucide-react';
import { PasswordInput } from '@/components/password-input';
import { ApiError, api, post } from '@/lib/api';
import { useSettings, useUpdateSettings } from '@/lib/hooks';
import { HAND_FONTS } from '@/lib/fonts';

export default function SettingsPage() {
  const router = useRouter();
  const { data } = useSettings();
  const update = useUpdateSettings();
  const [codeA, setCodeA] = useState('');
  const [codeB, setCodeB] = useState('');
  const [start, setStart] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (data) {
      setCodeA(data.codeA);
      setCodeB(data.codeB);
      setStart(data.startDate);
    }
  }, [data]);

  const card = 'rounded-2xl border border-white/10 bg-[#1f2126] p-5';
  const input = 'rounded-lg border border-white/10 bg-[#24262c] px-3 py-2 text-sm outline-none focus:border-white/40';
  const darkEye = 'text-zinc-400 hover:text-white';

  async function exportAll() {
    const json = await api<unknown>('/export');
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `groundwork-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 text-zinc-200">
      <h1 className="text-2xl font-black text-white">Settings</h1>

      <section className={card}>
        <h2 className="font-semibold text-white">Handwriting</h2>
        <p className="mt-1 text-sm text-zinc-400">The font your pages are written in. You can also switch it from the top bar.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {HAND_FONTS.map((f) => (
            <button
              key={f.name}
              onClick={() => update.mutate({ font: f.name })}
              className={`rounded-xl border px-3 py-2 text-left ${data?.font === f.name ? 'border-white bg-white text-black' : 'border-white/10 bg-[#24262c] hover:border-white/30'}`}
            >
              <div style={{ fontFamily: `"${f.name}", cursive`, fontSize: 20 * f.scale, lineHeight: 1.2 }}>Never miss twice</div>
              <div className="mt-1 text-[11px] opacity-60">{f.name}</div>
            </button>
          ))}
        </div>
      </section>

      <section className={card}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Private wave letters</h2>
          <button className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white" onClick={() => setShowKey((s) => !s)}>
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />} {showKey ? 'hide key' : 'show key'}
          </button>
        </div>
        <p className="mt-1 text-sm text-zinc-400">Only these letters appear on your pages.</p>
        {showKey && (
          <div className="mt-3 rounded-xl bg-black/30 p-3 text-sm text-zinc-300">
            <b>{codeA || 'K'}</b> = the urge to eat when you&apos;re not hungry (stress, boredom). <b>{codeB || 'N'}</b> = the private night-time screen urge.
            <br />
            <b>Rode</b> = it passed. <b>Wiped</b> = you gave in. Urges rise, peak and fall if you don&apos;t feed them.
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            First letter
            <input className={`${input} w-20 text-center uppercase`} maxLength={2} value={codeA} onChange={(e) => setCodeA(e.target.value.toUpperCase())} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Second letter
            <input className={`${input} w-20 text-center uppercase`} maxLength={2} value={codeB} onChange={(e) => setCodeB(e.target.value.toUpperCase())} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Day 1 of the system
            <input type="date" className={`${input} [color-scheme:dark]`} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <button
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200"
            onClick={() => update.mutate({ codeA: codeA || 'K', codeB: codeB || 'N', startDate: start }, { onSuccess: () => setMsg('Saved') })}
          >
            Save
          </button>
          {msg && <span className="text-sm text-emerald-400">{msg}</span>}
        </div>
      </section>

      <section className={card}>
        <h2 className="font-semibold text-white">Password</h2>
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await post('/auth/password', pw);
              setPw({ current: '', next: '' });
              setMsg('Password changed');
            } catch (err) {
              setMsg(err instanceof ApiError ? err.message : 'Could not change password');
            }
          }}
        >
          <PasswordInput wrapperClassName="relative flex items-center" toggleClassName={darkEye} placeholder="Current" className={input} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required autoComplete="current-password" />
          <PasswordInput wrapperClassName="relative flex items-center" toggleClassName={darkEye} placeholder="New (8+ chars)" className={input} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required minLength={8} autoComplete="new-password" />
          <button className="rounded-lg bg-[#2e3138] px-4 py-2 text-sm hover:bg-[#383c45]">Change</button>
        </form>
      </section>

      <section className={`${card} flex flex-wrap gap-3`}>
        <button onClick={() => void exportAll()} className="flex items-center gap-2 rounded-lg bg-[#2e3138] px-4 py-2 text-sm hover:bg-[#383c45]">
          <Download size={15} /> Export everything (JSON)
        </button>
        <button
          onClick={async () => {
            await post('/auth/logout');
            router.replace('/login');
          }}
          className="flex items-center gap-2 rounded-lg bg-[#2e3138] px-4 py-2 text-sm hover:bg-[#383c45]"
        >
          <LogOut size={15} /> Log out
        </button>
      </section>
    </main>
  );
}
