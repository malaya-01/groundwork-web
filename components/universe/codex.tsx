'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { easing } from 'maath';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  type Group,
  type InstancedMesh,
  type SpriteMaterial,
} from 'three';
import { openCodex, sortBooks, useU, type Quality } from '@/lib/universe';
import { glowTexture } from './textures';

/**
 * The Codex: the book at the centre of the universe, which every other book orbits.
 * Its pages fan out a full 360° around a vertical spine, like a book opened all the way round,
 * with no covers (its pages never end), and every book in orbit has its own page in the ring (marked with that book's colour on its
 * edge). Click it to read it: it is the encyclopedia of your universe.
 *
 * Built as one instanced mesh of curved pages (one draw call). The pages ripple in a slow wave
 * that travels round the ring, and glow where they meet the spine, so the core reads as the light.
 */

const R0 = 0.42; // where pages meet the spine
const R1 = 3.0; // outer edge of the pages
const H = 4.6; // page height
const CURL = 0.6; // how far each page sweeps round (radians at the outer edge): the pinwheel
// few enough that the leaves read as leaves, not a solid drum
const PAGES: Record<Quality, number> = { high: 260, balanced: 200, low: 130 };
const PARCHMENT = '#efe2c4';
const GLOW = new Color('#ffd79a');

