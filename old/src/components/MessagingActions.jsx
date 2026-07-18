// Composants de la messagerie (Refonte LIB) : barre de recherche sobre et
// cartes d'action "Ajouter un ami" / "Créer un groupe". Adaptés en pleine
// largeur (les maquettes étaient figées à 290px) et câblés aux handlers réels.

export function MessagingSearchBar({ value, onChange, placeholder = 'Rechercher une conversation…', onFocus, onKeyDown, inputRef, autoFocus }) {
  return (
    <div className="group relative flex h-[52px] w-full items-center overflow-hidden rounded-[14px] bg-[#0b0c12] px-3 border border-white/10 transition-colors duration-200 hover:border-white/20 focus-within:border-[#8444ff]">
      {/* Loupe */}
      <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] text-zinc-500 transition-colors duration-200 group-focus-within:text-zinc-300">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="relative z-10 h-full w-full bg-transparent pl-3 text-[14px] font-medium tracking-wide text-zinc-200 placeholder-zinc-500 outline-none"
        style={{ fontFamily: 'Inter, sans-serif', border: 'none' }}
      />
    </div>
  )
}

// MessagingQuickActions supprimé (2026-07-10) : l'en-tête de la messagerie
// utilise désormais un menu ⋮ + bouton nouvelle discussion directement dans
// MessagingPage — plus de grille de boutons d'action rapide.
