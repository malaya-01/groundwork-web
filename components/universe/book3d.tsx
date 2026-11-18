'use client';

// A physical hardcover: rounded boards with foil-stamped, embossed covers; a rounded spine with
// raised bands; a page block whose fore-edge is concave when closed and whose top sheets curve
// into the binding when open; gilt or sprayed edges; headbands; stacks that shift from right to
// left as you read; ribbon bookmarks. Journals and library books share it; only journals can be
// written in.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { easing } from 'maath';
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three-stdlib';
import { bookPages } from '@/lib/book';
import {
  COVER,
  HERO_Y,
  anchors,
  beginDragTurn,
  clock,
  deckZ,
  dimsOf,
  drag,
  enterWrite,
  focusBook,
  galleryPose,
  openBook,
  orbitAngle,
  orbitPosition,
  readingAnchor,
  requestSnap,
  setZoom,
  sheetCount,
  sheetForLocation,
  snapKey,
  snapshots,
  sortBooks,
  thicknessOf,
  turnPage,
  typesets,
  useU,
  view,
  type Orbit,
  type SnapRequest,
  type UBook,
} from '@/lib/universe';
import { blankPageTexture, edgeTexture, gutterTexture, lampTexture, libPageTexture, mirror, pageTexture, ribbonTexture, snapTexture, type PageContext } from './textures';
import { backMaps, edgeTone, frontMaps, spineMapsFor, type Maps } from './book-art';

const { C, OVER } = COVER;
const tmpPos = new Vector3();
const tmpEuler = new Euler();
const tmpQ = new Quaternion();
const tmpScale = new Vector3();

/** Where the open book sits on the deck: facing you, flat for reading; `tilt` leans it back like a book on a desk. */
export const openPose = (deck: number) => ({ pos: new Vector3(0, 0.35, deck + 3.5), rotX: -view.tilt * 0.6 + view.pitch, rotY: view.yaw });

// ------------------------------------------------------------------ page-block shape
const N = 28; // profile segments from spine to fore-edge
const NZ = 6; // fore-edge segments through the thickness (for its concave curve)
const PAGE_COLS = 40;

/**
 * Height of the top sheet above the board at u (0 = spine, 1 = fore-edge).
 * Open books dip into the binding and bulge slightly; closed books are flat.
 */
export function surf(u: number, stack: number, open: number): number {
  const t = Math.min(1, Math.max(0, u) / 0.16);
  const rise = 1 - Math.pow(1 - t, 2.4);
  const r = 1 + (rise - 1) * open;
  const bulge = open * 0.016 * Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
  return stack * r + bulge + 0.002;
}

function makeBlockGeometry(): BufferGeometry {
  const ends = N * 6 * 2;
  const outer = NZ * 6;
  const top = N * 6;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array((ends + outer + top) * 3), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((ends + outer + top) * 2), 2));
  g.addGroup(0, ends + outer, 0); // page edges
  g.addGroup(ends + outer, top, 1); // top sheet (under the page plane)
  return g;
}

const EDGE_REPEAT = 0.014; // world units per stripe-texture repeat
/**
 * Rebuilds a page block in place. side 1 = right of the spine, -1 = left.
 * `concave(z)` gives how far the fore-edge is pushed in at local height z (rounded-back books).
 */
