import type { ReactNode } from 'react'
import Image from 'next/image'

// Coquille "split-screen" partagée par tous les écrans d'authentification
// publics (login, organizer-signup, provider-signup, reset-password,
// verify-email, confirmer-email) : visuel plein cadre sur la moitié gauche,
// contenu sans carte conteneur sur la moitié droite (décision produit
// 2026-07). Le visuel disparaît sous 900px, le contenu repasse alors pleine
// largeur — un seul endroit à maintenir pour ce comportement responsive.
const HERO_IMG = 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1400&q=80'

export default function AuthSplitLayout({ children, tagline }: { children: ReactNode; tagline?: ReactNode }) {
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
        {tagline && (
          <div style={{ position: 'absolute', left: 44, bottom: 48, right: 44 }}>
            <p className="font-display" style={{ margin: 0, fontSize: 30, color: '#fff', lineHeight: 1.15 }}>
              {tagline}
            </p>
          </div>
        )}
      </div>
      <div className="lb-auth-split__form" style={{ flex: '1 1 50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px', overflowY: 'auto' }}>
        {children}
      </div>
    </main>
  )
}
