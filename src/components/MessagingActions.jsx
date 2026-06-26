// Composants de la messagerie (Refonte LIB) : barre de recherche à laser
// émeraude + loupe essuie-glace, et cartes d'action "Ajouter un ami" (émeraude)
// / "Créer un groupe" (doré). Adaptés en pleine largeur (les maquettes étaient
// figées à 290px) et câblés aux handlers réels.

export function MessagingSearchBar({ value, onChange, placeholder = 'Rechercher une conversation…' }) {
  return (
    <div className="group relative flex h-[52px] w-full items-center overflow-hidden rounded-[18px] bg-[#121216] px-3 border border-zinc-800/50 transition-all duration-300 hover:border-emerald-500/30 hover:bg-[#16161c] focus-within:border-emerald-500/50 focus-within:bg-[#121216] focus-within:shadow-[0_0_25px_rgba(16,185,129,0.12)]">
      {/* Laser émeraude qui sillonne le bord supérieur */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100 group-hover:animate-laser-sweep group-focus-within:animate-laser-sweep" />
      {/* Loupe (carré émeraude + mouvement essuie-glace) */}
      <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-transparent text-zinc-500 transition-all duration-300 group-hover:bg-[#1a2e26] group-hover:text-emerald-400 group-focus-within:bg-[#1a2e26] group-focus-within:text-emerald-400 group-hover:animate-wiper-search group-focus-within:animate-wiper-search">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="relative z-10 h-full w-full bg-transparent pl-3 text-[14px] font-medium tracking-wide text-zinc-200 placeholder-zinc-500 outline-none"
        style={{ fontFamily: 'Inter, sans-serif', border: 'none' }}
      />
    </div>
  )
}

const CARD_VARIANTS = {
  friend: {
    iconBg: 'group-hover:bg-[#1a2e26] group-hover:text-emerald-400',
    plusBg: 'bg-[#1a2e26] text-emerald-400',
    plusHover: 'group-hover:text-emerald-300 group-hover:drop-shadow-[0_4px_6px_rgba(16,185,129,0.5)]',
    title: 'text-zinc-200 group-hover:text-white',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:scale-105">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  group: {
    iconBg: 'group-hover:bg-[#231f1a] group-hover:text-[#D7B46A]',
    plusBg: 'bg-[#231f1a] text-[#D7B46A]',
    plusHover: 'group-hover:text-[#F0D18A] group-hover:drop-shadow-[0_4px_6px_rgba(215,180,106,0.4)]',
    title: 'text-zinc-300 group-hover:text-[#F0D18A]',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:scale-105">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
}

export function MessagingActionCard({ variant = 'friend', title, onClick, badge }) {
  const v = CARD_VARIANTS[variant]
  const spin = variant === 'friend' ? 'group-hover:animate-spin-decel' : 'group-hover:animate-spin-decel'
  return (
    <button onClick={onClick}
      className="group flex h-[64px] w-full items-center rounded-[20px] bg-[#121216] p-2 text-left transition-all duration-300 hover:bg-[#16161c] hover:shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
      style={{ border: 'none', cursor: 'pointer' }}>
      {/* Icône */}
      <div className={`relative flex h-full w-[48px] items-center justify-center rounded-[16px] bg-[#1a1a22] text-zinc-400 transition-all duration-300 ${v.iconBg}`}>
        {v.icon}
        {badge > 0 && (
          <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1" style={{ background: '#e05aaa', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 9, fontWeight: 700, border: '2px solid #121216' }}>{badge}</span>
        )}
      </div>
      {/* Texte */}
      <span className={`pl-4 text-[14px] font-bold tracking-wide transition-colors ${v.title}`} style={{ fontFamily: 'Inter, sans-serif' }}>
        {title}
      </span>
      {/* Bouton + */}
      <span className={`relative ml-auto flex h-[48px] w-[48px] items-center justify-center rounded-[16px] transition-all duration-300 ${v.plusBg}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-all duration-300 group-hover:scale-150 ${spin} ${v.plusHover}`}>
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </span>
    </button>
  )
}
