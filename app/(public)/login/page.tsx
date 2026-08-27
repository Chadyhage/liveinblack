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
          LES MEILLEURES SOIRÉES,
          <br />
          <span style={{ color: 'var(--teal)' }}>AU BOUT DES DOIGTS.</span>
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
    <div aria-label="Chargement du formulaire" style={{ width: '100%', maxWidth: 760, margin: '0 auto' }}>
      <h1 className="font-display" style={{ fontSize: 16, color: 'var(--teal)', margin: '0 0 10px' }}>Connexion</h1>
      <div className="lb-loading-panel" style={{ minHeight: 220 }}>
        <span>Préparation du formulaire…</span>
      </div>
    </div>
  )
}
