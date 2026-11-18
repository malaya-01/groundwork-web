'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import { AdditiveBlending, Color, type Mesh } from 'three';
import { glowTexture, sunTexture } from './textures';

/** The celestial body at the centre: the engine everything orbits. */
export function Sun() {
  const surface = useRef<Mesh>(null);
  const corona = useRef<Mesh>(null);
  const map = useMemo(() => sunTexture(), []);
  const glow = useMemo(() => glowTexture(), []);
  const hot = useMemo(() => new Color(1.7, 1.25, 0.75), []);

  useFrame((state, dt) => {
    if (surface.current) surface.current.rotation.y += dt * 0.035;
    if (corona.current) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 0.8) * 0.02;
      corona.current.scale.setScalar(s);
    }
  });

  return (
    <group>
      <mesh ref={surface}>
        <sphereGeometry args={[3, 96, 96]} />
        <meshBasicMaterial map={map} color={hot} toneMapped={false} />
      </mesh>
      <mesh ref={corona}>
        <sphereGeometry args={[3.25, 64, 64]} />
        <meshBasicMaterial color="#ffb347" transparent opacity={0.12} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <sprite scale={[17, 17, 1]}>
        <spriteMaterial map={glow} color="#ffc061" transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <sprite scale={[42, 42, 1]}>
        <spriteMaterial map={glow} color="#ff7a1a" transparent opacity={0.28} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>
      <pointLight color="#ffe0b0" intensity={2.4} distance={0} decay={0} />
      <Sparkles count={80} scale={11} size={4} speed={0.35} color="#ffb347" opacity={0.7} />
    </group>
  );
}
