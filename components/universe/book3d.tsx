'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { easing } from 'maath';
import { BackSide, DoubleSide, Euler, FrontSide, Group, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3, type Texture } from 'three';
import { bookPages } from '@/lib/book';
import {
  BOOK,
  anchors,
  beginDragTurn,
  clock,
  drag,
  requestSnap,
  snapKey,
  snapshots,
  deckZ,
  enterWrite,
  focusYear,
  openBook,
  orbitAngle,
  orbitPosition,
  turnPage,
  useU,
  type BookInfo,
  type Orbit,
  type SnapRequest,
} from '@/lib/universe';
import { coverTexture, edgeTexture, leatherTexture, mirror, pageTexture, snapTexture, type PageContext } from './textures';

const { W, H, T, C, OVER } = BOOK;
const tmpPos = new Vector3();
const tmpEuler = new Euler();
const tmpQ = new Quaternion();
const tmpScale = new Vector3();

/** Where the open (focused) book sits on the deck. */
export const openPose = (deck: number) => ({ pos: new Vector3(0, 0.35, deck + 3.5), rotX: -0.08 });

export function Book3D({ info, index, total, orbit }: { info: BookInfo; index: number; total: number; orbit: Orbit }) {
  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const hinge = useRef<Group>(null);
  const spine = useRef<Group>(null);
  const hingeAngle = useRef({ v: Math.PI });
  const [hovered, setHovered] = useState(false);
  const year = info.year;

  const mode = useU((s) => s.mode);
  const isFocus = useU((s) => s.focus === year);
  const isOpen = isFocus && (mode === 'open' || mode === 'write');

  const cover = useMemo(() => coverTexture(year, info.pages), [year, info.pages]);
  const leather = useMemo(() => leatherTexture(year), [year]);
  const edge = useMemo(() => edgeTexture(), []);

  // materials: [px, nx, py, ny, pz, nz]
  const blockMats = useMemo(() => {
    const e = new MeshStandardMaterial({ map: edge, roughness: 0.95 });
    const plain = new MeshStandardMaterial({ color: '#fbf7ec', roughness: 0.95 });
    return [e, e, e, e, plain, plain];
  }, [edge]);
  const coverMats = useMemo(() => {
    const side = new MeshStandardMaterial({ map: leather, roughness: 0.6, metalness: 0.05 });
    const art = new MeshStandardMaterial({ map: cover, roughness: 0.55, metalness: 0.08 });
    const inside = new MeshStandardMaterial({ color: '#efe6cf', roughness: 0.9 });
    return { back: [side, side, side, side, inside, art], front: [side, side, side, side, inside, art] };
  }, [cover, leather]);

  useEffect(() => () => [...blockMats, ...coverMats.back, ...coverMats.front].forEach((m) => m.dispose()), [blockMats, coverMats]);

  // let the scene project this book's position for its floating label
  useEffect(() => {
    const g = outer.current;
    if (g) anchors.set(year, g);
    return () => {
      if (anchors.get(year) === g) anchors.delete(year);
    };
  }, [year]);

  useFrame((_, dt) => {
    const g = outer.current;
    if (!g) return;
    const s = useU.getState();
    const deck = deckZ(total);
    let smooth = 1.0;
    let scale = 1;

    if (s.mode === 'orbit' || s.focus === null) {
      orbitPosition(orbit, clock.t, tmpPos);
      const a = orbitAngle(orbit, clock.t);
      tmpEuler.set(0.25 + Math.sin(clock.t * 0.3 + index) * 0.1, -a + Math.PI, 0.12);
      scale = hovered || s.hover === year ? 1.05 : 0.85;
      smooth = 1.1;
    } else {
      const years = s.books.map((b) => b.year).sort((a, b) => a - b);
      const d = index - years.indexOf(s.focus);
      if (d === 0 && (s.mode === 'open' || s.mode === 'write')) {
        const p = openPose(deck);
        tmpPos.copy(p.pos);
        tmpEuler.set(p.rotX, 0, 0);
        scale = 1;
        smooth = 0.75;
      } else {
        const away = s.mode === 'carousel' ? 0 : 1;
        tmpPos.set(d * 3.0, 0.6 - Math.abs(d) * 0.06 - away * 0.8, deck - Math.abs(d) * 1.5 - away * 5);
        tmpEuler.set(-0.05, Math.max(-1.1, Math.min(1.1, -d * 0.38)), 0);
        scale = d === 0 ? 1.12 : 0.88 - away * 0.15;
        smooth = 0.95;
      }
    }
    easing.damp3(g.position, tmpPos, smooth, dt);
    easing.dampQ(g.quaternion, tmpQ.setFromEuler(tmpEuler), smooth, dt);
    easing.damp3(g.scale, tmpScale.setScalar(scale), 0.5, dt);

    // open / close on the spine hinge; keep the closed book centred
    const openNow = s.focus === year && (s.mode === 'open' || s.mode === 'write');
    easing.damp(hingeAngle.current, 'v', openNow ? 0 : Math.PI, 0.55, dt);
    const a = hingeAngle.current.v;
    if (hinge.current) hinge.current.rotation.y = a;
    const closedness = a / Math.PI;
    if (inner.current) inner.current.position.x = -(W / 2) * closedness;
    if (spine.current) {
      spine.current.scale.z = 1 + closedness;
      spine.current.position.z = -(T + C) / 2 + ((T + C) / 2) * closedness;
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const s = useU.getState();
    if (s.mode === 'orbit' || s.focus !== year) focusYear(year);
    else if (s.mode === 'carousel') openBook();
  };

  return (
    <group ref={outer} position={[0, 0, 0]} scale={0.001}>
      <group
        ref={inner}
        onClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          useU.getState().set({ hover: year });
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          if (useU.getState().hover === year) useU.getState().set({ hover: null });
          document.body.style.cursor = '';
        }}
      >
        {/* right half: page block + back cover (static) */}
        <mesh position={[W / 2, 0, -T / 2]} material={blockMats}>
          <boxGeometry args={[W, H, T]} />
        </mesh>
        <mesh position={[W / 2 + OVER / 2, 0, -T - C / 2]} material={coverMats.back}>
          <boxGeometry args={[W + OVER, H + OVER * 2, C]} />
        </mesh>
        {/* left half: hinged at the spine (x = 0). Closed = rotated π onto the right half. */}
        <group ref={hinge} rotation={[0, Math.PI, 0]}>
          <mesh position={[-W / 2, 0, -T / 2]} material={blockMats}>
            <boxGeometry args={[W, H, T]} />
          </mesh>
          <mesh position={[-W / 2 - OVER / 2, 0, -T - C / 2]} material={coverMats.front}>
            <boxGeometry args={[W + OVER, H + OVER * 2, C]} />
          </mesh>
          {isOpen && <SpreadLeft year={year} />}
        </group>
        <group ref={spine}>
          <mesh position={[-0.01, 0, 0]} material={coverMats.back[0]}>
            <boxGeometry args={[0.05, H + OVER * 2, T + C]} />
          </mesh>
        </group>
        {isOpen && <SpreadRight year={year} />}
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ the open spread

function usePageContext(year: number): PageContext | null {
  const logs = useU((s) => (s.logsYear === year ? s.logs : null));
  const font = useU((s) => s.font);
  const fontScale = useU((s) => s.fontScale);
  const fontReady = useU((s) => s.fontReady);
  const startDate = useU((s) => s.startDate);
  const codeA = useU((s) => s.codeA);
  const codeB = useU((s) => s.codeB);
  const username = useU((s) => s.username);
  return useMemo(
    () => (logs && fontReady ? { year, sheets: bookPages(year), logs, font, fontScale, startDate, codeA, codeB, username } : null),
    [year, logs, font, fontScale, fontReady, startDate, codeA, codeB, username],
  );
}

/**
 * Textures for the open spread. Uses the photographed 2D page when it's ready
 * (identical to write mode), the drawn page until then. Accounts for a page mid-turn.
 */
function useBookTextures(year: number) {
  const pc = usePageContext(year);
  const epoch = useU((s) => s.snapEpoch);
  const version = useU((s) => s.snapVersion);
  const sheet = useU((s) => s.sheet);
  const turn = useU((s) => s.turn);
  return useMemo(() => {
    if (!pc) return null;
    const n = pc.sheets.length;
    const tex = (side: 'front' | 'back', idx: number) => {
      if (idx >= 0 && idx < n) {
        const key = snapKey(year, idx, side, epoch);
        const shot = snapshots.get(key);
        if (shot) return snapTexture(key, shot);
      }
      return pageTexture(side, idx, pc);
    };
    const leftIdx = turn?.dir === -1 ? sheet - 1 : sheet;
    const rightIdx = turn?.dir === 1 ? sheet + 2 : sheet + 1;
    const turnIdx = turn ? (turn.dir === 1 ? sheet + 1 : sheet) : null;
    // what we need now first, then what the next / previous turn will need
    const wanted: ['front' | 'back', number][] = [
      ['front', sheet + 1],
      ['back', sheet],
      ['front', sheet + 2],
      ['back', sheet + 1],
      ['front', sheet],
      ['back', sheet - 1],
    ];
    return {
      left: tex('back', leftIdx),
      right: tex('front', rightIdx),
      turnFront: turnIdx !== null ? tex('front', turnIdx) : null,
      turnBack: turnIdx !== null ? mirror(tex('back', turnIdx)) : null,
      wanted: wanted
        .filter(([, i]) => i >= 0 && i < n)
        .map(([side, i]): SnapRequest => ({ key: snapKey(year, i, side, epoch), year, index: i, side })),
    };
    // version: re-run when a new photo arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pc, epoch, version, sheet, turn, year]);
}

// ------------------------------------------------------------------ hand-held page turning

let clickTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Press on a page: a short click turns it (after a beat, so a double-click can open write mode);
 * press-and-drag grabs the page and it follows your pointer like paper.
 */
function onPagePointerDown(e: ThreeEvent<PointerEvent>, dir: 1 | -1) {
  e.stopPropagation();
  if (useU.getState().mode !== 'open' || useU.getState().turn) return;
  const canvas = e.nativeEvent.target as HTMLElement;
  const m = e.object;
  const a = new Vector3(-W / 2, 0, 0).applyMatrix4(m.matrixWorld).project(e.camera);
  const b = new Vector3(W / 2, 0, 0).applyMatrix4(m.matrixWorld).project(e.camera);
  const pageW = Math.max(60, (Math.abs(b.x - a.x) / 2) * canvas.clientWidth);
  const x0 = e.nativeEvent.clientX;
  const y0 = e.nativeEvent.clientY;
  const grabTop = (e.uv?.y ?? 0.5) > 0.5;
  let started = false;
  let lastX = x0;
  let lastT = performance.now();
  let vel = 0;

  const move = (ev: PointerEvent) => {
    if (!started) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      if (!beginDragTurn(dir, grabTop)) return;
      started = true;
      clearTimeout(clickTimer);
      document.body.style.cursor = 'grabbing';
    }
    const now = performance.now();
    const along = (x: number) => (dir === 1 ? -x : x);
    vel = along(ev.clientX - lastX) / Math.max(1, now - lastT); // px per ms, positive = turning
    lastX = ev.clientX;
    lastT = now;
    // dragging across ~2 page widths turns the page fully
    drag.a = Math.min(1, Math.max(0, along(ev.clientX - x0) / (pageW * 1.8)));
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    document.body.style.cursor = '';
    if (started) {
      drag.release = drag.a > 0.4 || vel > 0.5 ? 'complete' : 'cancel';
      drag.active = false;
    } else {
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => turnPage(dir), 260);
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function onPageDoubleClick(e: ThreeEvent<MouseEvent>, side: 'front' | 'back') {
  e.stopPropagation();
  clearTimeout(clickTimer);
  enterWrite(side);
}

function SpreadLeft({ year }: { year: number }) {
  const spread = useBookTextures(year);
  if (!spread) return null;
  // Lies on top of the left block (z = 0); when the hinge is open it faces the reader (+z).
  return (
    <mesh position={[-W / 2, 0, 0.002]} onPointerDown={(e) => onPagePointerDown(e, -1)} onDoubleClick={(e) => onPageDoubleClick(e, 'back')}>
      <planeGeometry args={[W, H]} />
      <meshStandardMaterial map={spread.left} emissiveMap={spread.left} emissive="#ffffff" emissiveIntensity={0.16} roughness={0.92} side={FrontSide} />
    </mesh>
  );
}

function SpreadRight({ year }: { year: number }) {
  const spread = useBookTextures(year);
  const turn = useU((s) => s.turn);
  const sheet = useU((s) => s.sheet);

  // queue photos of the real pages: the visible spread first, then its neighbours
  useEffect(() => {
    if (!spread) return;
    spread.wanted.slice(0, 2).reverse().forEach((r) => requestSnap(r, true));
    spread.wanted.slice(2).forEach((r) => requestSnap(r));
  }, [spread]);

  if (!spread) return null;
  return (
    <>
      <mesh position={[W / 2, 0, 0.002]} onPointerDown={(e) => onPagePointerDown(e, 1)} onDoubleClick={(e) => onPageDoubleClick(e, 'front')}>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial map={spread.right} emissiveMap={spread.right} emissive="#ffffff" emissiveIntensity={0.16} roughness={0.92} />
      </mesh>
      {turn && spread.turnFront && spread.turnBack && (
        <TurningPage key={`${sheet}:${turn.dir}`} dir={turn.dir} front={spread.turnFront} back={spread.turnBack} />
      )}
    </>
  );
}

const COLS = 36;
const ROWS = 12;

/**
 * A bendable sheet of paper. p = 0 lies on the right, p = 1 on the left.
 * - Held: p follows your pointer (with a little lag, like real paper).
 * - Released or auto-turned: p settles with critically-damped motion (fast start, soft landing),
 *   to the far side ("complete") or back where it came from ("cancel").
 * Each column bends a little more than the one before (the curl), and rows are skewed so the
 * corner you grabbed leads.
 */
function TurningPage({ dir, front, back }: { dir: 1 | -1; front: Texture; back: Texture }) {
  const geo = useMemo(() => new PlaneGeometry(W, H, COLS, ROWS), []);
  const p = useRef({ v: dir === 1 ? 0 : 1 });
  const done = useRef(false);

  useEffect(() => () => geo.dispose(), [geo]);

  useFrame((_, dt) => {
    if (done.current) return;
    const step = Math.min(dt, 1 / 30); // never skip the motion on a slow frame
    const startP = dir === 1 ? 0 : 1;
    const endP = dir === 1 ? 1 : 0;
    const held = drag.active;
    const target = held ? (dir === 1 ? drag.a : 1 - drag.a) : drag.release === 'cancel' ? startP : endP;
    easing.damp(p.current, 'v', target, held ? 0.07 : 0.3, step);
    if (!held && Math.abs(p.current.v - target) < 0.003) p.current.v = target;
    const v = p.current.v;

    const base = v * Math.PI;
    const lift = Math.sin(v * Math.PI);
    const curl = 0.9 * lift * dir; // the free edge leads in the direction of travel
    const lean = drag.grabTop ? 1 : -1;
    const seg = W / COLS;
    const pos = geo.attributes.position;
    for (let r = 0; r <= ROWS; r++) {
      const y = H / 2 - (r * H) / ROWS;
      const yn = r / ROWS; // 0 = top
      const skew = 0.34 * lift * (0.5 - yn) * lean * dir;
      let x = 0;
      let z = 0;
      for (let c = 0; c <= COLS; c++) {
        if (c > 0) {
          const t = c / COLS;
          // clamp: paper never bends down into the book, whichever corner leads
          const th = Math.min(Math.PI, Math.max(0, base + curl * t * t + skew * t));
          x += seg * Math.cos(th);
          z += seg * Math.sin(th);
        }
        pos.setXYZ(r * (COLS + 1) + c, x, y, z + 0.006 + lift * 0.012);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    if (!held && v === target) {
      done.current = true;
      const s = useU.getState();
      if (target === endP) s.set({ sheet: s.sheet + dir, turn: null });
      else s.set({ turn: null });
    }
  });

  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial map={front} emissiveMap={front} emissive="#ffffff" emissiveIntensity={0.14} side={FrontSide} roughness={0.9} />
      </mesh>
      <mesh geometry={geo}>
        <meshStandardMaterial map={back} emissiveMap={back} emissive="#ffffff" emissiveIntensity={0.14} side={BackSide} roughness={0.9} />
      </mesh>
      {/* soft shadow under the lifting page */}
      <mesh position={[(dir === 1 ? 1 : -1) * (W / 2), 0, 0.003]}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial color="#000" transparent opacity={0.07} side={DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}
