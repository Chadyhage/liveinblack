'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import Button from './Button'

export interface SlideOverModalProps {
  children: ReactNode
  maxWidth?: number
}

// Coquille de modal "tiroir" glissant depuis la droite, utilisée par les
// routes interceptées (app/(public)/@modal/(.)events/[id]/page.tsx et
// équivalents providers/organizers) pour afficher une carte cliquée depuis
// une liste sans quitter la page en cours, tout en gardant chaque page de
// détail link-based (voir ces page.tsx pour la version pleine page utilisée
// en visite directe / refresh / nouvel onglet). Contrairement à Modal.tsx
// (carte centrée, sans animation), cette coquille anime un panneau
// plein-hauteur ancré à droite — pas de lib d'animation dans ce repo, donc
// transition CSS pure pilotée par un état "monté" pour déclencher le
// slide-in au prochain frame.
export default function SlideOverModal({ children, maxWidth = 680 }: SlideOverModalProps) {
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    const { style } = document.body
    const prevOverflow = style.overflow
    style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf)
      style.overflow = prevOverflow
    }
  }, [])

  const close = useCallback(() => {
    setClosing(true)
    setVisible(false)
    // Laisse la transition de sortie se jouer avant de dépiler la route —
    // évite le "saut" visuel d'un router.back() instantané.
    window.setTimeout(() => router.back(), 220)
  }, [router])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !closing) close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, closing])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(3,4,8,0.72)',
          backdropFilter: 'blur(8px)',
          opacity: visible ? 1 : 0,
          transition: 'opacity .22s ease',
        }}
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          // 3/4 de l'écran sur desktop (au moins maxWidth si 75vw est plus
          // étroit, ex. petits écrans desktop), plein écran sur mobile — le
          // min(...,100vw) externe garantit qu'on ne déborde jamais le
          // viewport quand maxWidth dépasse la largeur d'un mobile.
          width: `min(max(75vw, ${maxWidth}px), 100vw)`,
          background: 'var(--obsidian)',
          borderLeft: '1px solid var(--border-strong)',
          boxShadow: '-24px 0 64px rgba(0,0,0,0.55)',
          overflowY: 'auto',
          transform: visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform .28s cubic-bezier(.32,.72,0,1)',
        }}
      >
        <Button
          variant="ghost"
          onClick={close}
          aria-label="Fermer"
          style={{ position: 'absolute', top: 12, right: 12, zIndex: 2, width: 38, height: 38, minHeight: 38, minWidth: 38, padding: 0, borderRadius: '50%', color: 'rgba(255,255,255,0.7)', background: 'rgba(4,4,11,0.55)', backdropFilter: 'blur(6px)', lineHeight: 1 }}
        >
          <X size={18} strokeWidth={1.8} aria-hidden="true" />
        </Button>
        {children}
      </div>
    </div>
  )
}