function updateBlock(g: BufferGeometry, side: 1 | -1, W: number, H: number, zb: number, stack: number, open: number, concave: (z: number) => number) {
  const pos = g.attributes.position.array as Float32Array;
  const uv = g.attributes.uv.array as Float32Array;
  let p = 0;
  let q = 0;
  const V = (x: number, y: number, z: number, u: number, v: number) => {
    pos[p++] = x;
    pos[p++] = y;
    pos[p++] = z;
    uv[q++] = u;
    uv[q++] = v;
  };
  const xs: number[] = [];
  const zs: number[] = [];
  for (let k = 0; k <= N; k++) {
    const u = k / N;
    xs.push(side * u * W);
    zs.push(zb + surf(u, stack, open) - 0.0015);
  }
  const ev = (z: number) => (z - zb) / EDGE_REPEAT;
  const xAt = (k: number, z: number) => (k === N ? side * (W - concave(z)) : xs[k]);
  for (const y of [H / 2, -H / 2]) {
    for (let k = 0; k < N; k++) {
      const [z0, z1] = [zs[k], zs[k + 1]];
      const xb0 = xAt(k, zb);
      const xb1 = xAt(k + 1, zb);
      const xt0 = xAt(k, z0);
      const xt1 = xAt(k + 1, z1);
      V(xb0, y, zb, k / N, 0);
      V(xb1, y, zb, (k + 1) / N, 0);
      V(xt1, y, z1, (k + 1) / N, ev(z1));
      V(xb0, y, zb, k / N, 0);
      V(xt1, y, z1, (k + 1) / N, ev(z1));
      V(xt0, y, z0, k / N, ev(z0));
    }
  }
  // fore-edge, curved through the thickness
  const zo = zs[N];
  for (let j = 0; j < NZ; j++) {
    const za = zb + ((zo - zb) * j) / NZ;
    const zc = zb + ((zo - zb) * (j + 1)) / NZ;
    const xa = xAt(N, za);
    const xc = xAt(N, zc);
    V(xa, H / 2, za, 0, ev(za));
    V(xa, -H / 2, za, 1, ev(za));
    V(xc, -H / 2, zc, 1, ev(zc));
    V(xa, H / 2, za, 0, ev(za));
    V(xc, -H / 2, zc, 1, ev(zc));
    V(xc, H / 2, zc, 0, ev(zc));
  }
  // top sheet
  for (let k = 0; k < N; k++) {
    V(xs[k], H / 2, zs[k], k / N, 1);
    V(xs[k + 1], H / 2, zs[k + 1], (k + 1) / N, 1);
    V(xs[k + 1], -H / 2, zs[k + 1], (k + 1) / N, 0);
    V(xs[k], H / 2, zs[k], k / N, 1);
    V(xs[k + 1], -H / 2, zs[k + 1], (k + 1) / N, 0);
    V(xs[k], -H / 2, zs[k], k / N, 0);
  }
  g.attributes.position.needsUpdate = true;
  g.attributes.uv.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
}

/** Bends a page plane (PlaneGeometry, PAGE_COLS × 1) onto the block's top surface. */
function updatePage(g: PlaneGeometry, side: 1 | -1, W: number, H: number, zb: number, stack: number, open: number) {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const col = i % (PAGE_COLS + 1);
    const row = Math.floor(i / (PAGE_COLS + 1));
    const x = side === 1 ? (col / PAGE_COLS) * W : -W + (col / PAGE_COLS) * W;
    pos.setXYZ(i, x, row === 0 ? H / 2 : -H / 2, zb + surf(Math.abs(x) / W, stack, open));
  }
  pos.needsUpdate = true;
  g.computeBoundingSphere();
}

function coverMaterial(m: Maps, lib: boolean) {
  return new MeshPhysicalMaterial({
    map: m.map,
    bumpMap: m.bump,
    bumpScale: lib ? 1.2 : 2.4,
    roughnessMap: m.rm,
    metalnessMap: m.rm,
    roughness: 1,
    metalness: 1,
    // laminated jackets have a soft gloss; leather a gentle sheen
    clearcoat: lib ? 0.22 : 0.04,
    clearcoatRoughness: 0.45,
    sheen: lib ? 0 : 0.3,
    sheenRoughness: 0.6,
    sheenColor: '#b9a27a',
    envMapIntensity: 0.8,
  });
}

