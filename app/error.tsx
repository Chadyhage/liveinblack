'use client'

import Mascot from './components/ui/Mascot'
import { Button } from './components/ui'

// Error boundary global — jusqu'ici absent (aucun app/error.tsx), une erreur
// d'exécution imprévue tombait sur l'écran d'erreur anglais par défaut de
// Next.js. Server component obligatoirement client (App Router) : `reset`
// est une fonction fournie par Next pour retenter le rendu du segment fautif.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '24px',
        gap: 14,
      }}
    >
      <Mascot mood="error" size={210} />
      <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--gold)', margin: 0, textTransform: 'uppercase' }}>Oups</p>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: 'var(--text)' }}>Un problème est survenu</h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, maxWidth: 620 }}>
        Quelque chose s&apos;est mal passé de notre côté. Réessaie, ou reviens un peu plus tard.
      </p>
      <Button
        onClick={reset}
        style={{
          marginTop: 10,
          padding: '11px 22px',
          borderRadius: 999,
          background: 'var(--teal-solid)',
          color: '#04120e',
        }}
      >
        Réessayer
      </Button>
    </main>
  )
}
