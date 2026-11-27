'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdaptiveDpr, ContactShadows, Environment, Lightformer, Line, OrbitControls, PerformanceMonitor, Sparkles, Stars, useTexture } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { easing } from 'maath';
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  DoubleSide,
  EquirectangularReflectionMapping,
  SRGBColorSpace,
  Vector3,
  type DirectionalLight,
  type Group,
  type MeshBasicMaterial,
  type PerspectiveCamera,
} from 'three';
import {
  HERO_Y,
  anchors,
  clock,
  deckZ,
  dimsOf,
  focusedBook,
  labelEls,
  orbitFor,
  orbitPosition,
  readingAnchor,
  readingEls,
  readingFrame,
  setZoom,
  sortBooks,
  useU,
  view,
  type Orbit,
  type Quality,
} from '@/lib/universe';
import { Codex } from './codex';
import { Book3D, openPose, surf } from './book3d';
import { glowTexture, gpu } from './textures';

type OrbitControlsImpl = React.ComponentRef<typeof OrbitControls>;

/** One-off camera commands from the HUD (reset view). */
export const cameraCmd = { reset: 0 };
const ORBIT_HOME = new Vector3(0, 24, 66);

const DPR: Record<Quality, [number, number]> = { high: [1, 2], balanced: [1, 1.5], low: [1, 1] };
const SKY: Record<Quality, string> = { high: '/sky/space-8k.webp', balanced: '/sky/space-4k.webp', low: '/sky/space-2k.webp' };

export default function Scene() {
  const quality = useU((s) => s.quality);
  const bloom = useU((s) => s.bloom);
  const mode = useU((s) => s.mode);
  const reading = mode === 'open' || mode === 'write';
  return (
    <Canvas
      camera={{ position: ORBIT_HOME.toArray(), fov: 40, near: 0.05, far: 3000 }}
      dpr={DPR[quality]}
      gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      onCreated={({ gl }) => {
        gpu.anisotropy = gl.capabilities.getMaxAnisotropy();
      }}
      onPointerMissed={() => useU.getState().set({ hover: null })}
    >
      {/* if frames drop, step quality down once (never up on its own) */}
      <PerformanceMonitor
        onDecline={() => {
          const q = useU.getState().quality;
          if (q !== 'low') useU.getState().set({ quality: q === 'high' ? 'balanced' : 'low' });
        }}
      />
      <AdaptiveDpr pixelated={false} />
      <fogExp2 attach="fog" args={['#070b18', 0.0032]} />
      <Suspense fallback={<color attach="background" args={['#050813']} />}>
        <Sky quality={quality} />
      </Suspense>
      <Suspense fallback={null}>
        {/* image-based light: the panorama's own starlight + a soft studio key, so foil and gloss reflect */}
        <Environment files="/sky/space-env.hdr" environmentIntensity={0.7} resolution={256} frames={1}>
          <Lightformer form="rect" intensity={1.1} color="#ffe2bd" position={[-5, 6, 4]} scale={[4, 2.5, 1]} />
          <Lightformer form="rect" intensity={0.6} color="#9ad7ff" position={[6, 2, -3]} scale={[1.5, 5, 1]} />
          <Lightformer form="rect" intensity={0.5} color="#a58cff" position={[-6, 1, -5]} scale={[2, 5, 1]} />
          <Lightformer form="ring" intensity={0.7} color="#f6dfb0" position={[0, 8, 0]} scale={3} />
        </Environment>
      </Suspense>
      <hemisphereLight args={['#5571b8', '#120c08', 0.35]} />
      <Universe />
      {bloom && !reading && quality !== 'low' && <Effects quality={quality} />}
    </Canvas>
  );
}

