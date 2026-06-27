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

const QUICK_VARIANTS = {
  friend: {
    iconBg: 'group-hover:bg-[#1a2e26] group-hover:text-emerald-400',
    border: 'hover:border-emerald-500/25',
    title: 'group-hover:text-white',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
      </svg>
    ),
  },
  group: {
    iconBg: 'group-hover:bg-[#231f1a] group-hover:text-[#D7B46A]',
    border: 'hover:border-[#D7B46A]/25',
    title: 'group-hover:text-[#F0D18A]',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
}

// Bouton d'action compact (moitié de ligne). Remplace les grosses cartes.
function QuickAction({ variant, title, onClick, badge }) {
  const v = QUICK_VARIANTS[variant]
  return (
    <button onClick={onClick}
      className={`group flex flex-1 items-center gap-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 transition-all duration-300 hover:bg-white/[0.04] ${v.border}`}
      style={{ cursor: 'pointer', minWidth: 0 }}>
      <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#1a1a22] text-zinc-400 transition-all duration-300 ${v.iconBg}`}>
        {v.icon}
        {badge > 0 && (
          <span className="absolute -top-1 -right-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1" style={{ background: '#e05aaa', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 8.5, fontWeight: 700, border: '2px solid #0b0d12' }}>{badge}</span>
        )}
      </span>
      <span className={`truncate text-[12.5px] font-bold tracking-wide text-zinc-300 transition-colors ${v.title}`} style={{ fontFamily: 'Inter, sans-serif' }}>
        {title}
      </span>
    </button>
  )
}

export function MessagingQuickActions({ onAddFriend, onCreateGroup, friendBadge }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <QuickAction variant="friend" title="Ajouter un ami" onClick={onAddFriend} badge={friendBadge} />
      <QuickAction variant="group" title="Créer un groupe" onClick={onCreateGroup} />
    </div>
  )
}
