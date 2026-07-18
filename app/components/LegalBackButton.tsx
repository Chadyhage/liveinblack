'use client'

import { useRouter } from 'next/navigation'

// Port du bouton retour de src/components/LegalPageLayout.jsx
// (navigate(-1) → router.back()).
export default function LegalBackButton() {
  const router = useRouter()

  return (
    <button
      onClick={() => router.back()}
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
