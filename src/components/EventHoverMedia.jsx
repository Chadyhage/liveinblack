import { useEffect, useRef, useState } from 'react'

const DEFAULT_BG = 'radial-gradient(circle at 30% 25%, rgba(132,68,255,.38), transparent 58%), linear-gradient(150deg,#191323,#080910)'

export default function EventHoverMedia({
  event,
  imageUrl,
  videoUrl,
  alt,
  height,
  aspectRatio = '16 / 9',
  fallbackBackground = DEFAULT_BG,
  overlay = 'linear-gradient(to top, rgba(5,6,10,.82), transparent 62%)',
  hoverDelay = 1000,
  zoom = false,
  showBadge = false,
  style,
  children,
}) {
  const poster = imageUrl || event?.imageUrl || event?.image || event?.cover || ''
  const video = videoUrl || event?.videoUrl || event?.previewVideoUrl || ''
  const [armed, setArmed] = useState(false)
  const [hovered, setHovered] = useState(false)
  // La vidéo peut peser plusieurs Mo : l'affiche ne s'efface que quand la
  // lecture a RÉELLEMENT démarré (sinon carte noire pendant le téléchargement).
  const [playing, setPlaying] = useState(false)
  const timerRef = useRef(null)
  const videoRef = useRef(null)

  const clearHoverTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const startPreview = () => {
    if (!video) return
    setHovered(true)
    clearHoverTimer()
    timerRef.current = setTimeout(() => setArmed(true), hoverDelay)
  }

  const stopPreview = () => {
    setHovered(false)
    clearHoverTimer()
    setArmed(false)
    setPlaying(false)
    const node = videoRef.current
    if (node) {
      node.pause()
      node.currentTime = 0
    }
  }

  useEffect(() => {
    if (!armed || !videoRef.current) return
    const playPromise = videoRef.current.play()
    if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => {})
  }, [armed])

  useEffect(() => () => clearHoverTimer(), [])

  return (
    <div
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      onFocus={startPreview}
      onBlur={stopPreview}
      style={{
        position: 'relative',
        width: '100%',
        height,
        aspectRatio: height ? undefined : aspectRatio,
        overflow: 'hidden',
        background: poster ? '#080910' : fallbackBackground,
        ...style,
      }}
    >
      {poster ? (
        <img
          src={poster}
          alt={alt || event?.name || ''}
          loading="lazy"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: playing ? 0 : 1,
            transform: zoom && hovered ? 'scale(1.06)' : 'scale(1)',
            transition: 'opacity .24s ease, transform .55s cubic-bezier(.22,.9,.3,1)',
          }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: fallbackBackground }} />
      )}

      {/* Monté dès le survol (préchargement pendant le délai d'armement) pour
          que la lecture démarre vite ; visible seulement quand elle a démarré. */}
      {video && hovered && (
        <video
          ref={videoRef}
          src={video}
          muted
          loop
          playsInline
          preload="auto"
          onPlaying={() => setPlaying(true)}
          onError={() => { setPlaying(false); setArmed(false) }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: playing ? 1 : 0,
            transition: 'opacity .24s ease',
          }}
        />
      )}

      {overlay && <div style={{ position: 'absolute', inset: 0, background: overlay, pointerEvents: 'none' }} />}

      {showBadge && video && (
        <span
          style={{
            position: 'absolute',
            left: 10,
            top: 10,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 9px',
            borderRadius: 999,
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: playing ? '#04040b' : '#4ee8c8',
            background: playing ? '#4ee8c8' : 'rgba(5,6,10,.68)',
            border: `1px solid ${playing ? 'rgba(78,232,200,.4)' : 'rgba(78,232,200,.35)'}`,
            backdropFilter: 'blur(8px)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: playing ? '#04040b' : '#4ee8c8' }} />
          Aperçu vidéo
        </span>
      )}

      {children}
    </div>
  )
}
