'use client'

import { useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { IconButton } from '@/app/components/ui'

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
    <IconButton
        label="Défiler vers la section suivante"
        onClick={scrollToNext}
        size={44}
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 22,
          transform: 'translateX(-50%)',
          border: '1px solid rgba(255,255,255,.18)',
          background: 'rgba(18,18,20,.58)',
          backdropFilter: 'blur(14px)',
          color: 'rgba(255,255,255,.78)',
        }}
        icon={
          <span style={{ display: 'inline-flex' }}>
            <ChevronDown size={22} strokeWidth={1.8} aria-hidden="true" />
          </span>
        }
      />
  )
}
