import type { Metadata } from 'next'
import { Suspense } from 'react'
import Image from 'next/image'
import AuthForm from './AuthForm'

// Port de src/pages/LoginPage.jsx (#118) — remplace le stub Phase 1
// (Credentials/JWT only, voir git history). `useSearchParams` (dans
// AuthForm) exige une frontière Suspense pour ne pas bloquer le
// pré-rendu statique.
export const metadata: Metadata = {
  title: 'Connexion / Inscription — LIVEINBLACK',
  robots: { index: false, follow: false },
}

// Décision produit (2026-07) : écran auth "split-screen" moderne — visuel
// plein cadre sur la moitié gauche, formulaire sans carte sur la moitié
// droite. Le visuel disparaît sous 900px (l'écran est trop étroit pour un
// split lisible) : seul le formulaire reste, centré pleine largeur.
const HERO_IMG = 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1400&q=80'

export default function LoginPage() {
  return (
    <main className="lb-auth-split" style={{ flex: 1, display: 'flex', minHeight: '100dvh' }}>
      <style>{`
        @media (max-width: 900px) {
          .lb-auth-split__visual { display: none !important; }
          .lb-auth-split__form { flex: 1 1 100% !important; }
        }
      `}</style>
      <div className="lb-auth-split__visual" style={{ flex: '1 1 50%', position: 'relative', overflow: 'hidden' }}>
        <Image src={HERO_IMG} alt="" fill priority sizes="50vw" style={{ objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,4,11,0.15) 0%, rgba(4,4,11,0.55) 75%, rgba(4,4,11,0.85) 100%)' }} />
        <div style={{ position: 'absolute', left: 44, bottom: 48, right: 44 }}>
          <p className="font-display" style={{ margin: 0, fontSize: 30, color: '#fff', lineHeight: 1.15 }}>
            LES MEILLEURES SOIRÉES,<br /><span style={{ color: 'var(--teal)' }}>AU BOUT DES DOIGTS.</span>
          </p>
        </div>
      </div>
      <div className="lb-auth-split__form" style={{ flex: '1 1 50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px', overflowY: 'auto' }}>
        <Suspense fallback={null}>
          <AuthForm />
        </Suspense>
      </div>
    </main>
  )
}
