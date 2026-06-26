// Bouton hamburger animé "Refonte LIB" : barres émeraude qui s'écartent au
// survol, et qui se transforment en croix quand `active` (menu ouvert) — piloté
// par l'état réel d'ouverture du menu plutôt que :focus (qui ne reflète pas
// fidèlement "le menu est ouvert" une fois le focus perdu sur un clic externe).
export default function AnimatedHamburger({ active, onClick, size = 56 }) {
  return (
    <button
      onClick={onClick}
      aria-label={active ? 'Fermer le menu' : 'Ouvrir le menu'}
      className="group relative flex items-center justify-center rounded-[18px] border border-zinc-800/50 bg-[#121216] text-zinc-400 transition-all duration-300 hover:border-emerald-500/30 hover:bg-[#16161c] active:scale-95"
      style={{
        width: size, height: size,
        boxShadow: active ? '0 0 20px rgba(16,185,129,0.08)' : undefined,
        borderColor: active ? 'rgba(16,185,129,0.4)' : undefined,
      }}
    >
      <div
        className="relative flex flex-col justify-between transition-all duration-300 group-hover:h-[18px]"
        style={{ width: size * 0.357, height: active ? size * 0.286 : size * 0.286 }}
      >
        <span
          className="h-[2px] w-full rounded-full transition-all duration-300 group-hover:bg-emerald-400"
          style={{
            background: active ? '#34d399' : '#71717a',
            transformOrigin: '2px 1px',
            transform: active ? 'rotate(45deg)' : 'none',
          }}
        />
        <span
          className="h-[2px] w-full rounded-full transition-all duration-300 group-hover:bg-emerald-400"
          style={{
            background: active ? '#34d399' : '#71717a',
            transform: active ? 'scaleX(0)' : 'none',
            opacity: active ? 0 : 1,
          }}
        />
        <span
          className="h-[2px] w-full rounded-full transition-all duration-300 group-hover:bg-emerald-400"
          style={{
            background: active ? '#34d399' : '#71717a',
            transformOrigin: '2px 1.5px',
            transform: active ? 'rotate(-45deg)' : 'none',
          }}
        />
      </div>
    </button>
  )
}
