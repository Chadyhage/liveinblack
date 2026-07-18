// Fond « Filigrane rose » (handoff design 4a) — papier rose pâle avec le nom
// du site répété en filigrane. Fond CLAIR : les pages posées dessus doivent
// utiliser du texte encre (#0B0B12), pas blanc — réserver à des pages choisies.
//
// ⚠️ Le glissement au scroll (parallaxe transformant 5 grands textes à chaque
// frame) faisait ramer / « buger » le site (surtout mobile). Retiré : le
// filigrane est désormais STATIQUE — même rendu, zéro coût au scroll.

const TXT = Array(8).fill('LIVE IN BLACK').join(' · ') // couvre ≥ 2× la largeur du viewport

// offsetD/offsetM : décalage horizontal desktop/mobile (fixe, plus de scroll).
const LINES = [
  { color: 'rgba(255,77,166,0.07)',  offsetD: -60,  offsetM: -40 },
  { color: 'rgba(132,68,255,0.055)', offsetD: -420, offsetM: -260 },
  { color: 'rgba(11,11,18,0.03)',    offsetD: -220, offsetM: -140 },
  { color: 'rgba(255,77,166,0.055)', offsetD: -560, offsetM: -340 },
  { color: 'rgba(132,68,255,0.05)',  offsetD: -80,  offsetM: -80, mobileOnly: true },
]

export default function FiligraneRoseBg() {
  return (
    <div aria-hidden="true" style={{
      position: 'fixed', inset: 0, zIndex: 0,
      pointerEvents: 'none', overflow: 'hidden',
      background: 'radial-gradient(circle at 80% 0%, rgba(132,68,255,0.05), transparent 40%), linear-gradient(180deg, #FBF0F6 0%, #F6E2ED 100%)',
    }}>
      <style>{`
        .flg-line {
          white-space: nowrap; margin: 0; line-height: 0.9;
          font-family: Inter, system-ui, sans-serif; font-weight: 900;
          font-size: 88px; letter-spacing: -3px;
          margin-left: var(--off-d);
          user-select: none; -webkit-user-select: none;
        }
        .flg-mobile-only { display: none; }
        @media (max-width: 767px) {
          .flg-line { font-size: 56px; letter-spacing: -2px; margin-left: var(--off-m); }
          .flg-mobile-only { display: block; }
        }
      `}</style>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', overflow: 'hidden' }}>
        {LINES.map((line, i) => (
          <p
            key={i}
            className={`flg-line${line.mobileOnly ? ' flg-mobile-only' : ''}`}
            style={{ color: line.color, '--off-d': `${line.offsetD}px`, '--off-m': `${line.offsetM}px` }}
          >
            {TXT}
          </p>
        ))}
      </div>
    </div>
  )
}
