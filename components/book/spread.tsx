'use client';

// An open book as a two-page spread, turned a leaf at a time like a real one.
//
// The book is a stack of sheets. Spread s shows the BACK of sheet s-1 on the left and the FRONT
// of sheet s on the right. Turning forward lifts sheet s off the right page and lays it down on
// the left (its front swings away, its back lands face up). Both faces of the turning leaf are
// real pages, keyed by where they sit in the book, so a page never re-mounts or reloads as it
// moves from the leaf to its resting place.
//
// Used by the journal's book view and by the Codex.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';

export type FaceSide = 'front' | 'back';

interface Turn {
  from: number;
  to: number;
  dir: 1 | -1;
}

export interface SpreadApi {
  /** the spread on show (during a turn: the one it started from) */
  s: number;
  turning: Turn | null;
  min: number;
  max: number;
  turn: (dir: 1 | -1) => void;
  /** to any spread: the last leaf still turns, so you see where you landed */
  goTo: (t: number) => void;
  /** straight to a spread, no turn (e.g. coming back from writing) */
  jump: (t: number) => void;
  finish: () => void;
}

const TURN_MS = 700;

/** The window's size, kept up to date (the spread is sized to fit it). */
export function useViewport() {
  const [vp, setVp] = useState(() => (typeof window === 'undefined' ? { w: 1280, h: 800 } : { w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

export function useSpread(
  initial: number,
  {
    min,
    max,
    prepare,
    onMove,
  }: {
    min: number;
    /** Infinity for a book that never ends */
    max: number;
    /** resolve once the pages for spread `to` are ready (they are drawn before the leaf moves) */
    prepare?: (to: number) => Promise<unknown>;
    onMove?: (s: number) => void;
  },
): SpreadApi {
  const clamp = useCallback((t: number) => Math.max(min, Math.min(max, t)), [min, max]);
  const [state, setState] = useState<{ s: number; turning: Turn | null }>({ s: clamp(initial), turning: null });
  const live = useRef(state);
  live.current = state;
  const busy = useRef(false);
  const cb = useRef({ prepare, onMove });
  cb.current = { prepare, onMove };

  const goTo = useCallback(
    (target: number) => {
      const t = clamp(target);
      const from = live.current.s;
      if (busy.current || live.current.turning || t === from) return;
      busy.current = true;
      const dir: 1 | -1 = t > from ? 1 : -1;
      Promise.resolve(cb.current.prepare?.(t)).then(
        () => {
          const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (reduce) {
            busy.current = false;
            setState({ s: t, turning: null });
            cb.current.onMove?.(t);
            return;
          }
          // a long jump: quietly open the book one leaf short of the target, then turn that leaf
          setState({ s: t - dir, turning: { from: t - dir, to: t, dir } });
        },
        () => (busy.current = false),
      );
    },
    [clamp],
  );

  const finish = useCallback(() => {
    const t = live.current.turning;
    if (!t) return;
    busy.current = false;
    setState({ s: t.to, turning: null });
    cb.current.onMove?.(t.to);
  }, []);

  const jump = useCallback(
    (target: number) => {
      busy.current = false;
      setState({ s: clamp(target), turning: null });
    },
    [clamp],
  );

  const turn = useCallback((dir: 1 | -1) => goTo(live.current.s + dir), [goTo]);

  return { s: state.s, turning: state.turning, min, max, turn, goTo, jump, finish };
}

// ------------------------------------------------------------------ the book

type Pos = 'left' | 'right' | 'leafA' | 'leafB';
interface Slot {
  sheet: number;
  side: FaceSide;
  pos: Pos;
}
const keyOf = (sheet: number, side: FaceSide) => `${sheet}:${side}`;

function slotsFor(sp: SpreadApi): Slot[] {
  const t = sp.turning;
  if (!t) {
    return [
      { sheet: sp.s - 1, side: 'back', pos: 'left' },
      { sheet: sp.s, side: 'front', pos: 'right' },
    ];
  }
  // the turning leaf is sheet `f` going forward, sheet `to` going back
  const f = t.dir === 1 ? t.from : t.to;
  return [
    { sheet: f - 1, side: 'back', pos: 'left' },
    { sheet: f + 1, side: 'front', pos: 'right' },
    { sheet: f, side: 'front', pos: 'leafA' },
    { sheet: f, side: 'back', pos: 'leafB' },
  ];
}

/** Angle of the leaf through a turn: it lifts quickly, hangs a moment past upright, then settles. */
const ANGLES = [0, -58, -180];
const OFFS = [0, 0.4, 1];

export function SpreadBook({
  sp,
  pageW,
  pageH,
  face,
  stacked = false,
  className,
  onPageDoubleClick,
}: {
  sp: SpreadApi;
  pageW: number;
  pageH: number;
  /** the page drawn on this side of this sheet (sheets outside the book are its end papers) */
  face: (sheet: number, side: FaceSide) => React.ReactNode;
  /** narrow screens: the two pages one above the other, turned without the 3D leaf */
  stacked?: boolean;
  className?: string;
  onPageDoubleClick?: (side: 'left' | 'right') => void;
}) {
  const book = useRef<HTMLDivElement>(null);
  const done = useRef(sp.finish);
  done.current = sp.finish;
  const t = sp.turning;

  useLayoutEffect(() => {
    const el = book.current;
    if (!t || !el) return;
    if (stacked) {
      // no leaf to swing on a phone: the new pages simply come in
      done.current();
      return;
    }
    const q = (pos: Pos) => el.querySelector<HTMLElement>(`[data-pos="${pos}"]`);
    const A = q('leafA');
    const B = q('leafB');
    if (!A || !B) return;
    const angles = t.dir === 1 ? ANGLES : [...ANGLES].reverse();
    const offs = t.dir === 1 ? OFFS : [0, 1 - OFFS[1], 1];
    const opts: KeyframeAnimationOptions = { duration: TURN_MS, easing: 'cubic-bezier(0.45, 0.05, 0.25, 1)', fill: 'both' };
    const anims: Animation[] = [
      A.animate(angles.map((a, i) => ({ transform: `rotateY(${a}deg)`, offset: offs[i] })), opts),
      B.animate(angles.map((a, i) => ({ transform: `rotateY(${a}deg) translateX(${pageW}px) rotateY(180deg)`, offset: offs[i] })), opts),
    ];
    // light and shadow: the lifting page darkens as it turns from the light; the page it
    // uncovers sits in its shadow until it's gone
    const shadeOf = (e: HTMLElement | null) => e?.querySelector<HTMLElement>(':scope > .sb-shade');
    const lift = [{ opacity: 0 }, { opacity: 0.6, offset: 0.45 }, { opacity: 0.9 }];
    const land = [{ opacity: 0.7 }, { opacity: 0.35, offset: 0.55 }, { opacity: 0 }];
    const cast = [{ opacity: 0.85 }, { opacity: 0 }];
    const fwd = t.dir === 1;
    const sA = shadeOf(A);
    const sB = shadeOf(B);
    const under = shadeOf(q(fwd ? 'right' : 'left'));
    if (sA) anims.push(sA.animate(fwd ? lift : [...lift].reverse(), opts));
    if (sB) anims.push(sB.animate(fwd ? land : [...land].reverse(), opts));
    if (under) anims.push(under.animate(fwd ? cast : [...cast].reverse(), opts));

    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      done.current();
    };
    anims[0].onfinish = end;
    const fallback = setTimeout(end, TURN_MS + 300); // e.g. the tab was hidden mid-turn
    return () => {
      clearTimeout(fallback);
      anims.forEach((a) => a.cancel());
    };
  }, [t, pageW, stacked]);

  // drag a page across the spine (or swipe) to turn it; click the outer edge to turn
  const drag = useRef<{ x: number; y: number; side: 'left' | 'right' } | null>(null);
  const onDown = (e: React.PointerEvent, side: 'left' | 'right') => {
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [contenteditable="true"]')) return;
    drag.current = { x: e.clientX, y: e.clientY, side };
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(e.clientY - d.y)) return;
    if (d.side === 'right' && dx < 0) sp.turn(1);
    else if (d.side === 'left' && dx > 0) sp.turn(-1);
    else if (stacked) sp.turn(dx < 0 ? 1 : -1);
  };

  const slots = slotsFor(stacked ? { ...sp, turning: null } : sp);
  return (
    <div
      ref={book}
      className={clsx('sb-book', stacked && 'stacked', t && 'turning', className)}
      style={stacked ? { width: pageW } : { width: pageW * 2, height: pageH }}
      onPointerUp={onUp}
      onPointerCancel={() => (drag.current = null)}
    >
      {slots.map(({ sheet, side, pos }) => {
        const k = keyOf(sheet, side);
        const sidePos = pos === 'left' ? 'left' : 'right';
        return (
          <div
            key={k}
            data-pos={pos}
            className={clsx('sb-face', `sb-${pos}`, side === 'back' ? 'is-back' : 'is-front')}
            style={stacked ? { width: pageW, height: pageH } : { width: pageW, height: pageH, left: pos === 'left' ? 0 : pageW }}
            onPointerDown={pos === 'left' || pos === 'right' ? (e) => onDown(e, sidePos) : undefined}
            onDoubleClick={onPageDoubleClick && (pos === 'left' || pos === 'right') ? () => onPageDoubleClick(sidePos) : undefined}
          >
            {face(sheet, side)}
            <div className="sb-shade" />
          </div>
        );
      })}
      {!stacked && (
        <>
          <div className="sb-gutter" aria-hidden />
          <button className="sb-edge left" disabled={sp.s <= sp.min || !!t} onClick={() => sp.turn(-1)} aria-label="Turn back a page" title="Turn back (←)" />
          <button className="sb-edge right" disabled={sp.s >= sp.max || !!t} onClick={() => sp.turn(1)} aria-label="Turn the page" title="Turn the page (→)" />
        </>
      )}
    </div>
  );
}
