import LegalBackButton from './LegalBackButton'

// Port de src/components/LegalPageLayout.jsx — layout réutilisable pour
// toutes les pages légales (mentions légales, politique de confidentialité,
// cookies, CGU/CGV).

const CARD: React.CSSProperties = {
  background: '#0e0f16',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
}

const FONTS = {
  display: 'Inter, sans-serif',
  body: 'Inter, sans-serif',
}

const COLORS = {
  gold: '#c8a96e',
  teal: '#4ee8c8',
  muted: 'rgba(255,255,255,0.62)',
  dim: 'rgba(255,255,255,0.45)',
}

export type LegalSectionItem = string | { label: string; value?: string }

export interface LegalSection {
  n: string
  title: string
  body?: string | null
  list?: LegalSectionItem[]
  contact?: string
}

export interface LegalPageLayoutProps {
  title: string
  lastUpdate?: string
  sections: LegalSection[]
  footerNotice?: string
}

export default function LegalPageLayout({ title, lastUpdate = 'Avril 2026', sections, footerNotice }: LegalPageLayoutProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        position: 'relative',
        zIndex: 1,
        padding: '20px 16px 48px',
      }}
    >
      {/* Fond « Filigrane rose » (handoff 4a) — esprit papier officiel, réservé
          à la famille des pages légales ; les cartes sombres opaques restent
          lisibles par-dessus. */}
      <FiligraneRoseBg />
      <div style={{ maxWidth: 720, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          {/* Encre (#0B0B12) et non blanc : l'en-tête est posé directement sur
              le papier rose du filigrane, pas sur une carte sombre. */}
          <LegalBackButton />
          <div>
            <h1
              style={{
                fontFamily: FONTS.display,
                fontWeight: 800,
                fontSize: 24,
                color: '#0B0B12',
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              {title}
            </h1>
            <p style={{ fontFamily: FONTS.body, fontSize: 12, color: 'rgba(11,11,18,0.55)', margin: '4px 0 0' }}>
              Dernière mise à jour : {lastUpdate}
            </p>
          </div>
        </div>

        {/* Sommaire */}
        <nav aria-label="Sommaire" style={{ ...CARD, padding: '16px 20px', marginBottom: 16 }}>
          <p
            style={{
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.55)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              margin: '0 0 10px',
            }}
          >
            Sommaire
          </p>
          <ol
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '2px 20px',
            }}
          >
            {sections.map((s) => (
              <li key={s.n}>
                <a
                  href={`#legal-section-${s.n}`}
                  style={{
                    fontFamily: FONTS.body,
                    fontSize: 13,
                    color: COLORS.muted,
                    textDecoration: 'none',
                    display: 'flex',
                    gap: 8,
                    padding: '3px 0',
                    lineHeight: 1.5,
                  }}
                >
                  <span style={{ color: COLORS.gold, fontWeight: 700, fontSize: 12, minWidth: 20, flexShrink: 0 }}>{s.n}</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sections.map((s) => (
            <div key={s.n} id={`legal-section-${s.n}`} style={{ ...CARD, padding: '20px 20px', scrollMarginTop: 24 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <span
                  style={{
                    fontFamily: FONTS.body,
                    fontSize: 12,
                    fontWeight: 700,
                    color: COLORS.gold,
                    letterSpacing: '0.04em',
                    flexShrink: 0,
                    marginTop: 3,
                    minWidth: 24,
                  }}
                >
                  {s.n}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2
                    style={{
                      fontFamily: FONTS.display,
                      fontWeight: 700,
                      fontSize: 17,
                      color: 'rgba(255,255,255,0.93)',
                      margin: '0 0 10px',
                      lineHeight: 1.3,
                    }}
                  >
                    {s.title}
                  </h2>
                  {s.body && (
                    <p
                      style={{
                        fontFamily: FONTS.body,
                        fontSize: 14,
                        color: COLORS.muted,
                        margin: 0,
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {s.body}
                    </p>
                  )}
                  {s.list && (
                    <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
                      {s.list.map((item, i) => (
                        <li
                          key={i}
                          style={{
                            fontFamily: FONTS.body,
                            fontSize: 14,
                            color: COLORS.muted,
                            lineHeight: 1.6,
                            padding: '4px 0 4px 18px',
                            position: 'relative',
                          }}
                        >
                          <span style={{ position: 'absolute', left: 0, color: COLORS.gold }}>•</span>
                          {typeof item === 'string' ? (
                            item
                          ) : (
                            <>
                              <strong style={{ color: 'rgba(255,255,255,0.93)', fontWeight: 600 }}>{item.label}</strong>
                              {item.value ? ` — ${item.value}` : ''}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.contact && (
                    <p
                      style={{
                        fontFamily: FONTS.body,
                        fontSize: 14,
                        color: COLORS.muted,
                        margin: '8px 0 0',
                        lineHeight: 1.6,
                      }}
                    >
                      <a href={`mailto:${s.contact}`} style={{ color: COLORS.gold, textDecoration: 'underline' }}>
                        {s.contact}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer notice */}
        {footerNotice && (
          <div
            style={{
              ...CARD,
              borderColor: 'rgba(255,255,255,0.06)',
              padding: '14px 18px',
              marginTop: 16,
            }}
          >
            <p
              style={{
                fontFamily: FONTS.body,
                fontSize: 12,
                color: COLORS.dim,
                textAlign: 'center',
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              {footerNotice}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

const FILIGRANE_TEXT = Array(8).fill('LIVE IN BLACK').join(' · ') // couvre ≥ 2× la largeur du viewport

// offsetD/offsetM : décalage horizontal desktop/mobile (fixe, pas de scroll —
// voir la note de perf dans le composant légataire src/components/FiligraneRoseBg.jsx).
const FILIGRANE_LINES: { color: string; offsetD: number; offsetM: number; mobileOnly?: boolean }[] = [
  { color: 'rgba(255,77,166,0.07)', offsetD: -60, offsetM: -40 },
  { color: 'rgba(132,68,255,0.055)', offsetD: -420, offsetM: -260 },
  { color: 'rgba(11,11,18,0.03)', offsetD: -220, offsetM: -140 },
  { color: 'rgba(255,77,166,0.055)', offsetD: -560, offsetM: -340 },
  { color: 'rgba(132,68,255,0.05)', offsetD: -80, offsetM: -80, mobileOnly: true },
]

// Port de src/components/FiligraneRoseBg.jsx — fond « papier rose » réservé à
// la famille des pages légales. Fond CLAIR : le texte au-dessus doit rester
// encre (#0B0B12), pas blanc.
function FiligraneRoseBg() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        background:
          'radial-gradient(circle at 80% 0%, rgba(132,68,255,0.05), transparent 40%), linear-gradient(180deg, #FBF0F6 0%, #F6E2ED 100%)',
      }}
    >
      <style>{`
        .flg-line {
          white-space: nowrap; margin: 0; line-height: 0.9;
          font-family: Inter, system-ui, sans-serif; font-weight: 900;
          font-size: 88px; letter-spacing: -3px;
          margin-left: var(--off-d);
          user-select: none; -webkit-user-select: none;
        }
        .flg-mobile-only { display: none; }
        @media (max-width: 767px) {
          .flg-line { font-size: 56px; letter-spacing: -2px; margin-left: var(--off-m); }
          .flg-mobile-only { display: block; }
        }
      `}</style>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', overflow: 'hidden' }}>
        {FILIGRANE_LINES.map((line, i) => (
          <p
            key={i}
            className={`flg-line${line.mobileOnly ? ' flg-mobile-only' : ''}`}
            style={{ color: line.color, '--off-d': `${line.offsetD}px`, '--off-m': `${line.offsetM}px` } as React.CSSProperties}
          >
            {FILIGRANE_TEXT}
          </p>
        ))}
      </div>
    </div>
  )
}
