// Pastille de rôle "puce technologique" — Refonte LIB.
// Variantes couleur : client (bleu), organisateur (violet), prestataire (doré),
// admin (rose). Reprend exactement le design des maquettes (micro-puce + texte
// en dégradé). `size` 'sm' pour les contextes compacts (header du menu).

const VARIANTS = {
  client:       { label: 'Client',       border: 'rgba(59,130,246,0.20)',  bg: '#11131a', chipBg: 'rgba(59,130,246,0.10)',  chipBorder: 'rgba(96,165,250,0.20)',  chip: '#60a5fa', to: '#bfdbfe' },
  user:         { label: 'Client',       border: 'rgba(59,130,246,0.20)',  bg: '#11131a', chipBg: 'rgba(59,130,246,0.10)',  chipBorder: 'rgba(96,165,250,0.20)',  chip: '#60a5fa', to: '#bfdbfe' },
  organisateur: { label: 'Organisateur', border: 'rgba(139,92,246,0.20)',  bg: '#13111a', chipBg: 'rgba(139,92,246,0.10)',  chipBorder: 'rgba(167,139,250,0.20)', chip: '#a78bfa', to: '#c4b5fd' },
  prestataire:  { label: 'Prestataire',  border: 'rgba(215,180,106,0.20)', bg: '#151310', chipBg: 'rgba(215,180,106,0.10)', chipBorder: 'rgba(215,180,106,0.20)', chip: '#D7B46A', to: '#E7C987' },
  agent:        { label: 'Admin',        border: 'rgba(244,63,94,0.20)',   bg: '#1a1113', chipBg: 'rgba(244,63,94,0.10)',   chipBorder: 'rgba(251,113,133,0.20)', chip: '#fb7185', to: '#fda4af' },
}

export default function RoleBadge({ role, label }) {
  const v = VARIANTS[role] || VARIANTS.client
  return (
    <div
      className="inline-flex items-center rounded-xl pl-2 pr-3"
      style={{ height: 32, border: `1px solid ${v.border}`, background: v.bg, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
    >
      {/* Micro-puce */}
      <div
        className="flex flex-col justify-between rounded p-[3px]"
        style={{ height: 18, width: 24, background: v.chipBg, border: `1px solid ${v.chipBorder}`, color: v.chip }}
      >
        <div className="flex justify-between" style={{ height: 3.5 }}>
          <span className="rounded-sm" style={{ width: 4, background: 'currentColor', opacity: 0.6 }} />
          <span className="rounded-sm" style={{ width: 8, background: 'currentColor' }} />
          <span className="rounded-sm" style={{ width: 4, background: 'currentColor', opacity: 0.6 }} />
        </div>
        <div className="flex justify-between" style={{ height: 3.5 }}>
          <span className="rounded-sm" style={{ width: 6, background: 'currentColor' }} />
          <span className="rounded-sm" style={{ width: 4, background: 'currentColor', opacity: 0.4 }} />
          <span className="rounded-sm" style={{ width: 6, background: 'currentColor' }} />
        </div>
      </div>
      <span
        className="pl-2.5 font-bold tracking-wide"
        style={{
          fontFamily: 'Inter, sans-serif', fontSize: 12,
          // backgroundImage (longhand) plutôt que `background` (raccourci) :
          // le raccourci `background` réinitialise background-clip dans la
          // cascade CSS, ce qui annulait l'effet "texte en dégradé" et
          // laissait voir un bloc plein au lieu du texte.
          backgroundImage: `linear-gradient(to right, #e4e4e7, ${v.to})`,
          WebkitBackgroundClip: 'text', backgroundClip: 'text',
          WebkitTextFillColor: 'transparent', color: 'transparent',
        }}
      >
        {label || v.label}
      </span>
    </div>
  )
}
