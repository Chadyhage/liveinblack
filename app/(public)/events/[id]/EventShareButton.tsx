'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, MessageCircle } from 'lucide-react'
import { Button } from '@/app/components/ui'

// Menu de partage listant les réseaux (WhatsApp, Facebook, X, copie du lien)
// — avant cette version, "Partager" ne faisait qu'appeler l'API native
// navigator.share() (peu contrôlable visuellement) ou copier le lien en
// silence. Transition d'ouverture/fermeture calquée sur la convention déjà
// posée par SlideOverModal.tsx (état "monté" piloté en JS + transition CSS
// pure, pas de lib d'animation dans ce repo) mais volontairement discrète
// (opacity + scale, ~180ms) plutôt que le slide-in plein écran du modal.
export default function EventShareButton({ eventName }: { eventName: string }) {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Rendu en portail (document.body) plutôt qu'imbriqué dans le bouton : ce
  // bouton vit dans le bandeau héro de la page événement, qui a
  // `overflow: hidden` (cf. EventDetailContent.tsx) — un menu simplement
  // `position: absolute` y serait rogné. Position calculée depuis le rect du
  // conteneur, en `position: fixed` (viewport), donc indépendante de tout
  // ancêtre à overflow contraint.
  const openMenu = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) setMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
    setOpen(true)
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const closeMenu = useCallback(() => {
    setVisible(false)
    window.setTimeout(() => setOpen(false), 180)
  }, [])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      closeMenu()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMenu()
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, closeMenu])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Presse-papiers indisponible (permissions navigateur) : on laisse
      // simplement l'utilisateur copier l'URL manuellement.
    }
  }

  const shareText = `Découvre ${eventName} sur LIVEINBLACK`
  const links = [
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      icon: <MessageCircle size={16} strokeWidth={2} aria-hidden="true" />,
      href: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${typeof window !== 'undefined' ? window.location.href : ''}`)}`,
    },
    {
      key: 'facebook',
      label: 'Facebook',
      icon: <span aria-hidden="true" style={glyphStyle}>f</span>,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`,
    },
    {
      key: 'x',
      label: 'X',
      icon: <span aria-hidden="true" style={glyphStyle}>X</span>,
      href: `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`,
    },
  ]

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <Button
        variant="secondary"
        onClick={() => (open ? closeMenu() : openMenu())}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Partager ${eventName}`}
        style={{ minHeight: 44, padding: '8px 13px', borderRadius: 999, border: '1px solid rgba(255,255,255,.24)', background: 'rgba(4,4,11,.72)', backdropFilter: 'blur(10px)', color: '#fff', fontSize: 12 }}
      >
        {copied ? 'Lien copié' : 'Partager'}
      </Button>

      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Partager sur les réseaux"
            style={{
              position: 'fixed',
              top: menuPos.top,
              right: menuPos.right,
              zIndex: 3200,
              minWidth: 190,
              padding: 6,
              borderRadius: 14,
              border: '1px solid var(--border-strong)',
              background: 'var(--surface-2)',
              boxShadow: '0 18px 44px rgba(0,0,0,.4)',
              opacity: visible ? 1 : 0,
              transform: visible ? 'scale(1)' : 'scale(0.96)',
              transformOrigin: 'top right',
              transition: 'opacity .18s ease, transform .18s ease',
            }}
          >
            {links.map((link) => (
              <a
                key={link.key}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                onClick={closeMenu}
                style={menuItemStyle}
              >
                {link.icon}
                {link.label}
              </a>
            ))}
            <Button
              variant="ghost"
              role="menuitem"
              onClick={() => { copyLink(); closeMenu() }}
              style={{ ...menuItemStyle, width: '100%', minHeight: 'auto', justifyContent: 'flex-start', fontWeight: 600 }}
            >
              <Copy size={16} strokeWidth={2} aria-hidden="true" />
              Copier le lien
            </Button>
          </div>,
          document.body
        )}
    </div>
  )
}

const glyphStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  fontSize: 11,
  fontWeight: 800,
  lineHeight: 1,
  flexShrink: 0,
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '9px 11px',
  borderRadius: 9,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text)',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}
