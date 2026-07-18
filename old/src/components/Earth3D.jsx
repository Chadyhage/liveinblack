import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

const DAY_TEXTURE   = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
const NIGHT_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-night.jpg'

function latLonToQuat(lat, lon) {
  const phi   = THREE.MathUtils.degToRad(90 - lat)
  const theta = THREE.MathUtils.degToRad(lon + 180)
  const point = new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ).normalize()
  const q = new THREE.Quaternion()
  q.setFromUnitVectors(point, new THREE.Vector3(0, 0, 1))
  return q
}

export default function Earth3D({ lat = 48.8, lon = 2.3, onRegionClick, regionLabel, nightMode = false, showBadge = true }) {
  const mountRef      = useRef(null)
  const [loaded, setLoaded] = useState(false)

  const targetQuatRef  = useRef(latLonToQuat(lat, lon))
  const earthGroupRef  = useRef(null)
  const autoRotateRef  = useRef(false)
  const autoTimerRef   = useRef(null)
  const lightsRef      = useRef({ ambient: null, sun: null, rim: null })
  const materialRef    = useRef(null)

  useEffect(() => {
    targetQuatRef.current = latLonToQuat(lat, lon)
    autoRotateRef.current = false
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    autoTimerRef.current = setTimeout(() => { autoRotateRef.current = true }, 4500)
  }, [lat, lon])

  // Update lighting & texture when nightMode changes
  useEffect(() => {
    const { ambient, sun, rim } = lightsRef.current
    if (ambient) {
      if (nightMode) {
        ambient.intensity = 0.12
        ambient.color.set(0x101830)
        sun.intensity = 0.06
        sun.color.set(0x7788bb)
        rim.intensity = 0.0
      } else {
        ambient.intensity = 1.4
        ambient.color.set(0xffffff)
        sun.intensity = 0.7
        sun.color.set(0xfff5dd)
        rim.intensity = 0.25
      }
    }
    if (materialRef.current) {
      const loader = new THREE.TextureLoader()
      loader.crossOrigin = 'anonymous'
      loader.load(nightMode ? NIGHT_TEXTURE : DAY_TEXTURE, (tex) => {
        materialRef.current.map = tex
        materialRef.current.needsUpdate = true
      })
    }
  }, [nightMode])

  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    const W = container.clientWidth  || 204
    const H = container.clientHeight || 204

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W, H)
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100)
    camera.position.z = 2.6

    const ambient = new THREE.AmbientLight(
      nightMode ? 0x101830 : 0xffffff,
      nightMode ? 0.12 : 1.4
    )
    scene.add(ambient)

    const sun = new THREE.DirectionalLight(
      nightMode ? 0x7788bb : 0xfff5dd,
      nightMode ? 0.06 : 0.7
    )
    sun.position.set(4, 2, 6)
    scene.add(sun)

    const rim = new THREE.DirectionalLight(0x8ab4f8, nightMode ? 0.0 : 0.25)
    rim.position.set(-3, 0, -2)
    scene.add(rim)

    lightsRef.current = { ambient, sun, rim }

    const geo        = new THREE.SphereGeometry(1, 72, 72)
    const earthGroup = new THREE.Group()
    scene.add(earthGroup)
    earthGroupRef.current = earthGroup
    earthGroup.quaternion.copy(targetQuatRef.current)

    const loader = new THREE.TextureLoader()
    loader.crossOrigin = 'anonymous'

    loader.load(nightMode ? NIGHT_TEXTURE : DAY_TEXTURE, (tex) => {
      const mat = new THREE.MeshStandardMaterial({
        map:       tex,
        roughness: 0.9,
        metalness: 0.0,
      })
      materialRef.current = mat
      const earth = new THREE.Mesh(geo, mat)
      earthGroup.add(earth)

      const atmGeo = new THREE.SphereGeometry(1.055, 64, 64)
      const atmMat = new THREE.MeshStandardMaterial({
        color:       nightMode ? 0x112244 : 0x4488ff,
        transparent: true,
        opacity:     nightMode ? 0.04 : 0.06,
        side:        THREE.FrontSide,
        depthWrite:  false,
      })
      scene.add(new THREE.Mesh(atmGeo, atmMat))

      setLoaded(true)
      autoTimerRef.current = setTimeout(() => { autoRotateRef.current = true }, 3000)
    })

    const AXIS_Y    = new THREE.Vector3(0, 1, 0)
    const ROT_SPEED = 0.0006
    let rafId

    const animate = () => {
      rafId = requestAnimationFrame(animate)
      const eg = earthGroupRef.current
      if (eg) {
        eg.quaternion.slerp(targetQuatRef.current, 0.05)
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
      {/* Canvas — no halo, no ring, no glow */}
      <div
        ref={mountRef}
        className="absolute rounded-full overflow-hidden"
        style={{ inset: 0 }}
      />
      {!loaded && (
        <div
          className="absolute rounded-full flex flex-col items-center justify-center gap-2 z-10"
          style={{ inset: 0, background: 'rgba(4,6,18,0.95)' }}
        >
          <div className="w-7 h-7 border-2 border-[#cf8510]/20 border-t-[#cf8510] rounded-full animate-spin" />
          <p className="text-[10px] text-gray-600 tracking-widest uppercase">Chargement</p>
        </div>
      )}
      {showBadge && (
      <div className="absolute -bottom-3 left-0 right-0 text-center z-10">
        <button
          onClick={onRegionClick}
          className="inline-flex items-center gap-1.5 text-xs bg-[#0d0d0d]/90 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10 hover:border-white/20 transition-all duration-300 active:scale-95"
          style={{ color: '#cf8510' }}
        >
          <span>📍</span>
          <span>{regionLabel}</span>
          <svg className="w-3 h-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      )}
    </div>
  )
}