// ------------------------------------------------------------------ the book
export function Book3D({ book, index, total, orbit }: { book: UBook; index: number; total: number; orbit: Orbit }) {
  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const hinge = useRef<Group>(null);
  const spine = useRef<Mesh>(null);
  const bands = useRef<Group>(null);
  const anim = useRef({ hinge: Math.PI, f: 0.5, built: '', spin: 0 });
  // page planes share the block's live shape
  const pageGeo = useRef<{ R: PlaneGeometry | null; L: PlaneGeometry | null }>({ R: null, L: null });
  const stacks = useRef({ TL: 0, TR: 0, open: 0 });
  const [hovered, setHovered] = useState(false);
  const { W, H } = dimsOf(book);
  const T = thicknessOf(book.sheets);
  const id = book.id;
  const lib = book.kind === 'library';

  const isFocus = useU((s) => s.focus === id);
  const mode = useU((s) => s.mode);
  const isOpen = isFocus && (mode === 'open' || mode === 'write');

  const written = book.kind === 'journal' ? Number(book.stats[0]?.[1] ?? 0) : 0;
  const aspect = (W + OVER) / (H + 2 * OVER);

  const geos = useMemo(() => {
    const board = new RoundedBoxGeometry(W + OVER, H + OVER * 2, C, 2, 0.011);
    const spineGeo = new CylinderGeometry(1, 1, H + 2 * OVER, 32, 1, true, Math.PI, Math.PI);
    const band = new CylinderGeometry(0.011, 0.011, 1, 10);
    band.rotateX(Math.PI / 2); // axis along z (through the thickness)
    return { board, spineGeo, band, blockR: makeBlockGeometry(), blockL: makeBlockGeometry() };
  }, [W, H]);
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);

  const mats = useMemo(() => {
    const front = coverMaterial(frontMaps(book, aspect, written), lib);
    const back = coverMaterial(backMaps(book, aspect), lib);
    const sp = spineMapsFor(book);
    const spineM = coverMaterial(sp, lib);
    spineM.side = DoubleSide;
    const tone = edgeTone(book);
    const edge = new MeshPhysicalMaterial({ map: edgeTexture(), color: tone.color, metalness: tone.metal, roughness: tone.rough, side: DoubleSide, envMapIntensity: 1.2 });
    const top = new MeshStandardMaterial({ color: '#efe8da', roughness: 0.95, side: DoubleSide });
    const boardEdge = new MeshPhysicalMaterial({ map: sp.map, roughness: lib ? 0.45 : 0.6, metalness: 0, clearcoat: lib ? 0.4 : 0 });
    const endpaper = new MeshStandardMaterial({ color: lib ? '#e7dcc6' : '#e9dfc8', roughness: 0.9 });
    const band = new MeshStandardMaterial({ color: lib ? book.accent : '#7a1d2b', roughness: 0.5 });
    return {
      block: [edge, top],
      // [px, nx, py, ny, pz (inside), nz (outside)]
      back: [boardEdge, boardEdge, boardEdge, boardEdge, endpaper, back],
      front: [boardEdge, boardEdge, boardEdge, boardEdge, endpaper, front],
      spine: spineM,
      band,
    };
  }, [book, aspect, written, lib]);
  useEffect(
    () => () => {
      for (const m of new Set([...mats.block, ...mats.back, ...mats.front, mats.spine, mats.band])) m.dispose();
    },
    [mats],
  );

  // let the scene project this book's position for its floating label
  useEffect(() => {
    const g = outer.current;
    if (g) anchors.set(id, g);
    return () => {
      if (anchors.get(id) === g) anchors.delete(id);
    };
  }, [id]);

  useFrame((state, dt) => {
    const g = outer.current;
    if (!g) return;
    const s = useU.getState();
    const deck = deckZ(total);
    const t = state.clock.elapsedTime;
    let smooth = 1.0;
    let scale = 1;
    const a = anim.current;

    if (s.mode === 'orbit' || s.focus === null) {
      orbitPosition(orbit, clock.t, tmpPos);
      const ang = orbitAngle(orbit, clock.t);
      tmpEuler.set(0.22 + Math.sin(clock.t * 0.3 + index) * 0.08, -ang + Math.PI, 0.1);
      scale = hovered || s.hover === id ? 2.15 : 1.9;
      smooth = 1.1;
    } else {
      const order = sortBooks(s.books).map((b) => b.id);
      const d = index - order.indexOf(s.focus);
      if (d === 0 && (s.mode === 'open' || s.mode === 'write')) {
        const p = openPose(deck);
        tmpPos.copy(p.pos);
        tmpEuler.set(p.rotX, p.rotY, 0);
        smooth = 0.55;
      } else if (d === 0) {
        // the hero: floating above its pedestal, turning gently (or round to its back cover)
        easing.damp(a, 'spin', s.preview ? Math.PI : 0, 0.5, dt);
        tmpPos.set(0, HERO_Y + Math.sin(t * 1.1) * 0.045, deck);
        tmpEuler.set(-0.04, Math.sin(t * 0.45) * 0.16 + a.spin, Math.sin(t * 0.7) * 0.012);
        scale = 1.12;
        smooth = 0.75;
      } else {
        const gp = galleryPose(d, deck);
        // while a book is open the others step back into the dark
        const away = s.mode === 'open' || s.mode === 'write' ? 1 : 0;
        tmpPos.set(gp.x * (1 + away * 0.6), gp.y + Math.sin(t * 0.8 + index * 1.3) * 0.05 - away * 5, gp.z - away * 22);
        tmpEuler.set(-0.06, gp.rotY + Math.sin(t * 0.5 + index) * 0.04, 0);
        scale = gp.scale * (hovered || s.hover === id ? 1.08 : 1) * (1 - away * 0.999);
        smooth = 0.9;
      }
    }
    easing.damp3(g.position, tmpPos, smooth, dt);
    easing.dampQ(g.quaternion, tmpQ.setFromEuler(tmpEuler), smooth, dt);
    easing.damp3(g.scale, tmpScale.setScalar(scale), 0.5, dt);

    // open / close on the spine hinge; keep the closed book centred
    const openNow = s.focus === id && (s.mode === 'open' || s.mode === 'write');
    easing.damp(a, 'hinge', openNow ? 0 : Math.PI, 0.55, dt);
    const c = a.hinge / Math.PI; // closedness: 1 = closed
    const open = 1 - c;
    // reading progress: how much of the block lies on the left
    const n = Math.max(1, sheetCount(book) || book.sheets);
    const fTarget = openNow ? Math.min(1, Math.max(0, (s.sheet + 1) / n)) : a.f;
    easing.damp(a, 'f', fTarget, 0.35, dt);
    const TL = T * a.f;
    const TR = T * (1 - a.f);

    if (hinge.current) {
      hinge.current.rotation.y = a.hinge;
      hinge.current.position.z = -T * open; // the pivot drops to the board as the book opens
    }
    if (inner.current) inner.current.position.x = -(W / 2) * c;
    if (spine.current) {
      // round when closed, flattened under the gutter when open
      const rz = (T / 2 + C) * c + (C / 2) * open;
      const rx = Math.min(0.1, (T / 2 + C) * 0.7) * c + 0.01 * open;
      spine.current.scale.set(rx, 1, rz);
      spine.current.position.z = (-T / 2) * c + (-T - C / 2) * open;
    }
    if (bands.current) {
      bands.current.visible = c > 0.6;
      bands.current.scale.set(1, 1, T);
      bands.current.position.z = -T / 2;
    }
    const sig = `${TL.toFixed(4)}:${open.toFixed(3)}`;
    if (sig !== a.built) {
      a.built = sig;
      // rounded back: the fore-edge curves inwards through the thickness when the book is closed
      const depth = Math.min(0.045, T * 0.22) * c;
      const concaveR = (z: number) => depth * (1 - Math.pow((z + T / 2) / (T / 2), 2));
      const concaveL = (z: number) => depth * (1 - Math.pow((-z + T / 2) / (T / 2), 2));
      updateBlock(geos.blockR, 1, W, H, -T, TR, open, concaveR);
      updateBlock(geos.blockL, -1, W, H, 0, TL, open, concaveL);
      if (pageGeo.current.R) updatePage(pageGeo.current.R, 1, W, H, -T, TR, open);
      if (pageGeo.current.L) updatePage(pageGeo.current.L, -1, W, H, 0, TL, open);
      stacks.current = { TL, TR, open };
    }
    if (openNow && inner.current) Object.assign(readingAnchor, { group: inner.current, W, H, T, TL, TR, open });
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const s = useU.getState();
    if (s.mode === 'orbit' || s.focus !== id) focusBook(id);
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
          useU.getState().set({ hover: id });
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          if (useU.getState().hover === id) useU.getState().set({ hover: null });
          document.body.style.cursor = '';
        }}
      >
        {/* right half: back board + page block (static) */}
        <mesh position={[(W + OVER) / 2, 0, -T - C / 2]} geometry={geos.board} material={mats.back} />
        <mesh geometry={geos.blockR} material={mats.block} />
        {/* left half: hinged at the spine. Closed = rotated π onto the right half. */}
        <group ref={hinge} rotation={[0, Math.PI, 0]}>
          <mesh position={[-(W + OVER) / 2, 0, -C / 2]} geometry={geos.board} material={mats.front} />
          <mesh geometry={geos.blockL} material={mats.block} />
          {isOpen && <SpreadLeft book={book} geoRef={pageGeo} stacks={stacks} />}
        </group>
        <mesh ref={spine} geometry={geos.spineGeo} material={mats.spine} />
        {/* headbands at the head and tail of the spine */}
        <group ref={bands}>
          <mesh geometry={geos.band} material={mats.band} position={[0.012, H / 2 - 0.004, 0]} />
          <mesh geometry={geos.band} material={mats.band} position={[0.012, -H / 2 + 0.004, 0]} />
        </group>
        {isOpen && <SpreadRight book={book} geoRef={pageGeo} stacks={stacks} T={T} />}
        <Ribbons book={book} T={T} stacks={stacks} isOpen={isOpen} />
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ page textures for the open spread

