import type { Metadata } from 'next'
import { Suspense } from 'react'
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
    <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Suspense fallback={null}>
        <AuthForm />
      </Suspense>
    </main>
  )
}
