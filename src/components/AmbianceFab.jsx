import { useState, useEffect } from 'react'
import { play as playDisc, stop as stopDisc, subscribe as subMusic } from '../utils/musicEngine'

// ── Bouton flottant « Mettre l'ambiance » (expérience CONNECTÉE) ──────────────
// Reprend le bouton adoré de la vitrine publique : joue le 1er disque (House),
// « ouvre » un mini-vinyle qui tourne + un égaliseur animé. Flottant en bas à
// droite, au-dessus de la bottom-nav mobile. Le son est un singleton (musicEngine)
// donc il continue quand on navigue entre les pages.

const C = { obsidian: '#04040b', pink: '#e05aaa', violet: '#8b5cf6' }
const FONT = 'Inter, sans-serif'

// `inline` : rend le bloc dans le flux (pour l'insérer dans le hero de l'accueil)
// au lieu du mode flottant fixe. `size` = taille du vinyle.
export default function AmbianceFab({ inline = false, vinylSize = inline ? 128 : 72 }) {
  const [on, setOn] = useState(false)
  useEffect(() => subMusic(st => setOn(!!st.playing)), [])
  const toggle = () => { on ? stopDisc() : playDisc('house') }

  const keyframes = (
    <style>{`
      @keyframes lbSpin { to { transform:rotate(360deg) } }
      @keyframes lbEq { 0%,100%{ transform:scaleY(.28) } 50%{ transform:scaleY(1) } }
      @keyframes lbPulse { 0%,100%{ box-shadow:0 8px 30px -8px rgba(224,90,170,.5) } 50%{ box-shadow:0 10px 40px -6px rgba(224,90,170,.8) } }
      @media(min-width:768px){ .lb-amb-fab{ bottom:24px !important } }
    `}</style>
  )

  const button = (
    <button onClick={toggle} aria-label={on ? 'Couper l\'ambiance' : 'Mettre l\'ambiance'}
      style={{
        pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', gap: 9,
        padding: inline ? '13px 24px' : '11px 18px', borderRadius: 999, cursor: 'pointer',
        fontFamily: FONT, fontSize: inline ? 15 : 13.5, fontWeight: 700, transition: 'all .25s ease',
        color: on ? C.pink : '#fff',
        background: on ? 'rgba(224,90,170,.14)' : 'linear-gradient(135deg, rgba(139,92,246,.95), rgba(224,90,170,.92))',
        border: `1px solid ${on ? 'rgba(224,90,170,.55)' : 'rgba(255,255,255,.18)'}`,
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        boxShadow: on ? '0 8px 30px -8px rgba(224,90,170,.5)' : '0 8px 30px -8px rgba(139,92,246,.6)',
        animation: on ? 'none' : 'lbPulse 3.4s ease-in-out infinite',
      }}>
      {on ? <><Equalizer /> Ambiance en cours</> : <><span style={{ fontSize: 15 }}>♪</span> Mettre l'ambiance</>}
    </button>
  )

  if (inline) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        {keyframes}
        <div style={{
          height: on ? vinylSize : 0, width: vinylSize, opacity: on ? 1 : 0.9,
          transform: on ? 'scale(1) translateY(0)' : 'scale(.7) translateY(8px)',
          transition: 'all .5s cubic-bezier(.22,.9,.3,1)', pointerEvents: 'none',
        }}>
          <Vinyl playing={on} size={vinylSize} />
        </div>
        {button}
        <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,.4)', margin: 0 }}>
          {on ? 'Ferme les yeux, tu y es déjà.' : 'Mets-toi dans le mood.'}
        </p>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', right: 16, zIndex: 45,
      // au-dessus de la bottom-nav mobile (≈ 90px), plus bas sur desktop
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10,
      pointerEvents: 'none',
    }} className="lb-amb-fab">
      {keyframes}
      {/* Mini-vinyle qui « s'ouvre » quand l'ambiance est en cours */}
      <div style={{
        height: on ? vinylSize : 0, width: vinylSize, opacity: on ? 1 : 0,
        transform: on ? 'scale(1) translateY(0)' : 'scale(.4) translateY(14px)',
        transition: 'all .5s cubic-bezier(.22,.9,.3,1)', pointerEvents: 'none', alignSelf: 'center',
      }}>
        <Vinyl playing={on} size={vinylSize} />
      </div>
      {button}
    </div>
  )
}

function Equalizer() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2.5, height: 14 }}>
      {[0, 1, 2, 3, 4].map(i => <span key={i} style={{ width: 3, height: '100%', borderRadius: 2, background: 'currentColor', transformOrigin: 'bottom', animation: `lbEq ${0.7 + i * 0.11}s ease-in-out ${i * 0.08}s infinite` }} />)}
    </span>
  )
}

function Vinyl({ playing, size = 72 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ animation: playing ? 'lbSpin 3.4s linear infinite' : 'none', filter: 'drop-shadow(0 10px 26px rgba(224,90,170,.5))' }}>
      <defs><radialGradient id="lbFabLabel" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#e05aaa" /><stop offset="100%" stopColor="#8b5cf6" /></radialGradient></defs>
      <circle cx="50" cy="50" r="48" fill="#08080f" stroke="rgba(255,255,255,.14)" strokeWidth="0.8" />
      {[42, 36, 30, 24].map(r => <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="0.6" />)}
      <path d="M50 6 A44 44 0 0 1 94 50" fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="50" cy="50" r="15" fill="url(#lbFabLabel)" />
      <circle cx="50" cy="50" r="2.4" fill="#04040b" />
    </svg>
  )
}