function usePageContext(book: UBook): PageContext | null {
  const year = book.year ?? 0;
  const logs = useU((s) => (book.kind === 'journal' && s.logsYear === year ? s.logs : null));
  const font = useU((s) => s.font);
  const fontScale = useU((s) => s.fontScale);
  const fontReady = useU((s) => s.fontReady);
  const startDate = useU((s) => s.startDate);
  const codeA = useU((s) => s.codeA);
  const codeB = useU((s) => s.codeB);
  const username = useU((s) => s.username);
  return useMemo(
    () => (book.kind === 'journal' && logs && fontReady ? { year, sheets: bookPages(year), logs, font, fontScale, startDate, codeA, codeB, username } : null),
    [book.kind, year, logs, font, fontScale, fontReady, startDate, codeA, codeB, username],
  );
}

interface SpreadTex {
  left: Texture;
  right: Texture;
  turnFront: Texture | null;
  turnBack: Texture | null;
  wanted: SnapRequest[];
}

/**
 * Textures for the open spread, accounting for a page mid-turn. (While you read face-on, crisp
 * HTML pages cover these; the textures show during turns and in the desk view.)
 * Journals: the photographed 2D page. Library books: the typeset page.
 */
function useSpread(book: UBook): SpreadTex | null {
  const pc = usePageContext(book);
  const epoch = useU((s) => s.snapEpoch);
  const version = useU((s) => s.snapVersion);
  const tsVersion = useU((s) => s.typesetVersion);
  const sheet = useU((s) => s.sheet);
  const turn = useU((s) => s.turn);
  const { W, H } = dimsOf(book);
  return useMemo(() => {
    const aspect = W / H;
    const leftIdx = turn?.dir === -1 ? sheet - 1 : sheet;
    const rightIdx = turn?.dir === 1 ? sheet + 2 : sheet + 1;
    const turnIdx = turn ? (turn.dir === 1 ? sheet + 1 : sheet) : null;

    if (book.kind === 'library') {
      const ts = typesets.get(book.id);
      if (!ts) return null;
      const n = Math.ceil(ts.pages.length / 2);
      const tex = (side: 'front' | 'back', idx: number) => {
        const p = side === 'front' ? 2 * idx : 2 * idx + 1;
        if (idx < 0 || idx >= n || p >= ts.pages.length) return blankPageTexture(aspect, 'endpaper');
        return libPageTexture(ts, p);
      };
      return {
        left: tex('back', leftIdx),
        right: tex('front', rightIdx),
        turnFront: turnIdx !== null ? tex('front', turnIdx) : null,
        turnBack: turnIdx !== null ? mirror(tex('back', turnIdx)) : null,
        wanted: [],
      };
    }

    if (!pc) return null;
    const year = book.year!;
    const n = pc.sheets.length;
    const tex = (side: 'front' | 'back', idx: number) => {
      if (idx >= 0 && idx < n) {
        const key = snapKey(year, idx, side, epoch);
        const shot = snapshots.get(key);
        if (shot) return snapTexture(key, shot);
      }
      return pageTexture(side, idx, pc);
    };
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
    // version / tsVersion: re-run when a new photo or typeset arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, pc, epoch, version, tsVersion, sheet, turn, W, H]);
}

// ------------------------------------------------------------------ hand-held page turning + pan

let clickTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Press on a page: a short click turns it (after a beat, so a double-click can act);
 * press-and-drag grabs the page and it follows your pointer like paper.
 * When zoomed in, dragging pans instead, and a click doesn't turn.
 */
function onPagePointerDown(e: ThreeEvent<PointerEvent>, dir: 1 | -1, W: number) {
  e.stopPropagation();
  view.pageDownAt = e.nativeEvent.timeStamp; // tells the scene this press isn't a rotation
  if (useU.getState().mode !== 'open' || useU.getState().turn) return;
  const x0 = e.nativeEvent.clientX;
  const y0 = e.nativeEvent.clientY;

  if (view.zoom > 1.02) {
    const p0 = { x: view.panX, y: view.panY };
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      document.body.style.cursor = 'grabbing';
      view.panX = p0.x - dx * view.worldPerPx;
      view.panY = p0.y + dy * view.worldPerPx;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return;
  }

  const canvas = e.nativeEvent.target as HTMLElement;
  const m = e.object;
  const a = new Vector3(-W / 2, 0, 0).applyMatrix4(m.matrixWorld).project(e.camera);
  const b = new Vector3(W / 2, 0, 0).applyMatrix4(m.matrixWorld).project(e.camera);
  const pageW = Math.max(60, (Math.abs(b.x - a.x) / 2) * canvas.clientWidth);
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
    vel = along(ev.clientX - lastX) / Math.max(1, now - lastT);
    lastX = ev.clientX;
    lastT = now;
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

/** Double-click: journals → write on that page; library books (read-only) → zoom in/out there. */
function onPageDoubleClick(e: ThreeEvent<MouseEvent>, side: 'front' | 'back', book: UBook) {
  e.stopPropagation();
  clearTimeout(clickTimer);
  if (book.kind === 'journal') {
    enterWrite(side);
    return;
  }
  if (view.zoom > 1.02) setZoom(1);
  else {
    const local = e.object.parent!.worldToLocal(e.point.clone());
    setZoom(2.2, { x: local.x - view.panX, y: local.y - view.panY });
  }
}

type GeoRef = React.MutableRefObject<{ R: PlaneGeometry | null; L: PlaneGeometry | null }>;
type StacksRef = React.MutableRefObject<{ TL: number; TR: number; open: number }>;

/** A paper page: the printed texture, gutter shadow and desk-lamp light, all on the curved sheet. */
function PageMesh({
  geometry,
  map,
  side,
  onPointerDown,
  onDoubleClick,
}: {
  geometry: PlaneGeometry;
  map: Texture;
  side: 'left' | 'right';
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onDoubleClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  const gutter = useMemo(() => gutterTexture(side === 'right' ? 'left' : 'right'), [side]);
  const lamp = useMemo(() => lampTexture(side), [side]);
  return (
    <group>
      <mesh geometry={geometry} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} renderOrder={1}>
        <meshBasicMaterial map={map} toneMapped={false} side={FrontSide} />
      </mesh>
      <mesh geometry={geometry} renderOrder={2} raycast={() => null}>
        <meshBasicMaterial map={gutter} transparent depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
      <mesh geometry={geometry} renderOrder={3} raycast={() => null}>
        <meshBasicMaterial map={lamp} transparent depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
    </group>
  );
}

function SpreadLeft({ book, geoRef, stacks }: { book: UBook; geoRef: GeoRef; stacks: StacksRef }) {
  const spread = useSpread(book);
  const { W, H } = dimsOf(book);
  const geo = useMemo(() => new PlaneGeometry(W, H, PAGE_COLS, 1), [W, H]);
  useEffect(() => {
    geoRef.current.L = geo;
    const st = stacks.current;
    updatePage(geo, -1, W, H, 0, st.TL, st.open);
    return () => {
      if (geoRef.current.L === geo) geoRef.current.L = null;
      geo.dispose();
    };
  }, [geo, geoRef, stacks, W, H]);
  if (!spread) return null;
  return <PageMesh geometry={geo} map={spread.left} side="left" onPointerDown={(e) => onPagePointerDown(e, -1, W)} onDoubleClick={(e) => onPageDoubleClick(e, 'back', book)} />;
}

function SpreadRight({ book, geoRef, stacks, T }: { book: UBook; geoRef: GeoRef; stacks: StacksRef; T: number }) {
  const spread = useSpread(book);
  const turn = useU((s) => s.turn);
  const sheet = useU((s) => s.sheet);
  const { W, H } = dimsOf(book);
  const geo = useMemo(() => new PlaneGeometry(W, H, PAGE_COLS, 1), [W, H]);
  useEffect(() => {
    geoRef.current.R = geo;
    const st = stacks.current;
    updatePage(geo, 1, W, H, -T, st.TR, st.open);
    return () => {
      if (geoRef.current.R === geo) geoRef.current.R = null;
      geo.dispose();
    };
  }, [geo, geoRef, stacks, W, H, T]);

  // journals: queue photos of the real pages, the visible spread first, then its neighbours
  useEffect(() => {
    if (!spread) return;
    spread.wanted.slice(0, 2).reverse().forEach((r) => requestSnap(r, true));
    spread.wanted.slice(2).forEach((r) => requestSnap(r));
  }, [spread]);

  if (!spread) return null;
  return (
    <>
      <PageMesh geometry={geo} map={spread.right} side="right" onPointerDown={(e) => onPagePointerDown(e, 1, W)} onDoubleClick={(e) => onPageDoubleClick(e, 'front', book)} />
      {turn && spread.turnFront && spread.turnBack && (
        <TurningPage key={`${sheet}:${turn.dir}`} dir={turn.dir} front={spread.turnFront} back={spread.turnBack} W={W} H={H} T={T} stacks={stacks} />
      )}
    </>
  );
}

const COLS = 36;
const ROWS = 12;

/**
 * A bendable sheet of paper. p = 0 lies on the right stack, p = 1 on the left.
 * Held: follows the pointer with a little lag. Released / auto: critically damped, soft landing.
 * Each column bends more than the last (the curl); rows skew so the grabbed corner leads.
 * At rest it matches each stack's curved surface exactly.
 */
function TurningPage({ dir, front, back, W, H, T, stacks }: { dir: 1 | -1; front: Texture; back: Texture; W: number; H: number; T: number; stacks: StacksRef }) {
  const geo = useMemo(() => new PlaneGeometry(W, H, COLS, ROWS), [W, H]);
  const p = useRef({ v: dir === 1 ? 0 : 1 });
  const done = useRef(false);
  const frontMat = useRef<MeshBasicMaterial>(null);
  const backMat = useRef<MeshBasicMaterial>(null);
  const shadow = useRef<MeshBasicMaterial>(null);

  useEffect(() => () => geo.dispose(), [geo]);

  useFrame((_, dt) => {
    if (done.current) return;
    const step = Math.min(dt, 1 / 30);
    const startP = dir === 1 ? 0 : 1;
    const endP = dir === 1 ? 1 : 0;
    const held = drag.active;
    const target = held ? (dir === 1 ? drag.a : 1 - drag.a) : drag.release === 'cancel' ? startP : endP;
    easing.damp(p.current, 'v', target, held ? 0.07 : 0.3, step);
    if (!held && Math.abs(p.current.v - target) < 0.003) p.current.v = target;
    const v = p.current.v;

    const base = v * Math.PI;
    const lift = Math.sin(v * Math.PI);
    const curl = 0.9 * lift * dir;
    const lean = drag.grabTop ? 1 : -1;
    const seg = W / COLS;
    const { TL, TR } = stacks.current;
    const pos = geo.attributes.position;
    for (let r = 0; r <= ROWS; r++) {
      const y = H / 2 - (r * H) / ROWS;
      const yn = r / ROWS;
      const skew = 0.34 * lift * (0.5 - yn) * lean * dir;
      let x = 0;
      let z = 0;
      for (let c = 0; c <= COLS; c++) {
        const t = c / COLS;
        if (c > 0) {
          const th = Math.min(Math.PI, Math.max(0, base + curl * t * t + skew * t));
          x += seg * Math.cos(th);
          z += seg * Math.sin(th);
        }
        const rest = (1 - v) * surf(t, TR, 1) + v * surf(t, TL, 1);
        pos.setXYZ(r * (COLS + 1) + c, x, y, -T + z + rest + 0.0025 + lift * 0.01);
      }
    }
    pos.needsUpdate = true;
    geo.computeBoundingSphere();
    const k = 1 - 0.22 * lift;
    frontMat.current?.color.setScalar(k);
    backMat.current?.color.setScalar(k);
    if (shadow.current) shadow.current.opacity = 0.12 * lift;

    if (!held && v === target) {
      done.current = true;
      const s = useU.getState();
      if (target === endP) s.set({ sheet: s.sheet + dir, turn: null });
      else s.set({ turn: null });
    }
  });

  return (
    <group>
      <mesh geometry={geo} renderOrder={4}>
        <meshBasicMaterial ref={frontMat} map={front} toneMapped={false} side={FrontSide} />
      </mesh>
      <mesh geometry={geo} renderOrder={4}>
        <meshBasicMaterial ref={backMat} map={back} toneMapped={false} side={BackSide} />
      </mesh>
      {/* soft shadow the lifting sheet casts on the pages beneath */}
      <mesh position={[(dir === 1 ? 1 : -1) * (W / 2), 0, -T + T / 2 + 0.004]} renderOrder={3} raycast={() => null}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial ref={shadow} color="#1a1206" transparent opacity={0} side={DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ------------------------------------------------------------------ ribbon bookmarks
const RIBBONS = ['#9e1b32', '#c9a227', '#1f6f78'];
const RIBBON_W = 0.032;
const TAIL = 0.32;

/**
 * Your bookmarks as satin ribbons. On the open spread a ribbon lies across the page near the
 * spine; bookmarks further on (or back) show only a tail hanging below that side of the block;
 * a closed book shows the tails below its foot.
 */
function Ribbons({ book, T, stacks, isOpen }: { book: UBook; T: number; stacks: StacksRef; isOpen: boolean }) {
  const marks = useU((s) => s.reading[book.id]?.marks);
  const sheet = useU((s) => s.sheet);
  const tsVersion = useU((s) => s.typesetVersion);
  const { W, H } = dimsOf(book);
  const sheets = useMemo(
    () => (marks ?? []).map((m) => sheetForLocation(book, m)).filter((x): x is number => x !== null).slice(0, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [marks, book, tsVersion],
  );
  if (!sheets.length) return null;
  return (
    <>
      {sheets.map((m, i) => {
        const x = 0.06 + i * 0.045;
        const tex = ribbonTexture(RIBBONS[i % RIBBONS.length]);
        const { TL, TR } = stacks.current;
        if (isOpen && m === sheet) {
          const z = -T + surf(x / W, TR, 1) + 0.006;
          return (
            <mesh key={i} position={[x, -TAIL / 2, z]} renderOrder={5}>
              <planeGeometry args={[RIBBON_W, H + TAIL]} />
              <meshStandardMaterial map={tex} alphaTest={0.5} side={DoubleSide} roughness={0.4} />
            </mesh>
          );
        }
        const onLeft = isOpen && m < sheet;
        const z = isOpen ? -T + (onLeft ? TL : TR) * 0.5 : -T / 2;
        return (
          <mesh key={i} position={[onLeft ? -x : x, -H / 2 - TAIL / 2 + 0.03, z]}>
            <planeGeometry args={[RIBBON_W, TAIL]} />
            <meshStandardMaterial map={tex} alphaTest={0.5} side={DoubleSide} roughness={0.4} />
          </mesh>
        );
      })}
    </>
  );
}
