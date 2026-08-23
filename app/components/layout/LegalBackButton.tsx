'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/app/components/ui'

// Port du bouton retour de src/components/LegalPageLayout.jsx
// (navigate(-1) → router.back()).
// Fallback vers /home si la page a été ouverte directement (favori, nouvel
// onglet, lien externe) et qu'il n'y a donc pas d'historique de navigation
// dans l'app — sinon router.back() peut ne rien faire ou sortir du site.
export default function LegalBackButton() {
  const router = useRouter()

  const handleClick = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/home')
    }
  }

  return (
    <Button
      onClick={handleClick}
      aria-label="Retour"
      variant="ghost"
      style={{
        height: 44,
        minHeight: 44,
        padding: '0 14px 0 11px',
        borderRadius: 12,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid var(--border)',
        color: 'var(--text-muted)',
        fontSize: 14,
        fontWeight: 600,
      }}
    >
      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
      <span>Retour</span>
    </Button>
  )
}
