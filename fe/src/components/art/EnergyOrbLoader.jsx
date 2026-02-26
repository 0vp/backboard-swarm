import { memo, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { MeshDistortMaterial } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three'

const innerVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const innerFragmentShader = `
uniform float uTime;
uniform vec3 uColor;

varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  float waveA = sin((vPosition.x + uTime * 0.7) * 8.0);
  float waveB = sin((vPosition.y - uTime * 0.55) * 9.0);
  float waveC = sin((vPosition.z + uTime * 0.9) * 7.0);
  float plasma = (waveA + waveB + waveC) / 3.0;
  float energy = 0.5 + 0.5 * plasma;

  vec3 viewDir = normalize(vec3(0.0, 0.0, 1.0));
  float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.2);

  vec3 low = uColor * 0.32;
  vec3 high = uColor * 1.28;
  vec3 color = mix(low, high, energy) + fresnel * (uColor * 0.75);

  float alpha = 0.26 + energy * 0.24 + fresnel * 0.22;
  gl_FragColor = vec4(color, alpha);
}
`

const OrbCore = memo(function OrbCore({ color, speed }) {
  const groupRef = useRef(null)
  const innerMaterialRef = useRef(null)

  const baseColor = useMemo(() => new THREE.Color(color), [color])
  const emissive = useMemo(() => new THREE.Color(color).multiplyScalar(0.75), [color])

  useFrame(({ clock }, delta) => {
    const group = groupRef.current
    const mat = innerMaterialRef.current
    if (!group || !mat) return

    const t = clock.getElapsedTime() * speed
    mat.uniforms.uTime.value = t

    group.rotation.y += delta * 0.26 * speed

    const pulse = 1 + Math.sin(t * 1.35) * 0.045
    group.scale.setScalar(pulse)
  })

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[1, 128, 128]} />
        <MeshDistortMaterial
          color={baseColor}
          emissive={emissive}
          emissiveIntensity={1.15}
          roughness={0.08}
          metalness={0.15}
          distort={0.36}
          speed={1.2 * speed}
          transparent
          opacity={0.88}
        />
      </mesh>

      <mesh scale={0.78}>
        <sphereGeometry args={[1, 96, 96]} />
        <shaderMaterial
          ref={innerMaterialRef}
          vertexShader={innerVertexShader}
          fragmentShader={innerFragmentShader}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{
            uTime: { value: 0 },
            uColor: { value: baseColor.clone().multiplyScalar(1.1) }
          }}
        />
      </mesh>
    </group>
  )
})

const EnergyOrbLoader = memo(function EnergyOrbLoader({
  size = 200,
  color = '#4F8DFF',
  speed = 1,
  active = true,
  className = ''
}) {
  const resolvedSize = typeof size === 'number' ? `${size}px` : size

  return (
    <div
      className={className}
      style={{
        width: resolvedSize,
        height: resolvedSize,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto'
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          opacity: active ? 1 : 0,
          transition: 'opacity 260ms ease-in-out',
          willChange: 'opacity'
        }}
      >
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [0, 0, 3.2], fov: 45 }}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          style={{ background: 'transparent' }}
        >
          <ambientLight intensity={0.2} color={color} />
          <pointLight position={[2, 2, 3]} intensity={1.35} color={color} />

          <OrbCore color={color} speed={speed} />

          <EffectComposer multisampling={0}>
            <Bloom
              intensity={1.45}
              luminanceThreshold={0.06}
              luminanceSmoothing={0.38}
              mipmapBlur
              radius={0.72}
            />
          </EffectComposer>
        </Canvas>
      </div>
    </div>
  )
})

export default EnergyOrbLoader