/** One curved page: a strip from the spine out to the edge, sweeping round as it goes. */
function pageGeometry(segU = 28) {
  const g = new BufferGeometry();
  const pos: number[] = [];
  const u: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segU; i++) {
    const t = i / segU;
    const r = R0 + t * (R1 - R0);
    const a = CURL * Math.pow(t, 1.6);
    // outer corners rounded off a little, like a well-thumbed book
    const h = (H / 2) * (1 - 0.05 * Math.pow(t, 6));
    for (const y of [-h, h]) {
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      u.push(t);
    }
  }
  for (let i = 0; i < segU; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aU', new BufferAttribute(new Float32Array(u), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Shared uniforms (updated every frame). */
function makeUniforms() {
  return { uTime: { value: 0 }, uLevel: { value: 1 }, uOpen: { value: 0 }, uGlow: { value: GLOW.clone() } };
}
type Uniforms = ReturnType<typeof makeUniforms>;

/**
 * Paper that glows towards the spine, ripples round the ring, and shows each book's colour on
 * the outer edge of its page.
 */
function pageMaterial(uniforms: Uniforms) {
  const m = new MeshStandardMaterial({ color: PARCHMENT, roughness: 0.82, metalness: 0, side: DoubleSide, envMapIntensity: 0.6 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
attribute float aU;
attribute float aPhase;
attribute vec4 aAccent;
uniform float uTime;
uniform float uOpen;
varying float vU;
varying float vPhase;
varying vec4 vAccent;
mat2 cxRot() {
  // a wave travelling round the ring: each page leans a little as it passes
  float wave = sin(uTime * 0.85 - aPhase * 6.2831853 * 3.0);
  float flick = sin(uTime * 2.3 + aPhase * 97.0) * 0.25;
  float ang = (0.05 + 0.08 * uOpen) * aU * (wave + flick);
  float c = cos(ang);
  float s = sin(ang);
  return mat2(c, s, -s, c);
}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `vec3 objectNormal = vec3(normal);
mat2 cxR = cxRot();
objectNormal.xz = cxR * objectNormal.xz;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `vec3 transformed = vec3(position);
transformed.xz = cxR * transformed.xz;
// a book's own page stands slightly proud of the others, like a thumb-index tab
transformed.xz *= 1.0 + 0.055 * aAccent.w * smoothstep(0.55, 1.0, aU);
vU = aU;
vPhase = aPhase;
vAccent = aAccent;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
uniform float uLevel;
uniform vec3 uGlow;
varying float vU;
varying float vPhase;
varying vec4 vAccent;`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
float cxTab = vAccent.w * smoothstep(0.8, 0.96, vU);
diffuseColor.rgb = mix(diffuseColor.rgb, vAccent.rgb, cxTab);
// every leaf a slightly different tone of paper, and a fine dark fore-edge, so the fan reads as leaves
float cxTone = 0.8 + 0.22 * fract(sin(vPhase * 7919.0) * 43758.5453);
diffuseColor.rgb *= mix(cxTone, 1.0, cxTab);
diffuseColor.rgb *= 1.0 - 0.45 * smoothstep(0.975, 1.0, vU);
// shadow deep in the fan, where little light reaches between the leaves
diffuseColor.rgb *= 0.55 + 0.45 * smoothstep(0.0, 0.5, vU);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
float cxCore = pow(1.0 - vU, 5.0);
totalEmissiveRadiance += uGlow * (cxCore * 1.8 + 0.1 * cxTone) * uLevel;
totalEmissiveRadiance += vAccent.rgb * cxTab * 0.55 * uLevel;`,
      );
  };
  return m;
}

/** Hex colour → linear RGB (the shader mixes in linear space). */
const linear = (hex: string) => new Color(hex);

export function Codex() {
  const books = useU((s) => s.books);
  const quality = useU((s) => s.quality);
  const n = PAGES[quality];
  const group = useRef<Group>(null);
  const mesh = useRef<InstancedMesh>(null);
  const inner = useRef<SpriteMaterial>(null);
  const outer = useRef<SpriteMaterial>(null);
  const hovered = useRef(false);
  const level = useRef({ v: 1, hover: 0, open: 0 });
  const glow = useMemo(() => glowTexture(), []);
  const uniforms = useMemo(makeUniforms, []);
  const material = useMemo(() => pageMaterial(uniforms), [uniforms]);

  // one geometry per page count: the instance attributes live on it
  const geometry = useMemo(() => {
    const g = pageGeometry();
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) phase[i] = i / n;
    g.setAttribute('aPhase', new InstancedBufferAttribute(phase, 1));
    g.setAttribute('aAccent', new InstancedBufferAttribute(new Float32Array(n * 4), 4));
    return g;
  }, [n]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  // fan the pages round the spine
  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const mat = new Matrix4();
    for (let i = 0; i < n; i++) {
      mat.makeRotationY((i / n) * Math.PI * 2 + 0.004);
      m.setMatrixAt(i, mat);
    }
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [n, geometry]);

  // every book in orbit owns a page, evenly spaced round the ring, edged in its colour
  useEffect(() => {
    const attr = geometry.getAttribute('aAccent') as InstancedBufferAttribute;
    const arr = attr.array as Float32Array;
    arr.fill(0);
    const sorted = sortBooks(books);
    sorted.forEach((b, k) => {
      const i = Math.min(n - 1, Math.floor(((k + 0.5) / Math.max(1, sorted.length)) * n));
      const c = linear(b.accent);
      arr.set([c.r, c.g, c.b, 1], i * 4);
    });
    attr.needsUpdate = true;
  }, [books, n, geometry]);

  useFrame((state, dt) => {
    const s = useU.getState();
    const l = level.current;
    easing.damp(l, 'v', s.mode === 'orbit' ? 1 : 0, 0.45, dt);
    easing.damp(l, 'hover', hovered.current && s.mode === 'orbit' && !s.codex ? 1 : 0, 0.2, dt);
    easing.damp(l, 'open', s.codex === 'in' ? 1 : 0, 0.5, dt);
    const v = l.v;
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uLevel.value = v * (1 + 0.35 * l.hover + 0.3 * l.open);
    uniforms.uOpen.value = Math.max(l.hover * 0.5, l.open);
    if (group.current) {
      group.current.visible = v > 0.02;
      group.current.rotation.y += dt * (0.045 + 0.1 * l.open);
      group.current.scale.setScalar(0.75 + 0.25 * v + 0.03 * l.hover);
    }
    if (inner.current) inner.current.opacity = (0.16 + 0.1 * l.hover) * v;
    if (outer.current) outer.current.opacity = 0.07 * v;
  });

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (useU.getState().mode !== 'orbit') return;
    hovered.current = true;
    document.body.style.cursor = 'pointer';
  };
  const out = () => {
    if (!hovered.current) return;
    hovered.current = false;
    document.body.style.cursor = '';
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (useU.getState().mode !== 'orbit') return;
    e.stopPropagation();
    out();
    openCodex();
  };

  return (
    <group ref={group}>
      {/* the leaves */}
      <instancedMesh ref={mesh} args={[geometry, material, n]} raycast={() => null} frustumCulled={false} />
      {/* the spine: dark leather with gold bands */}
      <mesh raycast={() => null}>
        <cylinderGeometry args={[R0 * 0.88, R0 * 0.88, H * 1.04, 48]} />
        <meshPhysicalMaterial color="#3b2414" roughness={0.55} clearcoat={0.4} clearcoatRoughness={0.5} />
      </mesh>
      {[-1, -0.33, 0.33, 1].map((k) => (
        <mesh key={k} position={[0, (k * H * 1.04) / 2, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <torusGeometry args={[R0 * 0.9, 0.035, 12, 64]} />
          <meshPhysicalMaterial color="#d8b46a" metalness={1} roughness={0.28} envMapIntensity={1.5} />
        </mesh>
      ))}
      {/* the light at the heart of the book */}
      <sprite scale={[8, 8, 1]} raycast={() => null}>
        <spriteMaterial ref={inner} map={glow} color="#f6d9a2" transparent opacity={0.3} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <sprite scale={[26, 26, 1]} raycast={() => null}>
        <spriteMaterial ref={outer} map={glow} color="#d9a45a" transparent opacity={0.09} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <pointLight color="#ffe2b8" intensity={1.6} distance={0} decay={0} />
      {/* an invisible drum to click: cheaper than testing hundreds of pages */}
      <mesh onPointerOver={over} onPointerOut={out} onClick={click}>
        <cylinderGeometry args={[R1, R1, H, 32]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  );
}
