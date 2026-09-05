import type { Metadata } from 'next'
import { Suspense } from 'react'
import AuthSplitLayout from '../_components/AuthSplitLayout'
import AuthForm from './AuthForm'

// Port de src/pages/LoginPage.jsx (#118) — remplace le stub Phase 1
// (Credentials/JWT only, voir git history). `useSearchParams` (dans
// AuthForm) exige une frontière Suspense pour ne pas bloquer le
// pré-rendu statique.
export const metadata: Metadata = {
  title: 'Connexion / Inscription — LIVEINBLACK',
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return (
    <AuthSplitLayout
      tagline={
        <>
          Toute la scène.
          <br />
          <span>Une seule expérience.</span>
        </>
      }
    >
      <Suspense fallback={<AuthFormFallback />}>
        <AuthForm />
      </Suspense>
    </AuthSplitLayout>
  )
}

function AuthFormFallback() {
  return (
    <div aria-label="Chargement du formulaire" style={{ width: '100%', maxWidth: 520, margin: '0 auto' }}>
      <h1 style={{ fontSize: 30, fontWeight: 500, color: 'var(--text)', margin: '0 0 14px' }}>Connexion</h1>
      <div className="lb-loading-panel" style={{ minHeight: 220 }}>
        <span>Préparation du formulaire…</span>
      </div>
    </div>
  )
}
