// Son de notification — simple, unique, robuste.
//
// Bug historique : chaque bip créait un `new AudioContext()`. Les navigateurs
// limitent le nombre de contextes audio (~6) ; après quelques notifications,
// la création échouait silencieusement et plus aucun son ne sortait — d'où
// l'impression que « ça déconne ». Ici on réutilise UN SEUL contexte.

let _ctx = null
let _lastPlay = 0

// Réveille le contexte au premier geste utilisateur (les navigateurs suspendent
// l'audio tant qu'il n'y a pas eu d'interaction). Appelé automatiquement.
function ensureContext() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!_ctx) {
    _ctx = new AC()
    // Tente de débloquer l'audio dès la première interaction.
    const unlock = () => { if (_ctx && _ctx.state === 'suspended') _ctx.resume().catch(() => {}) }
    window.addEventListener('pointerdown', unlock, { once: false })
    window.addEventListener('keydown', unlock, { once: false })
  }
  if (_ctx.state === 'suspended') _ctx.resume().catch(() => {})
  return _ctx
}

/**
 * Joue un bip de notification court et discret.
 * Anti-spam intégré : au plus un bip toutes les 800 ms (évite la rafale quand
 * plusieurs messages arrivent d'un coup, et les double-déclenchements).
 */
export function playNotifSound() {
  try {
    const now = Date.now()
    if (now - _lastPlay < 800) return
    const ctx = ensureContext()
    if (!ctx) return
    _lastPlay = now
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.type = 'sine'
    o.frequency.setValueAtTime(880, t)
    o.frequency.exponentialRampToValueAtTime(620, t + 0.12)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
    o.start(t)
    o.stop(t + 0.32)
  } catch {}
}
