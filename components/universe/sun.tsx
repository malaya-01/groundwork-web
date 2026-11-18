'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { easing } from 'maath';
import { AdditiveBlending, Color, type Group, type MeshBasicMaterial, type SpriteMaterial } from 'three';
import { useU } from '@/lib/universe';
import { glowTexture, sunTexture } from './textures';

/**
 * The star at the centre: the engine everything orbits. A soft amber with a quiet corona.
 * It recedes when a book is selected and vanishes while you read: it never outshines the pages.
 */
export function Sun() {
  const group = useRef<Group>(null);
  const surface = useRef<MeshBasicMaterial>(null);
  const corona = useRef<MeshBasicMaterial>(null);
  const inner = useRef<SpriteMaterial>(null);
  const outer = useRef<SpriteMaterial>(null);
  const map = useMemo(() => sunTexture(), []);
  const glow = useMemo(() => glowTexture(), []);
  const warm = useMemo(() => new Color(1.05, 0.82, 0.58), []);
  const level = useRef({ v: 1 });

  useFrame((state, dt) => {
    const m = useU.getState().mode;
    easing.damp(level.current, 'v', m === 'orbit' ? 1 : 0, 0.45, dt);
    const v = level.current.v;
    if (group.current) {
      group.current.visible = v > 0.02;
      group.current.rotation.y += dt * 0.03;
    }
    if (surface.current) surface.current.color.copy(warm).multiplyScalar(v);
    if (corona.current) corona.current.opacity = 0.07 * v * (1 + Math.sin(state.clock.elapsedTime * 0.7) * 0.15);
    if (inner.current) inner.current.opacity = 0.45 * v;
    if (outer.current) outer.current.opacity = 0.12 * v;
  });

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[3, 96, 96]} />
        <meshBasicMaterial ref={surface} map={map} color={warm} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[3.2, 64, 64]} />
        <meshBasicMaterial ref={corona} color="#f0b46a" transparent opacity={0.07} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <sprite scale={[13, 13, 1]}>
        <spriteMaterial ref={inner} map={glow} color="#f2c27a" transparent opacity={0.45} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <sprite scale={[32, 32, 1]}>
        <spriteMaterial ref={outer} map={glow} color="#d98a3a" transparent opacity={0.12} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <pointLight color="#ffe2b8" intensity={1.6} distance={0} decay={0} />
    </group>
  );
}