/** The 360° panorama: brightest in free flight, dimmed when a book is selected, almost black while reading. */
function Sky({ quality }: { quality: Quality }) {
  const tex = useTexture(SKY[quality]);
  const scene = useThree((s) => s.scene);
  const level = useRef({ bg: 1, env: 0.85 });
  useEffect(() => {
    tex.mapping = EquirectangularReflectionMapping;
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    scene.background = tex;
    return () => {
      if (scene.background === tex) scene.background = null;
    };
  }, [tex, scene]);
  useFrame((_, dt) => {
    const m = useU.getState().mode;
    const l = level.current;
    easing.damp(l, 'bg', m === 'orbit' ? 1 : m === 'carousel' ? 0.5 : 0.06, 0.6, dt);
    easing.damp(l, 'env', m === 'open' || m === 'write' ? 0.45 : 0.7, 0.6, dt);
    // re-applied every frame: drei's <Environment> resets these whenever it re-renders
    if (scene.background !== tex) scene.background = tex;
    scene.backgroundIntensity = l.bg;
    scene.environmentIntensity = l.env;
    scene.backgroundRotation.set(0.12, 2.1, 0.04); // the Milky Way band sweeps behind the deck
  });
  return null;
}

/** Restrained post-processing: a soft bloom on true highlights (foil, the heart of the Codex) and a gentle vignette. */
function Effects({ quality }: { quality: Quality }) {
  return (
    <EffectComposer multisampling={quality === 'high' ? 4 : 0}>
      <Bloom mipmapBlur intensity={0.3} luminanceThreshold={1.0} luminanceSmoothing={0.2} />
      <Vignette eskil={false} offset={0.3} darkness={0.5} />
    </EffectComposer>
  );
}

function Universe() {
  const books = useU((s) => s.books);
  const showOrbits = useU((s) => s.showOrbits);
  const quality = useU((s) => s.quality);
  const sorted = useMemo(() => sortBooks(books), [books]);
  const orbits = useMemo(() => sorted.map((b, i) => orbitFor(i, b.id)), [sorted]);
  const deck = deckZ(sorted.length);
  const controls = useRef<OrbitControlsImpl>(null);

  return (
    <>
      <Clock />
      {/* near stars for parallax against the far panorama, and a little drifting dust (gone while reading) */}
      <HideWhileReading>
        <Stars radius={150} depth={70} count={quality === 'low' ? 400 : 900} factor={2.6} saturation={0.2} fade speed={0.5} />
        <Sparkles count={quality === 'low' ? 30 : 70} scale={[26, 9, 22]} position={[0, 2, deck - 2]} size={2.2} speed={0.18} opacity={0.5} color="#f2dcb0" />
      </HideWhileReading>
      <Codex />
      <KeyLights deck={deck} />
      {showOrbits && orbits.map((o, i) => <OrbitRing key={sorted[i].id} orbit={o} id={sorted[i].id} />)}
      {sorted.map((b, i) => (
        <Book3D key={b.id} book={b} index={i} total={sorted.length} orbit={orbits[i]} />
      ))}
      <Pedestal deck={deck} />
      <LabelProjector />
      <ReadingProjector />
      <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={0.06} minDistance={10} maxDistance={220} rotateSpeed={0.45} zoomSpeed={0.8} />
      <CameraRig controls={controls} deck={deck} />
      <ReadingInput />
    </>
  );
}

function HideWhileReading({ children }: { children: React.ReactNode }) {
  const g = useRef<Group>(null);
  useFrame(() => {
    const m = useU.getState().mode;
    if (g.current) g.current.visible = m !== 'open' && m !== 'write';
  });
  return <group ref={g}>{children}</group>;
}

/**
 * Lighting rig: a warm champagne key from the upper left, a cool cyan rim and a soft violet
 * kicker behind the selected book, and a warm desk lamp while reading.
 */
