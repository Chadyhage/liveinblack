import { useState } from 'react'

// Logo animé "Refonte LIB" — au survol, l'étoile laser pivote à 45°, l'icône
// glisse vers la droite et le lettrage s'évapore en fumée. `size` redimensionne
// tout proportionnellement (l'icône fait `size`px, le texte glisse de size*1.4375px)
// pour s'adapter aussi bien à un grand logo qu'à une navbar compacte.
//
// La translation dépend de `size` (donc calculée à l'exécution) : on pilote
// l'animation via un état hover + transform inline plutôt que group-hover,
// car Tailwind ne peut pas générer une classe arbitraire à partir d'une
// valeur JS dynamique (il scanne le code source statiquement).
export default function AnimatedLogo({ size = 64, onClick }) {
  const [hover, setHover] = useState(false)
  const slide = size * 1.4375 // 92/64
  const fontSize = size * 0.266 // 17/64
  const ease = 'cubic-bezier(0.25,1,0.5,1)'

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative flex items-center select-none cursor-pointer bg-transparent border-none p-0"
      style={{ fontFamily: "'Syne', sans-serif", height: size, width: size + slide + fontSize * 6 }}
    >
      {/* 1. Icône graphique — pivote à 45° et glisse vers la droite */}
      <div
        className="relative flex items-center justify-center will-change-transform"
        style={{
          height: size, width: size,
          transition: `transform 0.5s ${ease}`,
          transform: hover ? `translateX(${slide}px) scale(1.05)` : 'translateX(0) scale(1)',
        }}
      >
        <div className="absolute inset-0 rounded-full opacity-60 blur-xl" style={{ background: 'rgba(232,121,249,0.05)' }} />
        <svg
          width={size} height={size} viewBox="0 0 100 100" fill="none"
          className="absolute inset-0 origin-center will-change-transform"
          style={{ transition: `transform 0.5s ${ease}`, transform: hover ? 'rotate(45deg)' : 'rotate(0deg)' }}
        >
          <path d="M50 5 L60 40 L95 50 L60 60 L50 95 L40 60 L5 50 L40 40 Z" fill="none" stroke="#e879f9" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className="relative z-10" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.9))' }}>
          <path d="M22 50C22 50 35 32 50 32C65 32 78 50 78 50" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M25 50C25 50 37 36 50 36C63 36 75 50 75 50" stroke="#ffffff" strokeWidth="1.25" strokeLinecap="round" opacity="0.6" fill="none" />
          <path d="M22 50C22 50 35 68 50 68C65 68 78 50 78 50" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M25 50C25 50 37 64 50 64C63 64 75 50 75 50" stroke="#ffffff" strokeWidth="1.25" strokeLinecap="round" opacity="0.6" fill="none" />
          <text x="50" y="52" fill="#050507" stroke="#050507" strokeWidth="4" strokeLinejoin="round" fontSize="12.5" fontFamily="sans-serif" fontWeight="900" letterSpacing="-0.2" dominantBaseline="middle" textAnchor="middle">LIB</text>
          <text x="50" y="52" fill="#ffffff" fontSize="12.5" fontFamily="sans-serif" fontWeight="900" letterSpacing="-0.2" dominantBaseline="middle" textAnchor="middle">LIB</text>
        </svg>
      </div>

      {/* 2. Lettrage — fixe sur son axe X, s'évapore en fumée au survol global */}
      <div
        className="absolute flex items-center uppercase tracking-tighter font-black select-none text-fuchsia-400 will-change-transform"
        style={{
          left: size + fontSize * 0.8, fontSize, lineHeight: 1,
          filter: 'drop-shadow(0 0 10px rgba(232,121,249,0.15))',
          transition: `opacity 0.5s ${ease}, filter 0.5s ${ease}, transform 0.5s ${ease}`,
          opacity: hover ? 0 : 1,
          transform: hover ? 'translateY(-8px)' : 'translateY(0)',
          ...(hover ? { filter: 'blur(4px) drop-shadow(0 0 10px rgba(232,121,249,0.15))' } : {}),
        }}
      >
        <div className="flex items-center relative">
          <span>L</span>
          <span className="inline-block bg-white" style={{ width: 2, height: fontSize * 0.7, margin: `0 ${fontSize * 0.18}px`, transform: 'scaleY(1.12)' }} />
          <span>VE</span>
        </div>
        <span style={{ margin: `0 ${fontSize * 0.5}px` }}>IN</span>
        <span>BLACK</span>
      </div>
    </button>
  )
}
