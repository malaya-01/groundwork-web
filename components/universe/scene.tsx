'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls, Stars } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { easing } from 'maath';
import { Vector3 } from 'three';

type OrbitControlsImpl = React.ComponentRef<typeof OrbitControls>;
import { BOOK, anchors, clock, deckZ, labelEls, orbitFor, orbitPosition, useU, type Orbit } from '@/lib/universe';
import { Sun } from './sun';
import { Book3D, openPose } from './book3d';

export default function Scene() {
  const bloom = useU((s) => s.bloom);
  return (
    <Canvas
      camera={{ position: [0, 22, 52], fov: 45, near: 0.05, far: 2000 }}
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => useU.getState().set({ hover: null })}
    >
      <color attach="background" args={['#02030a']} />
      <fog attach="fog" args={['#02030a', 140, 420]} />
      <ambientLight intensity={0.22} />
      <hemisphereLight args={['#9fc6ff', '#1a1208', 0.35]} />
      <Universe />
      {bloom && (
        <EffectComposer>
          <Bloom mipmapBlur intensity={1.05} luminanceThreshold={0.92} luminanceSmoothing={0.2} />
          <Vignette eskil={false} offset={0.25} darkness={0.75} />
        </EffectComposer>
      )}
    </Canvas>
  );
}

function Universe() {
  const books = useU((s) => s.books);
  const showOrbits = useU((s) => s.showOrbits);
  const sorted = useMemo(() => [...books].sort((a, b) => a.year - b.year), [books]);
  const orbits = useMemo(() => sorted.map((b, i) => orbitFor(i, b.year)), [sorted]);
  const deck = deckZ(sorted.length);
  const controls = useRef<OrbitControlsImpl>(null);

  return (
    <>
      <Clock />
      <Stars radius={260} depth={90} count={7000} factor={5} saturation={0.15} fade speed={0.6} />
      <Stars radius={120} depth={40} count={1500} factor={2.5} saturation={0.6} fade speed={1.2} />
      <Sun />
      {/* key light on the deck so books facing you are readable (the sun is behind them) */}
      <directionalLight position={[2, 6, deck + 16]} intensity={1.6} color="#fff6e8" />
      {showOrbits && orbits.map((o, i) => <OrbitRing key={sorted[i].year} orbit={o} year={sorted[i].year} />)}
      {sorted.map((b, i) => (
        <Book3D key={b.year} info={b} index={i} total={sorted.length} orbit={orbits[i]} />
      ))}
      <LabelProjector />
      <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={0.06} minDistance={8} maxDistance={260} rotateSpeed={0.5} />
      <CameraRig controls={controls} deck={deck} />
    </>
  );
}

/** Moves each book's DOM label to where the book is on screen (labels show only in orbit mode). */
function LabelProjector() {
  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const orbitMode = useU.getState().mode === 'orbit';
    for (const [year, el] of labelEls) {
      const anchor = anchors.get(year);
      if (!anchor || !orbitMode) {
        el.style.opacity = '0';
        continue;
      }
      v.set(0, BOOK.H / 2 + 0.5, 0);
      anchor.localToWorld(v);
      v.project(camera);
      const onScreen = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.style.opacity = onScreen ? '1' : '0';
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -100%)`;
    }
  });
  return null;
}

/** Advances orbit time (scaled by the speed setting); paused while you read or write. */
function Clock() {
  useFrame((_, dt) => {
    const s = useU.getState();
    const k = s.mode === 'orbit' ? 1 : 0.35;
    clock.t += Math.min(dt, 0.1) * s.speed * k;
  });
  return null;
}

function OrbitRing({ orbit, year }: { orbit: Orbit; year: number }) {
  const points = useMemo(() => {
    const pts: Vector3[] = [];
    const save = orbit.phase;
    for (let i = 0; i <= 160; i++) {
      const o = { ...orbit, phase: save + (i / 160) * Math.PI * 2 };
      pts.push(orbitPosition(o, 0, new Vector3()));
    }
    return pts;
  }, [orbit]);
  const lit = useU((s) => s.hover === year || s.focus === year);
  const mode = useU((s) => s.mode);
  return (
    <Line
      points={points}
      color={lit ? '#9ff6ff' : '#4fd8f0'}
      lineWidth={lit ? 1.6 : 1}
      transparent
      opacity={mode === 'orbit' ? (lit ? 0.75 : 0.22) : 0.08}
      dashed={!lit}
      dashSize={0.6}
      gapSize={0.35}
    />
  );
}

/**
 * Moves the camera between "free look" (orbit controls), the deck (carousel), the open book,
 * and close-up on a page (write). Remembers where you were so it can fly you back.
 */
function CameraRig({ controls, deck }: { controls: React.RefObject<OrbitControlsImpl | null>; deck: number }) {
  const { camera } = useThree();
  const saved = useRef<{ pos: Vector3; target: Vector3 } | null>(null);
  const returning = useRef(false);
  const goal = useRef({ pos: new Vector3(), target: new Vector3() });

  useEffect(
    () =>
      useU.subscribe((s, prev) => {
        if (prev.mode === 'orbit' && s.mode !== 'orbit' && controls.current) {
          saved.current = { pos: camera.position.clone(), target: controls.current.target.clone() };
        }
        if (prev.mode !== 'orbit' && s.mode === 'orbit') returning.current = true;
      }),
    [camera, controls],
  );

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const s = useU.getState();
    const g = goal.current;
    let active = true;
    let smooth = 0.9;

    if (s.mode === 'carousel') {
      g.pos.set(0, 1.5, deck + 10.5);
      g.target.set(0, 0.55, deck);
    } else if (s.mode === 'open') {
      const p = openPose(deck).pos;
      g.pos.set(p.x, p.y + 0.25, p.z + 4.6);
      g.target.copy(p);
      smooth = 0.8;
    } else if (s.mode === 'write') {
      const p = openPose(deck).pos;
      const x = s.write?.side === 'back' ? -BOOK.W / 2 : BOOK.W / 2;
      g.pos.set(p.x + x, p.y, p.z + 1.75);
      g.target.set(p.x + x, p.y, p.z);
      smooth = 0.55;
    } else if (returning.current && saved.current) {
      g.pos.copy(saved.current.pos);
      g.target.copy(saved.current.target);
      smooth = 1.0;
      if (camera.position.distanceTo(g.pos) < 0.25) returning.current = false;
    } else {
      active = false;
    }

    c.enabled = !active;
    if (active) {
      easing.damp3(camera.position, g.pos, smooth, dt);
      easing.damp3(c.target, g.target, smooth, dt);
      camera.lookAt(c.target);
    }
  });
  return null;
}