function KeyLights({ deck }: { deck: number }) {
  const key = useRef<DirectionalLight>(null);
  const rim = useRef<DirectionalLight>(null);
  const kick = useRef<DirectionalLight>(null);
  const lamp = useRef<DirectionalLight>(null);
  useFrame((_, dt) => {
    const m = useU.getState().mode;
    const sel = m === 'carousel';
    const read = m === 'open' || m === 'write';
    if (key.current) easing.damp(key.current, 'intensity', read ? 0.6 : sel ? 1.7 : 1.5, 0.4, dt);
    if (rim.current) easing.damp(rim.current, 'intensity', sel ? 2.4 : 0.5, 0.4, dt);
    if (kick.current) easing.damp(kick.current, 'intensity', sel ? 1.2 : 0.3, 0.4, dt);
    if (lamp.current) easing.damp(lamp.current, 'intensity', read ? 1.6 : 0, 0.4, dt);
  });
  return (
    <>
      <directionalLight ref={key} position={[-6, 9, deck + 10]} intensity={1.6} color="#ffe4c2" />
      <directionalLight ref={rim} position={[5, 4, deck - 7]} intensity={0.6} color="#7fd8ff" />
      <directionalLight ref={kick} position={[-6, 2.5, deck - 6]} intensity={0.3} color="#a58cff" />
      <directionalLight ref={lamp} position={[-5, 7, deck + 9]} intensity={0} color="#ffd6a0" />
    </>
  );
}

/**
 * The selected book's platform: a floating disc of dark glass-metal with a cyan inlay, a gold rim,
 * a soft pool of light and the book's contact shadow. Only while a book is selected.
 */
function Pedestal({ deck }: { deck: number }) {
  const g = useRef<Group>(null);
  const glow = useMemo(() => glowTexture(), []);
  const mats = useRef<(MeshBasicMaterial | null)[]>([]);
  const quality = useU((s) => s.quality);
  const show = useRef({ v: 0 });
  useFrame((state, dt) => {
    const s = useU.getState();
    const on = s.mode === 'carousel' ? 1 : 0;
    easing.damp(show.current, 'v', on, 0.35, dt);
    const v = show.current.v;
    const H = dimsOf(focusedBook()).H;
    if (g.current) {
      g.current.visible = v > 0.01;
      // just under the floating book (which is drawn at 1.12×)
      g.current.position.set(0, HERO_Y - (H / 2 + 0.05) * 1.12 - 0.2 + (1 - v) * -0.5, deck);
      g.current.scale.setScalar(0.9 + 0.1 * v);
    }
    const pulse = 0.9 + Math.sin(state.clock.elapsedTime * 1.4) * 0.1;
    const [inlay, pool] = mats.current;
    if (inlay) inlay.opacity = 0.7 * v * pulse;
    if (pool) pool.opacity = 0.32 * v;
  });
  return (
    <group ref={g} visible={false}>
      {/* the disc */}
      <mesh raycast={() => null}>
        <cylinderGeometry args={[1.3, 1.38, 0.09, 96]} />
        <meshPhysicalMaterial color="#0b1120" metalness={0.85} roughness={0.24} clearcoat={1} clearcoatRoughness={0.18} envMapIntensity={1.2} />
      </mesh>
      {/* gold rim */}
      <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <torusGeometry args={[1.335, 0.012, 12, 128]} />
        <meshPhysicalMaterial color="#d8b46a" metalness={1} roughness={0.25} envMapIntensity={1.5} />
      </mesh>
      {/* cyan inlay ring */}
      <mesh position={[0, 0.047, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[1.08, 1.1, 128]} />
        <meshBasicMaterial ref={(m) => void (mats.current[0] = m)} color="#5ce1e6" transparent opacity={0} toneMapped={false} side={DoubleSide} />
      </mesh>
      {/* a soft pool of light on the disc, under the book */}
      <mesh position={[0, 0.048, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[2.3, 2.3]} />
        <meshBasicMaterial ref={(m) => void (mats.current[1] = m)} map={glow} color="#9fdcff" transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {quality !== 'low' && <ContactShadows position={[0, 0.05, 0]} scale={2.8} blur={2.4} opacity={0.7} far={2.4} resolution={quality === 'high' ? 512 : 256} color="#000814" frames={Infinity} />}
    </group>
  );
}

/**
 * Moves each book's DOM label to where the book is on screen (labels show only in orbit mode).
 * Labels never pile up: nearer books (and the one under the pointer) win.
 */
function LabelProjector() {
  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const s = useU.getState();
    const orbitMode = s.mode === 'orbit';
    const items: { id: string; el: HTMLElement; x: number; y: number; z: number }[] = [];
    for (const [id, el] of labelEls) {
      const anchor = anchors.get(id);
      if (!anchor || !orbitMode) {
        el.style.opacity = '0';
        continue;
      }
      v.set(0, 1.55, 0);
      anchor.localToWorld(v);
      v.project(camera);
      if (!(v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1)) {
        el.style.opacity = '0';
        continue;
      }
      items.push({ id, el, x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height, z: s.hover === id ? -1 : v.z });
    }
    items.sort((a, b) => a.z - b.z);
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    for (const it of items) {
      const w = it.el.offsetWidth || 120;
      const h = it.el.offsetHeight || 22;
      const box = { l: it.x - w / 2 - 6, r: it.x + w / 2 + 6, t: it.y - h - 4, b: it.y + 4 };
      const clash = placed.some((p) => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t);
      it.el.style.opacity = clash ? '0' : '1';
      if (!clash) placed.push(box);
      it.el.style.transform = `translate(${it.x}px, ${it.y}px) translate(-50%, -100%)`;
    }
  });
  return null;
}

