// src/styles/ui.js
// Design system LIVEINBLACK — recettes de styles partagées (refonte 2026-07).
// Objets de style inline prêts à étaler : style={{ ...ui.btnPrimary, width: '100%' }}
// Règle : surfaces opaques, accents portés par bordures/icônes, pas de glow gratuit.

const FONT = 'Inter, sans-serif'

export const ui = {
  // ── Boutons ──────────────────────────────────────────────────────────────
  btnPrimary: {
    padding: '13px 20px', borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)',
    color: '#fff', font: `700 14px ${FONT}`, cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(122,59,242,0.35)',
  },
  btnSecondary: {
    padding: '12px 18px', borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.9)', font: `600 14px ${FONT}`, cursor: 'pointer',
  },
  btnTeal: {
    padding: '12px 18px', borderRadius: 12, border: 'none',
    background: '#3ed6b5', color: '#04120e',
    font: `700 14px ${FONT}`, cursor: 'pointer',
  },
  btnDanger: {
    padding: '12px 18px', borderRadius: 12, border: 'none',
    background: '#c2347f', color: '#fff',
    font: `700 14px ${FONT}`, cursor: 'pointer',
  },
  btnDangerSoft: {
    padding: '10px 16px', borderRadius: 12,
    border: '1px solid rgba(224,90,170,0.55)',
    background: 'rgba(224,90,170,0.14)', color: '#ff9ed2',
    font: `700 13px ${FONT}`, cursor: 'pointer',
  },
  btnDisabled: {
    background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.35)',
    border: '1px solid rgba(255,255,255,0.06)', cursor: 'not-allowed', boxShadow: 'none',
  },

  // ── Surfaces ─────────────────────────────────────────────────────────────
  card: {
    background: '#0e0f16', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  },
  cardElevated: {
    background: '#12131c', border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
  },
  inset: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12,
  },
  modalBackdrop: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(3,4,8,0.72)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modalSheet: {
    background: '#12131c', border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
    width: '100%', maxWidth: 440, maxHeight: '86vh', overflowY: 'auto',
  },

  // ── Formulaires ──────────────────────────────────────────────────────────
  input: {
    width: '100%', background: '#0b0c12',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
    padding: '12px 14px', font: `500 14px ${FONT}`,
    color: 'rgba(255,255,255,0.92)', outline: 'none',
  },
  label: {
    display: 'block', font: `600 12px ${FONT}`,
    color: 'rgba(255,255,255,0.6)', marginBottom: 6,
  },

  // ── Divers ───────────────────────────────────────────────────────────────
  /** Badge teinté — passer une couleur d'accent hex (#4ee8c8, #c8a96e, #e05aaa, #8444ff) */
  badge: (hex) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 10px', borderRadius: 8,
    background: hexToRgba(hex, 0.14), border: `1px solid ${hexToRgba(hex, 0.35)}`,
    color: hex, font: `700 11px ${FONT}`, letterSpacing: '0.04em', textTransform: 'uppercase',
  }),
  emptyWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 10, padding: '40px 24px', textAlign: 'center',
  },
  emptyIcon: {
    width: 56, height: 56, borderRadius: '50%',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  spinner: {
    width: 14, height: 14, display: 'inline-block', borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
    verticalAlign: '-2px',
  },
  text: {
    primary: 'rgba(255,255,255,0.93)',
    secondary: 'rgba(255,255,255,0.55)',
    tertiary: 'rgba(255,255,255,0.38)',
  },
}

function hexToRgba(hex, a) {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export default ui
