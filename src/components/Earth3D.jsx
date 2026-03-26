import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

const DAY_TEXTURE   = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
const NIGHT_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-night.jpg'

// ── Rotation ──────────────────────────────────────────────────────────────────
// Dans Three.js SphereGeometry, le UV mapping place :
//   lon=-180 → u=0 → theta=0 → vertex en (1,0,0) +X
//   lon=  0° → u=0.5 → theta=π → vertex en (-1,0,0) -X
//   lat= 90° (nord) → v=0 → phi=0 → vertex en (0,1,0) +Y
// La caméra est en +Z → on veut que le point (lat,lon) face +Z.
function latLonToQuat(lat, lon) {
  const phi   = THREE.MathUtils.degToRad(90 - lat)   // 0=nord, π=sud
  const theta = THREE.MathUtils.degToRad(lon + 180)  // UV offset Three.js

  const point = new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ).normalize()

  const q = new THREE.Quaternion()
  q.setFromUnitVectors(point, new THREE.Vector3(0, 0, 1))
  return q
}

export default function Earth3D({ lat = 48.8, lon = 2.3, onRegionClick, regionLabel }) {
  const mountRef   = useRef(null)
  const [loaded, setLoaded] = useState(false)

  // Refs partagés avec la boucle d'animation
  const targetQuatRef    = useRef(latLonToQuat(lat, lon))
  const earthGroupRef    = useRef(null)
  const autoRotateRef    = useRef(false)   // off jusqu'au 1er chargement
  const autoTimerRef     = useRef(null)

  // ── Quand lat/lon change : nouvelle cible + pause auto-rotate ──────────────
  useEffect(() => {
    targetQuatRef.current = latLonToQuat(lat, lon)
    autoRotateRef.current = false
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    autoTimerRef.current = setTimeout(() => { autoRotateRef.current = true }, 4500)
  }, [lat, lon])

  // ── Three.js scene ─────────────────────────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    const W = container.clientWidth || 204
    const H = container.clientHeight || 204

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W, H)
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    // Scene + Camera
    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100)
    camera.position.z = 2.6

    // ── Lumières : ambient fort + soleil doux = pas d'ombres dures ────────────
    scene.add(new THREE.AmbientLight(0xffffff, 1.4))          // éclairage global uniforme

    const sun = new THREE.DirectionalLight(0xfff5dd, 0.7)     // soleil doux depuis l'avant-droite
    sun.position.set(4, 2, 6)
    scene.add(sun)

    const rim = new THREE.DirectionalLight(0x8ab4f8, 0.25)    // rimlight bleu subtil
    rim.position.set(-3, 0, -2)
    scene.add(rim)

    // ── Globe ─────────────────────────────────────────────────────────────────
    const geo        = new THREE.SphereGeometry(1, 72, 72)
    const earthGroup = new THREE.Group()
    scene.add(earthGroup)
    earthGroupRef.current = earthGroup

    // Positionner immédiatement sur la région par défaut
    earthGroup.quaternion.copy(targetQuatRef.current)

    const loader = new THREE.TextureLoader()
    loader.crossOrigin = 'anonymous'

    loader.load(DAY_TEXTURE, (dayTex) => {
      // MeshStandardMaterial = pas de reflets bizarres, belle apparence
      const mat = new THREE.MeshStandardMaterial({
        map:       dayTex,
        roughness: 0.9,
        metalness: 0.0,
      })
      const earth = new THREE.Mesh(geo, mat)
      earthGroup.add(earth)

      // Atmosphère
      const atmGeo = new THREE.SphereGeometry(1.055, 64, 64)
      const atmMat = new THREE.MeshStandardMaterial({
        color:       0x4488ff,
        transparent: true,
        opacity:     0.06,
        side:        THREE.FrontSide,
        depthWrite:  false,
      })
      scene.add(new THREE.Mesh(atmGeo, atmMat))

      setLoaded(true)
      // Démarre l'auto-rotate 3s après le chargement
      autoTimerRef.current = setTimeout(() => { autoRotateRef.current = true }, 3000)
    })

    // ── Boucle d'animation ────────────────────────────────────────────────────
    const AXIS_Y     = new THREE.Vector3(0, 1, 0)
    const ROT_SPEED  = 0.0006   // rad/frame
    let rafId

    const animate = () => {
      rafId = requestAnimationFrame(animate)

      const eg = earthGroupRef.current
      if (eg) {
        // Interpolation slerp vers la cible
        eg.quaternion.slerp(targetQuatRef.current, 0.05)

        // Auto-rotation lente autour de Y
        if (autoRotateRef.current) {
          const delta = new THREE.Quaternion().setFromAxisAngle(AXIS_Y, ROT_SPEED)
          targetQuatRef.current.multiply(delta)
        }
      }

      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(rafId)
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
      renderer.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="relative mx-auto" style={{ width: 220, height: 220 }}>

      {/* Halo doré externe */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none animate-globe-pulse"
        style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.18) 0%, transparent 68%)' }}
      />

      {/* Anneau orbite */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ inset: -8, border: '1px solid rgba(212,175,55,0.12)', borderRadius: '50%' }}
      />

      {/* Canvas */}
      <div
        ref={mountRef}
        className="absolute rounded-full overflow-hidden"
        style={{
          inset: 8,
          boxShadow: '0 0 60px rgba(30,80,255,0.2), 0 0 25px rgba(212,175,55,0.1)',
        }}
      />

      {/* Spinner */}
      {!loaded && (
        <div
          className="absolute rounded-full flex flex-col items-center justify-center gap-2 z-10"
          style={{ inset: 8, background: 'rgba(4,6,18,0.95)' }}
        >
          <div className="w-7 h-7 border-2 border-[#d4af37]/20 border-t-[#d4af37] rounded-full animate-spin" />
          <p className="text-[10px] text-gray-600 tracking-widest uppercase">Chargement</p>
        </div>
      )}

      {/* Badge région */}
      <div className="absolute -bottom-3 left-0 right-0 text-center z-10">
        <button
          onClick={onRegionClick}
          className="inline-flex items-center gap-1.5 text-xs text-[#d4af37] bg-[#0d0d0d]/90 backdrop-blur-sm px-3 py-1.5 rounded-full border border-[#d4af37]/20 hover:border-[#d4af37]/50 hover:bg-[#1a1a1a] transition-all duration-300 active:scale-95"
        >
          <span>📍</span>
          <span>{regionLabel}</span>
          <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
