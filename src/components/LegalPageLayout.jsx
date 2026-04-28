// src/components/LegalPageLayout.jsx — Layout réutilisable pour pages légales
// (mentions légales, politique de confidentialité, cookies, CGU, etc.)
import { useNavigate } from 'react-router-dom'

const CARD = {
  background: 'rgba(8,10,20,0.55)',
  backdropFilter: 'blur(22px) saturate(1.6)',
  WebkitBackdropFilter: 'blur(22px) saturate(1.6)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 12,
}

const FONTS = {
  display: "'Cormorant Garamond', Georgia, serif",
  mono: "'DM Mono', 'Fira Mono', monospace",
}

const COLORS = {
  gold: '#c8a96e',
  teal: '#4ee8c8',
  muted: 'rgba(255,255,255,0.42)',
  dim: 'rgba(255,255,255,0.22)',
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
              fontFamily: FONTS.display, fontWeight: 300,
              fontSize: 26, color: '#fff', margin: 0,
              letterSpacing: '0.04em',
            }}>
              {title}
            </h1>
            <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '4px 0 0', letterSpacing: '0.06em' }}>
              Dernière mise à jour : {lastUpdate}
            </p>
          </div>
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sections.map((s) => (
            <div key={s.n} style={{ ...CARD, padding: '20px 20px' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <span style={{
                  fontFamily: FONTS.mono, fontSize: 11, color: COLORS.gold,
                  letterSpacing: '0.08em', flexShrink: 0, marginTop: 2, minWidth: 24,
                }}>
                  {s.n}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{
                    fontFamily: FONTS.display, fontWeight: 400,
                    fontSize: 18, color: '#fff', margin: '0 0 10px',
                    letterSpacing: '0.02em',
                  }}>
                    {s.title}
                  </h2>
                  {s.body && (
                    <p style={{
                      fontFamily: FONTS.mono, fontSize: 12,
                      color: COLORS.muted, margin: 0,
                      lineHeight: 1.8, letterSpacing: '0.01em',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {s.body}
                    </p>
                  )}
                  {s.list && (
                    <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
                      {s.list.map((item, i) => (
                        <li key={i} style={{
                          fontFamily: FONTS.mono, fontSize: 12, color: COLORS.muted,
                          lineHeight: 1.8, padding: '4px 0 4px 18px', position: 'relative',
                        }}>
                          <span style={{ position: 'absolute', left: 0, color: COLORS.gold }}>•</span>
                          {typeof item === 'string' ? item : (
                            <>
                              <strong style={{ color: '#fff', fontWeight: 500 }}>{item.label}</strong>
                              {item.value ? ` — ${item.value}` : ''}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.contact && (
                    <p style={{
                      fontFamily: FONTS.mono, fontSize: 12,
                      color: COLORS.muted, margin: '8px 0 0', lineHeight: 1.8,
                    }}>
                      <a href={`mailto:${s.contact}`} style={{ color: COLORS.gold, textDecoration: 'none' }}>
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
              fontFamily: FONTS.mono, fontSize: 10,
              color: 'rgba(255,255,255,0.22)', textAlign: 'center', margin: 0,
              lineHeight: 1.6, letterSpacing: '0.04em',
            }}>
              {footerNotice}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
