// Pastille de rôle — badge net et lisible.
// Variantes couleur : client (bleu), organisateur (violet), prestataire (doré),
// admin (rose). Fond teinté + bordure accent + texte plein.

const VARIANTS = {
  client:       { label: 'Client',       color: '#60a5fa', bg: 'rgba(96,165,250,0.14)',  border: 'rgba(96,165,250,0.35)' },
  user:         { label: 'Client',       color: '#60a5fa', bg: 'rgba(96,165,250,0.14)',  border: 'rgba(96,165,250,0.35)' },
  organisateur: { label: 'Organisateur', color: '#a78bfa', bg: 'rgba(167,139,250,0.14)', border: 'rgba(167,139,250,0.35)' },
  prestataire:  { label: 'Prestataire',  color: '#d7b46a', bg: 'rgba(215,180,106,0.14)', border: 'rgba(215,180,106,0.35)' },
  agent:        { label: 'Admin',        color: '#fb7185', bg: 'rgba(251,113,133,0.14)', border: 'rgba(251,113,133,0.35)' },
}

export default function RoleBadge({ role, label }) {
  const v = VARIANTS[role] || VARIANTS.client
  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: 7, padding: '6px 12px', borderRadius: 8,
        background: v.bg, border: `1px solid ${v.border}`,
        fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.04em', textTransform: 'uppercase',
        color: v.color, whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
      {label || v.label}
    </span>
  )
}
