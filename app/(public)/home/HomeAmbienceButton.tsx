'use client'

import { useSyncExternalStore } from 'react'
import { getServerSnapshot, getState, playRandom, subscribe } from '@/lib/client/musicEngine'
import { Button } from '@/app/components/ui'

export default function HomeAmbienceButton() {
  const state = useSyncExternalStore(subscribe, getState, getServerSnapshot)

  return (
    // Volontairement en retrait de la hiérarchie visuelle des CTA d'inscription/
    // découverte au-dessus (marge plus large, texte plus discret) — c'est une
    // fonctionnalité d'ambiance annexe, pas une 3e/4e action concurrente au
    // même niveau que « Créer mon compte »/« Découvrir les événements ».
    <Button
      variant="ghost"
      onClick={() => playRandom()}
      aria-pressed={state.playing}
      aria-label={state.playing ? 'Couper la musique d’ambiance' : "Lancer une musique d’ambiance (optionnel)"}
      style={{
        marginTop: 28,
        padding: '8px 15px',
        borderRadius: 999,
        border: `1px solid ${state.playing ? 'var(--primary-a42)' : 'rgba(255,255,255,.12)'}`,
        background: state.playing ? 'var(--primary-a09)' : 'transparent',
        color: state.playing ? 'var(--teal)' : 'var(--text-faint)',
        fontSize: 11.5,
        backdropFilter: 'blur(12px)',
      }}
    >
      {state.playing ? 'Ambiance en cours' : "Mettre l'ambiance"}
    </Button>
  )
}