/**
 * Places the crisp HTML reading pages exactly over the open book's 3D pages. They show only when
 * the book faces you squarely (no tilt/rotation) and no page is turning — so the text is never
 * distorted; otherwise the textured 3D pages carry the scene.
 */
function ReadingProjector() {
  const v = useMemo(() => new Vector3(), []);
  const last = useRef({ shown: false });
  useFrame(({ camera, size }) => {
    const s = useU.getState();
    const els = readingEls;
    if (!els.root) return;
    const A = readingAnchor;
    const faceOn = Math.abs(view.yaw) < 0.004 && Math.abs(view.pitch) < 0.004 && view.tilt === 0 && !s.tilted;
    const show = s.mode === 'open' && !s.turn && !!A.group && A.open > 0.995 && faceOn;
    if (show !== last.current.shown) {
      last.current.shown = show;
      // hide instantly (a page starts turning), fade in gently
      els.root.style.transition = show ? 'opacity 180ms ease-out' : 'none';
      els.root.style.opacity = show ? '1' : '0';
    }
    if (!show || !A.group) return;
    const place = (el: HTMLElement | null, x0: number, x1: number, stack: number) => {
      if (!el) return;
      let l = Infinity;
      let r = -Infinity;
      let t = Infinity;
      let b = -Infinity;
      const z = -A.T + surf(0.5, stack, 1);
      for (const [x, y] of [
        [x0, A.H / 2],
        [x1, A.H / 2],
        [x0, -A.H / 2],
        [x1, -A.H / 2],
      ]) {
        v.set(x, y, z);
        A.group!.localToWorld(v);
        v.project(camera);
        const sx = ((v.x + 1) / 2) * size.width;
        const sy = ((1 - v.y) / 2) * size.height;
        l = Math.min(l, sx);
        r = Math.max(r, sx);
        t = Math.min(t, sy);
        b = Math.max(b, sy);
      }
      el.style.transform = `translate(${l.toFixed(2)}px, ${t.toFixed(2)}px)`;
      el.style.width = `${(r - l).toFixed(2)}px`;
      el.style.height = `${(b - t).toFixed(2)}px`;
      el.style.setProperty('--s', String((r - l) / 860));
    };
    place(els.left, -A.W, 0, A.TL);
    place(els.right, 0, A.W, A.TR);
  });
  return null;
}

/** Advances orbit time (scaled by the speed setting); slowed while a book is selected. */
function Clock() {
  useFrame((_, dt) => {
    const s = useU.getState();
    const k = s.mode === 'orbit' ? 1 : 0.35;
    clock.t += Math.min(dt, 0.1) * s.speed * k;
  });
  return null;
}

