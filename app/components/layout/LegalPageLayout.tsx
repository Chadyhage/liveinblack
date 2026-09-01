import LegalBackButton from './LegalBackButton'
import { Card } from '@/app/components/ui'

// Port de src/components/LegalPageLayout.jsx — layout réutilisable pour
// toutes les pages légales (mentions légales, politique de confidentialité,
// cookies, CGU/CGV).

const CARD: React.CSSProperties = {
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
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
        padding: 'clamp(34px, 4vw, 56px) var(--public-page-gutter) 72px',
        background: 'var(--obsidian)',
      }}
    >
      <div style={{ width: 'min(100%, var(--public-page-max))', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <LegalBackButton />
          <div>
            <h1
              className="font-display"
              style={{
                fontSize: 'clamp(26px, 3vw, 36px)',
                letterSpacing: '-.02em',
                color: 'var(--text)',
                margin: 0,
                lineHeight: 1.2,
                fontWeight: 800,
              }}
            >
              {title}
            </h1>
            <p style={{ fontSize: 'var(--font-size-body-sm)', color: 'var(--text-muted)', margin: '4px 0 0', fontWeight: 600 }}>
              Dernière mise à jour : {lastUpdate}
            </p>
          </div>
        </div>

        {/* Sommaire */}
        <details className="lb-legal-toc" style={{ ...CARD, padding: '10px 18px', marginBottom: 20 }}>
          <summary
            style={{
              fontSize: 'var(--font-size-body)',
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
                    fontSize: 'var(--font-size-body-sm)',
                    color: 'var(--text-muted)',
                    textDecoration: 'none',
                    display: 'flex',
                    gap: 8,
                    minHeight: 34,
                    alignItems: 'center',
                    padding: '4px 0',
                    lineHeight: 1.35,
                  }}
                >
                  <span style={{ color: 'var(--primary)', fontWeight: 800, fontSize: 'var(--font-size-callout)', minWidth: 20, flexShrink: 0 }}>{s.n}</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol></nav>
        </details>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sections.map((s) => (
            <Card key={s.n} id={`legal-section-${s.n}`} style={{ padding: 'clamp(20px, 2.4vw, 30px)', borderRadius: 8, background: CARD.background, scrollMarginTop: 18 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span
                  style={{
                    fontSize: 'var(--font-size-body-sm)',
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
                      fontSize: 'var(--font-size-title-4)',
                      color: 'var(--text)',
                      margin: '0 0 8px',
                      lineHeight: 1.25,
                    }}
                  >
                    {s.title}
                  </h2>
                  {s.body && (
                    <p
                      style={{
                        fontSize: 'var(--font-size-headline-xl)',
                        color: 'var(--text-muted)',
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
                            fontSize: 'var(--font-size-headline-xl)',
                            color: 'var(--text-muted)',
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
                              <strong style={{ color: 'var(--text)', fontWeight: 700 }}>{item.label}</strong>
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
                        fontSize: 'var(--font-size-headline-xl)',
                        color: 'var(--text-muted)',
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
            accent="var(--border)"
            style={{
              padding: '14px 18px',
              marginTop: 20,
              borderRadius: 8,
              background: CARD.background,
            }}
          >
            <p
              style={{
                fontSize: 'var(--font-size-body)',
                color: 'var(--text-muted)',
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
