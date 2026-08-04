'use client'

import { useCallback } from 'react'
import { ChevronDown } from 'lucide-react'

// Flèche de défilement animée en bas du hero (retour client, voix off) —
// cible dynamiquement le prochain élément frère de la section hero plutôt
// qu'un id fixe : la section qui suit le hero varie selon la session
// (Top 3, Actualité, ou directement "Des soirées à découvrir"), donc on
// laisse le DOM décider au clic plutôt que de dupliquer un id sur chaque
// branche conditionnelle de app/(public)/home/page.tsx.
export default function HeroScrollIndicator({ targetId }: { targetId?: string }) {
  const scrollToNext = useCallback(() => {
    const hero = document.getElementById('home-hero')
    const next = (targetId && document.getElementById(targetId)) || hero?.nextElementSibling
    if (next && 'scrollIntoView' in next) {
      ;(next as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [targetId])

  return (
    <>
      <style>{`
        @keyframes lbHeroChevronBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(8px); }
        }
        .lb-hero-scroll-indicator {
          animation: lbHeroChevronBounce 1.8s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .lb-hero-scroll-indicator {
            animation: none;
          }
        }
      `}</style>
      <button
        type="button"
        onClick={scrollToNext}
        aria-label="Défiler vers la section suivante"
        className="lb-hero-scroll-indicator"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 22,
          transform: 'translateX(-50%)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-muted)',
          cursor: 'pointer',
        }}
      >
        <ChevronDown size={28} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </>
  )
}
