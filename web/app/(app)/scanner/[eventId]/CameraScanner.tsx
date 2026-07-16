'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

// Port du scanner caméra de src/pages/ScannerPage.jsx (getUserMedia + jsqr,
// boucle requestAnimationFrame sur des frames <canvas> tirées d'un <video>).
// Aucune logique de check-in ici : ce composant ne fait QUE lire un QR et
// remonter la chaîne décodée au parent via `onScan` — c'est ScannerClient qui
// décide quoi en faire (jeton d'URL vs code brut, appel API...).

export interface CameraScannerProps {
  active: boolean
  onScan: (value: string) => void
}

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : typeof err === 'object' && err && 'name' in err ? String((err as { name: unknown }).name) : undefined
  switch (name) {
    case 'NotAllowedError':
      return 'Caméra refusée. Autorise-la dans les réglages de ton navigateur, puis réessaie.'
    case 'NotFoundError':
      return 'Aucune caméra détectée sur cet appareil.'
    case 'NotReadableError':
      return 'Caméra déjà utilisée par une autre application. Ferme-la et réessaie.'
    case 'OverconstrainedError':
      return 'Caméra incompatible. Essaie un autre appareil.'
    case 'SecurityError':
      return 'Caméra bloquée. Vérifie que tu es bien en connexion sécurisée (HTTPS).'
    default:
      return 'Caméra inaccessible. Réessaie ou utilise la saisie manuelle.'
  }
}

export default function CameraScanner({ active, onScan }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Arrête tout flux/rAF en cours. Référencé depuis l'effet ET depuis sa
  // fonction de nettoyage — volontairement sans dépendance externe (ne touche
  // qu'à des refs) pour rester une identité stable.
  const stopMedia = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop()
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!active) {
      stopMedia()
      return
    }

    // Variable LOCALE à CETTE invocation de l'effet (pas une ref partagée
    // entre invocations) — nécessaire pour couvrir correctement la course
    // toggle-on → toggle-off → toggle-on-à-nouveau AVANT que le premier
    // getUserMedia() n'ait eu le temps de se résoudre : si `cancelled` était
    // une ref réutilisée, la remise à `false` par la 3e bascule effacerait
    // l'annulation posée par la 2e, et le flux caméra de la 1ère bascule
    // (obsolète) s'attacherait quand même une fois résolu.
    let cancelled = false

    async function start() {
      // Efface une éventuelle erreur d'une tentative précédente dès qu'on
      // relance un scan — dans le callback `start`, pas directement dans le
      // corps synchrone de l'effet (évite les rendus en cascade, cf. règle
      // react-hooks/set-state-in-effect).
      setError(null)
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
      } catch (err) {
        if (!cancelled) setError(cameraErrorMessage(err))
        return
      }

      if (cancelled) {
        // Le scan a été désactivé (ou le composant démonté) pendant que la
        // permission caméra était en vol — un flux dont plus personne ne veut
        // ne doit JAMAIS rester attaché : on l'arrête immédiatement au lieu
        // de le stocker dans streamRef.
        for (const track of stream.getTracks()) track.stop()
        return
      }

      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) {
        for (const track of stream.getTracks()) track.stop()
        return
      }

      streamRef.current = stream
      video.srcObject = stream
      try {
        await video.play()
      } catch {
        // Lecture refusée/interrompue (ex. composant démonté entre-temps) —
        // le nettoyage de l'effet a déjà (ou va) tout arrêter.
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx || cancelled) return

      const tick = () => {
        if (cancelled) return
        if (video.readyState >= 2) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
          if (code?.data) {
            stopMedia()
            onScan(code.data)
            return
          }
        }
        frameRef.current = requestAnimationFrame(tick)
      }
      frameRef.current = requestAnimationFrame(tick)
    }

    void start()

    return () => {
      cancelled = true
      stopMedia()
    }
  }, [active, onScan, stopMedia])

  // Nettoyage final au démontage (couvre le cas où le composant disparaît
  // pendant que `active` est resté `true` sans jamais retomber à `false` —
  // déjà couvert par le retour de l'effet ci-dessus puisque `active` fait
  // partie de ses dépendances, mais un second filet explicite ici ne coûte
  // rien et documente l'intention).
  useEffect(() => {
    return () => stopMedia()
  }, [stopMedia])

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 14,
        overflow: 'hidden',
        background: '#000',
        aspectRatio: '4 / 3',
        border: '1px solid var(--border)',
      }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: active ? 'block' : 'none' }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {!active && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>Caméra en pause</p>
        </div>
      )}
      {active && error && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            background: 'rgba(4,4,11,0.9)',
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--pink)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>{error}</p>
        </div>
      )}
    </div>
  )
}