function OrbitRing({ orbit, id }: { orbit: Orbit; id: string }) {
  const points = useMemo(() => {
    const pts: Vector3[] = [];
    for (let i = 0; i <= 220; i++) {
      const o = { ...orbit, phase: orbit.phase + (i / 220) * Math.PI * 2 };
      pts.push(orbitPosition(o, 0, new Vector3()));
    }
    return pts;
  }, [orbit]);
  const lit = useU((s) => s.hover === id);
  const mode = useU((s) => s.mode);
  if (mode !== 'orbit') return null; // the gallery replaces the orbits once a book is selected
  return <Line points={points} color={lit ? '#bfeff2' : '#7fc9e0'} lineWidth={lit ? 1.2 : 0.7} transparent opacity={lit ? 0.45 : 0.1} dashed={!lit} dashSize={0.45} gapSize={0.55} />;
}

/**
 * Camera: free orbit (idle auto-rotation), the hero framing when a book is selected (with a
 * gentle pointer parallax and room for the information panel), the reading fit, and write mode.
 */
function CameraRig({ controls, deck }: { controls: React.RefObject<OrbitControlsImpl | null>; deck: number }) {
  const { camera, size, pointer } = useThree();
  const saved = useRef<{ pos: Vector3; target: Vector3 } | null>(null);
  const returning = useRef(false);
  const goal = useRef({ pos: new Vector3(), target: new Vector3() });
  const idle = useRef({ last: performance.now(), reset: 0 });

  useEffect(
    () =>
      useU.subscribe((s, prev) => {
        // (mid-way back from the Codex, keep the place you were before it opened)
        if (prev.mode === 'orbit' && s.mode !== 'orbit' && controls.current && !returning.current) {
          saved.current = { pos: camera.position.clone(), target: controls.current.target.clone() };
        }
        if (prev.mode !== 'orbit' && s.mode === 'orbit') returning.current = true;
        // the Codex: lean in towards the book at the centre, and back out when it closes
        if (!prev.codex && s.codex && s.mode === 'orbit' && controls.current) {
          saved.current = { pos: camera.position.clone(), target: controls.current.target.clone() };
        }
        if (prev.codex && !s.codex && s.mode === 'orbit') returning.current = true;
      }),
    [camera, controls],
  );
  useEffect(() => {
    const bump = () => (idle.current.last = performance.now());
    window.addEventListener('pointermove', bump);
    window.addEventListener('wheel', bump);
    window.addEventListener('keydown', bump);
    return () => {
      window.removeEventListener('pointermove', bump);
      window.removeEventListener('wheel', bump);
      window.removeEventListener('keydown', bump);
    };
  }, []);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const s = useU.getState();
    const g = goal.current;
    let active = true;
    let smooth = 0.9;
    const cam = camera as PerspectiveCamera;
    // reading uses a long lens: both pages the same size, text without perspective
    const fov = s.mode === 'open' ? 18 : 40;
    if (Math.abs(cam.fov - fov) > 0.01) {
      easing.damp(cam, 'fov', fov, 0.35, dt);
      cam.updateProjectionMatrix();
    }
    const tanHalf = Math.tan((cam.fov * Math.PI) / 360);

    // "reset camera" from the HUD
    if (cameraCmd.reset !== idle.current.reset) {
      idle.current.reset = cameraCmd.reset;
      if (s.mode === 'orbit') {
        saved.current = { pos: ORBIT_HOME.clone(), target: new Vector3() };
        returning.current = true;
      }
    }

    if (s.mode === 'carousel') {
      // hero framed slightly right of centre (the information panel sits on the left)
      const dist = 7.4;
      const wpp = (2 * dist * tanHalf) / size.height;
      const panel = size.width >= 900 ? Math.min(420, size.width * 0.3) : 0;
      const shiftX = (panel / 2) * wpp;
      g.target.set(-shiftX + pointer.x * 0.25, HERO_Y + 0.05 + pointer.y * 0.12, deck);
      g.pos.set(-shiftX + pointer.x * 0.9, HERO_Y + 0.75 + pointer.y * 0.35, deck + dist);
      smooth = 0.8;
    } else if (s.mode === 'open') {
      const d = dimsOf(focusedBook());
      const fr = readingFrame(size.width, size.height, d, s.focusMode);
      const ppu = fr.ppu * view.zoom; // px per world unit at the book
      const dist = size.height / (2 * tanHalf * ppu);
      view.worldPerPx = 1 / ppu;
      // pan limits: never lose the page entirely
      const mx = (d.W + 0.05) * (1 - 1 / view.zoom);
      const my = (d.H / 2 + 0.05) * (1 - 1 / view.zoom);
      view.panX = Math.max(-mx, Math.min(mx, view.panX));
      view.panY = Math.max(-my, Math.min(my, view.panY));
      const p = openPose(deck).pos;
      // put the spread's centre at the centre of the free area (left of the tool rail)
      const tx = p.x - (fr.cx - size.width / 2) / ppu + view.panX;
      const ty = p.y + (fr.cy - size.height / 2) / ppu + view.panY;
      g.target.set(tx, ty, p.z);
      g.pos.set(tx, ty, p.z + dist);
      smooth = 0.42;
    } else if (s.mode === 'write') {
      const p = openPose(deck).pos;
      const { W } = dimsOf(focusedBook());
      const x = s.write?.side === 'back' ? -W / 2 : W / 2;
      g.pos.set(p.x + x, p.y, p.z + 1.75);
      g.target.set(p.x + x, p.y, p.z);
      smooth = 0.55;
    } else if (s.codex) {
      // a three-quarter view of the Codex from just above its pages, whichever side you were on
      const from = saved.current?.pos ?? ORBIT_HOME;
      const a = Math.atan2(from.x, from.z);
      g.pos.set(Math.sin(a) * 10.5, 4.2, Math.cos(a) * 10.5);
      g.target.set(0, 0.3, 0);
      smooth = 0.9;
    } else if (returning.current && saved.current) {
      g.pos.copy(saved.current.pos);
      g.target.copy(saved.current.target);
      smooth = 1.0;
      if (camera.position.distanceTo(g.pos) < 0.25) returning.current = false;
    } else {
      active = false;
    }

    c.enabled = !active;
    // idle: a slow drift around the Codex after 12 s without input
    c.autoRotate = !active && performance.now() - idle.current.last > 12000;
    c.autoRotateSpeed = 0.25;
    if (active) {
      easing.damp3(camera.position, g.pos, smooth, dt);
      easing.damp3(c.target, g.target, smooth, dt);
      camera.lookAt(c.target);
    }
  });
  return null;
}

/**
 * Reading controls on the canvas: the wheel zooms towards the cursor; dragging the empty space
 * around the open book rotates it a little, to look at it as an object.
 */
function ReadingInput() {
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      if (useU.getState().mode !== 'open') return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const ax = (e.clientX - r.left - r.width / 2) * view.worldPerPx;
      const ay = -(e.clientY - r.top - r.height / 2) * view.worldPerPx;
      setZoom(view.zoom * Math.exp(-e.deltaY * 0.0016), { x: ax, y: ay });
    };
    let rot: { x: number; y: number; yaw: number; pitch: number; t: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (useU.getState().mode !== 'open' || e.button !== 0) return;
      rot = { x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch, t: e.timeStamp };
    };
    const onMove = (e: PointerEvent) => {
      if (!rot || useU.getState().turn) return;
      if (view.pageDownAt === rot.t) {
        rot = null;
        return;
      }
      view.yaw = Math.max(-0.7, Math.min(0.7, rot.yaw + (e.clientX - rot.x) * 0.004));
      view.pitch = Math.max(-0.5, Math.min(0.35, rot.pitch + (e.clientY - rot.y) * 0.003));
    };
    const onUp = () => (rot = null);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gl]);
  return null;
}
