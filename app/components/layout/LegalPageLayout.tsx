import LegalBackButton from './LegalBackButton'
import { Card } from '@/app/components/ui'

// Port de src/components/LegalPageLayout.jsx — layout réutilisable pour
// toutes les pages légales (mentions légales, politique de confidentialité,
// cookies, CGU/CGV).

const CARD: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  boxShadow: '0 12px 34px rgba(0,0,0,0.2)',
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
    <main
      className="lb-legal-page"
      style={{
        minHeight: '100vh',
        position: 'relative',
        isolation: 'isolate',
        overflow: 'hidden',
        zIndex: 1,
        padding: '14px clamp(10px, 1.6vw, 22px) 34px',
        background:
          'radial-gradient(circle at 80% 0%, var(--primary-a07), transparent 38%), linear-gradient(180deg, var(--obsidian) 0%, #07080d 100%)',
      }}
    >
      {/* Filigrane discret, harmonisé avec l'univers sombre du produit. */}
      <FiligraneRoseBg />
      <div style={{ maxWidth: 1420, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <LegalBackButton />
          <div>
            <h1
              className="font-display"
              style={{
                fontSize: 'clamp(26px, 3vw, 36px)',
                letterSpacing: '-.02em',
                color: '#fff',
                margin: 0,
                lineHeight: 1.2,
                fontWeight: 800,
              }}
            >
              {title}
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(245, 245, 247, .7)', margin: '4px 0 0', fontWeight: 600 }}>
              Dernière mise à jour : {lastUpdate}
            </p>
          </div>
        </div>

        {/* Sommaire */}
        <details className="lb-legal-toc" style={{ ...CARD, padding: '10px 18px', marginBottom: 14, borderRadius: 16 }}>
          <summary
            style={{
              fontSize: 13.5,
              fontWeight: 800,
              color: 'var(--primary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              minHeight: 38,
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            Sommaire
          </summary>
          <nav aria-label="Sommaire"><ol
            style={{
              margin: '8px 0 0',
              padding: 0,
              listStyle: 'none',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '4px 16px',
            }}
          >
            {sections.map((s) => (
              <li key={s.n}>
                <a
                  href={`#legal-section-${s.n}`}
                  style={{
                    fontSize: 14,
                    color: 'rgba(245, 245, 247, .8)',
                    textDecoration: 'none',
                    display: 'flex',
                    gap: 8,
                    minHeight: 34,
                    alignItems: 'center',
                    padding: '4px 0',
                    lineHeight: 1.35,
                  }}
                >
                  <span style={{ color: 'var(--primary)', fontWeight: 800, fontSize: 13, minWidth: 20, flexShrink: 0 }}>{s.n}</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol></nav>
        </details>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sections.map((s) => (
            <Card key={s.n} id={`legal-section-${s.n}`} style={{ boxShadow: CARD.boxShadow, padding: '18px 22px', borderRadius: 18, scrollMarginTop: 18 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: 'var(--primary)',
                    letterSpacing: '0.04em',
                    flexShrink: 0,
                    marginTop: 2,
                    minWidth: 22,
                  }}
                >
                  {s.n}
                </span>
                <div style={{ flex: 1, minWidth: 0, maxWidth: 880 }}>
                  <h2
                    style={{
                      fontWeight: 800,
                      fontSize: 18,
                      color: '#fff',
                      margin: '0 0 8px',
                      lineHeight: 1.25,
                    }}
                  >
                    {s.title}
                  </h2>
                  {s.body && (
                    <p
                      style={{
                        fontSize: 15.5,
                        color: 'rgba(245, 245, 247, .82)',
                        margin: 0,
                        lineHeight: 1.55,
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
                            fontSize: 15.5,
                            color: 'rgba(245, 245, 247, .82)',
                            lineHeight: 1.55,
                            padding: '3px 0 3px 16px',
                            position: 'relative',
                          }}
                        >
                          <span style={{ position: 'absolute', left: 0, color: 'var(--primary)' }}>•</span>
                          {typeof item === 'string' ? (
                            item
                          ) : (
                            <>
                              <strong style={{ color: '#fff', fontWeight: 700 }}>{item.label}</strong>
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
                        fontSize: 15.5,
                        color: 'rgba(245, 245, 247, .82)',
                        margin: '8px 0 0',
                        lineHeight: 1.55,
                      }}
                    >
                      <a href={`mailto:${s.contact}`} style={{ color: 'var(--primary)', fontWeight: 650, textDecoration: 'underline' }}>
                        {s.contact}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Footer notice */}
        {footerNotice && (
          <Card
            accent="rgba(255,255,255,0.06)"
            style={{
              boxShadow: CARD.boxShadow,
              padding: '14px 18px',
              marginTop: 14,
              borderRadius: 16,
            }}
          >
            <p
              style={{
                fontSize: 13.5,
                color: 'rgba(245, 245, 247, .65)',
                textAlign: 'center',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {footerNotice}
            </p>
          </Card>
        )}
      </div>
    </main>
  )
}

const FILIGRANE_TEXT = Array(8).fill('LIVE IN BLACK').join(' · ') // couvre ≥ 2× la largeur du viewport

// offsetD/offsetM : décalage horizontal desktop/mobile (fixe, pas de scroll —
// voir la note de perf dans le composant légataire src/components/FiligraneRoseBg.jsx).
const FILIGRANE_LINES: { color: string; offsetD: number; offsetM: number; mobileOnly?: boolean }[] = [
  { color: 'rgba(245, 61, 141, 0.025)', offsetD: -60, offsetM: -40 },
  { color: 'rgba(245, 61, 141, 0.02)', offsetD: -420, offsetM: -260 },
  { color: 'rgba(255,255,255,0.018)', offsetD: -220, offsetM: -140 },
  { color: 'rgba(245, 61, 141, 0.018)', offsetD: -560, offsetM: -340 },
  { color: 'rgba(255,255,255,0.015)', offsetD: -80, offsetM: -80, mobileOnly: true },
]

function FiligraneRoseBg() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <style>{`
        .flg-line {
          white-space: nowrap; margin: 0; line-height: 0.9;
          font-family: var(--font-open-sans); font-weight: 900;
          font-size: 74px; letter-spacing: -2.5px;
          margin-left: var(--off-d);
          user-select: none; -webkit-user-select: none;
        }
        .flg-mobile-only { display: none; }
        @media (max-width: 767px) {
          .flg-line { font-size: 44px; letter-spacing: -1.5px; margin-left: var(--off-m); }
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
