import type { ReactNode } from 'react'
import Image from 'next/image'

// Coquille "split-screen" partagée par tous les écrans d'authentification
// publics (login, organizer-signup, provider-signup, reset-password,
// verify-email, confirmer-email) : visuel plein cadre sur la moitié gauche,
// contenu sans carte conteneur sur la moitié droite (décision produit
// 2026-07). Le visuel disparaît sous 900px, le contenu repasse alors pleine
// largeur — un seul endroit à maintenir pour ce comportement responsive.
const HERO_IMG = 'https://images.unsplash.com/photo-1496337589254-7e19d01cec44?auto=format&fit=crop&w=1400&q=80'

export default function AuthSplitLayout({ children, tagline, heroImage }: { children: ReactNode; tagline?: ReactNode; heroImage?: string }) {
  return (
    <main className="lb-auth-split" style={{ flex: 1, display: 'flex', minHeight: 'calc(100dvh - 64px)' }}>
      <style>{`
        @media (max-width: 900px) {
          .lb-auth-split__visual { display: none !important; }
          .lb-auth-split__form { flex: 1 1 100% !important; }
        }
      `}</style>
      <div className="lb-auth-split__visual" style={{ flex: '1 1 46%', position: 'relative', overflow: 'hidden' }}>
        <Image src={heroImage || HERO_IMG} alt="" fill priority sizes="50vw" style={{ objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,4,11,0.15) 0%, rgba(4,4,11,0.55) 75%, rgba(4,4,11,0.85) 100%)' }} />
        {tagline && (
          <div style={{ position: 'absolute', left: 44, bottom: 48, right: 44 }}>
            <p className="font-display" style={{ margin: 0, fontSize: 30, color: '#fff', lineHeight: 1.15 }}>
              {tagline}
            </p>
          </div>
        )}
      </div>
      {/* flexDirection:'column' plutôt que la row par défaut : dans un flex
          row, un enfant bloc sans flex-grow explicite se contente de sa
          largeur de contenu "shrink-to-fit" (justifyContent:'center' le
          centre sans jamais l'étirer) — c'était la cause racine de l'espace
          vide constaté à droite des formulaires (organizer-signup,
          provider-signup...) sur grand écran, quel que soit le maxWidth
          déclaré côté enfant. En colonne, l'axe principal devient vertical
          (justifyContent:'center' centre donc verticalement, comme avant)
          et align-items:'stretch' (valeur par défaut, volontairement non
          surchargée) étire l'enfant sur tout l'axe transversal — chaque page
          garde le contrôle de sa propre largeur via son maxWidth +
          margin:'0 auto' habituel (login, reset-password, wizards...). */}
      <div className="lb-auth-split__form" style={{ flex: '1 1 54%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px clamp(10px, 2vw, 32px)', overflowY: 'auto' }}>
        {children}
      </div>
    </main>
  )
}
