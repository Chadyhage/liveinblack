// src/components/LegalPageLayout.jsx — Layout réutilisable pour pages légales
// (mentions légales, politique de confidentialité, cookies, CGU, etc.)
import { useNavigate } from 'react-router-dom'

const CARD = {
  background: '#0e0f16',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
}

const FONTS = {
  display: "Inter, sans-serif",
  body: "Inter, sans-serif",
}

const COLORS = {
  gold: '#c8a96e',
  teal: '#4ee8c8',
  muted: 'rgba(255,255,255,0.62)',
  dim: 'rgba(255,255,255,0.45)',
}

/**
 * Layout commun pour toutes les pages légales.
 *
 * @param {Object} props
 * @param {string} props.title - Titre principal (ex: "Mentions légales")
 * @param {string} [props.lastUpdate] - Date de dernière MAJ
 * @param {Array}  props.sections - [{ n, title, body, contact?, list?, html? }]
 * @param {string} [props.footerNotice] - Note de bas de page
 */
export default function LegalPageLayout({ title, lastUpdate = 'Avril 2026', sections, footerNotice }) {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh', position: 'relative', zIndex: 1,
      padding: '20px 16px 48px',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button
            onClick={() => navigate(-1)}
            aria-label="Retour"
            style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: COLORS.muted,
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div>
            <h1 style={{
              fontFamily: FONTS.display, fontWeight: 800,
              fontSize: 24, color: 'rgba(255,255,255,0.93)', margin: 0,
              lineHeight: 1.2,
            }}>
              {title}
            </h1>
            <p style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.dim, margin: '4px 0 0' }}>
              Dernière mise à jour : {lastUpdate}
            </p>
          </div>
        </div>

        {/* Sommaire */}
        <nav aria-label="Sommaire" style={{ ...CARD, padding: '16px 20px', marginBottom: 16 }}>
          <p style={{
            fontFamily: FONTS.body, fontSize: 12, fontWeight: 700,
            color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase',
            letterSpacing: '0.04em', margin: '0 0 10px',
          }}>
            Sommaire
          </p>
          <ol style={{
            margin: 0, padding: 0, listStyle: 'none',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '2px 20px',
          }}>
            {sections.map((s) => (
              <li key={s.n}>
                <a href={`#legal-section-${s.n}`} style={{
                  fontFamily: FONTS.body, fontSize: 13, color: COLORS.muted,
                  textDecoration: 'none', display: 'flex', gap: 8,
                  padding: '3px 0', lineHeight: 1.5,
                }}>
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
                <span style={{
                  fontFamily: FONTS.body, fontSize: 12, fontWeight: 700, color: COLORS.gold,
                  letterSpacing: '0.04em', flexShrink: 0, marginTop: 3, minWidth: 24,
                }}>
                  {s.n}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{
                    fontFamily: FONTS.display, fontWeight: 700,
                    fontSize: 17, color: 'rgba(255,255,255,0.93)', margin: '0 0 10px',
                    lineHeight: 1.3,
                  }}>
                    {s.title}
                  </h2>
                  {s.body && (
                    <p style={{
                      fontFamily: FONTS.body, fontSize: 14,
                      color: COLORS.muted, margin: 0,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {s.body}
                    </p>
                  )}
                  {s.list && (
                    <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
                      {s.list.map((item, i) => (
                        <li key={i} style={{
                          fontFamily: FONTS.body, fontSize: 14, color: COLORS.muted,
                          lineHeight: 1.6, padding: '4px 0 4px 18px', position: 'relative',
                        }}>
                          <span style={{ position: 'absolute', left: 0, color: COLORS.gold }}>•</span>
                          {typeof item === 'string' ? item : (
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
                    <p style={{
                      fontFamily: FONTS.body, fontSize: 14,
                      color: COLORS.muted, margin: '8px 0 0', lineHeight: 1.6,
                    }}>
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
          <div style={{
            ...CARD,
            borderColor: 'rgba(255,255,255,0.06)',
            padding: '14px 18px', marginTop: 16,
          }}>
            <p style={{
              fontFamily: FONTS.body, fontSize: 12,
              color: 'rgba(255,255,255,0.45)', textAlign: 'center', margin: 0,
              lineHeight: 1.6,
            }}>
              {footerNotice}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
