'use client'

import { useRouter } from 'next/navigation'

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
    <button
      onClick={handleClick}
      aria-label="Retour"
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        flexShrink: 0,
        background: 'rgba(11,11,18,0.06)',
        border: '1px solid rgba(11,11,18,0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: 'rgba(11,11,18,0.65)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  )
}
