// Mascotte du site — petit DJ rond, casque sur les oreilles, cohérent avec
// l'identité "nightlife" de LIVEINBLACK. Un seul SVG réutilisé partout où il
// faut illustrer une page vide/une erreur (404, listes vides, erreurs
// d'exécution) plutôt qu'une icône générique isolée — `mood` change juste le
// visage (yeux/bouche) pour coller au contexte, le corps reste identique
// pour que la mascotte reste reconnaissable d'un écran à l'autre. Pure SVG +
// CSS (`@keyframes`, même convention que le reste du design system, voir
// CLAUDE.md) — aucune dépendance d'animation.
export type MascotMood = 'happy' | 'confused' | 'sad' | 'sleeping'

export default function Mascot({ mood = 'happy', size = 140 }: { mood?: MascotMood; size?: number }) {
  return (
    <div style={{ width: size, height: size, margin: '0 auto' }}>
      <style>{`
        @keyframes lb-mascot-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes lb-mascot-blink {
          0%, 92%, 100% { transform: scaleY(1); }
          96% { transform: scaleY(0.1); }
        }
        @keyframes lb-mascot-note {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translate(10px, -26px) rotate(18deg); opacity: 0; }
        }
        .lb-mascot { animation: lb-mascot-float 3.2s ease-in-out infinite; transform-origin: center; }
        .lb-mascot-eye { animation: lb-mascot-blink 4.5s ease-in-out infinite; transform-origin: center; }
        .lb-mascot-note { animation: lb-mascot-note 2.4s ease-in-out infinite; }
        .lb-mascot-note--delay { animation-delay: 1.1s; }
        @media (prefers-reduced-motion: reduce) {
          .lb-mascot, .lb-mascot-eye, .lb-mascot-note { animation: none; }
        }
      `}</style>
      <svg viewBox="0 0 140 140" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
        <g className="lb-mascot">
          {/* Ombre portée */}
          <ellipse cx="70" cy="122" rx="30" ry="6" fill="var(--primary)" opacity="0.12" />

          {/* Notes de musique flottantes — seulement pour l'humeur "happy" */}
          {mood === 'happy' && (
            <>
              <g className="lb-mascot-note" style={{ transformOrigin: '108px 46px' }}>
                <path d="M108 34v16a4 4 0 1 1-2-3.46V34h2z" fill="var(--primary)" />
              </g>
              <g className="lb-mascot-note lb-mascot-note--delay" style={{ transformOrigin: '30px 40px' }}>
                <path d="M30 30v14a3.4 3.4 0 1 1-1.7-2.95V30h1.7z" fill="var(--primary)" />
              </g>
            </>
          )}

          {/* Corps */}
          <circle cx="70" cy="72" r="42" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3" />

          {/* Casque audio */}
          <path d="M34 66a36 36 0 0 1 72 0" stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" fill="none" />
          <rect x="24" y="60" width="14" height="22" rx="6" fill="var(--primary)" />
          <rect x="102" y="60" width="14" height="22" rx="6" fill="var(--primary)" />

          {/* Visage */}
          {mood === 'sleeping' ? (
            <>
              <path d="M52 74q6 6 12 0" stroke="var(--obsidian)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
              <path d="M76 74q6 6 12 0" stroke="var(--obsidian)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
              <path d="M64 92q6 4 12 0" stroke="var(--obsidian)" strokeWidth="3" strokeLinecap="round" fill="none" />
              <text x="96" y="52" fontSize="14" fill="var(--primary)" fontFamily="var(--font-display), sans-serif">z</text>
              <text x="106" y="42" fontSize="10" fill="var(--primary)" fontFamily="var(--font-display), sans-serif">z</text>
            </>
          ) : (
            <>
              <ellipse className="lb-mascot-eye" cx="58" cy="74" rx="4.5" ry="6" fill="var(--obsidian)" />
              <ellipse className="lb-mascot-eye" cx="82" cy="74" rx="4.5" ry="6" fill="var(--obsidian)" />
              {mood === 'happy' && <path d="M58 90q12 10 24 0" stroke="var(--obsidian)" strokeWidth="3.5" strokeLinecap="round" fill="none" />}
              {mood === 'confused' && (
                <>
                  <path d="M58 92q12 -6 24 0" stroke="var(--obsidian)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                  <text x="92" y="50" fontSize="20" fontWeight="800" fill="var(--primary)" fontFamily="var(--font-display), sans-serif">?</text>
                </>
              )}
              {mood === 'sad' && <path d="M58 94q12 -8 24 0" stroke="var(--obsidian)" strokeWidth="3.5" strokeLinecap="round" fill="none" />}
            </>
          )}
        </g>
      </svg>
    </div>
  )
}
