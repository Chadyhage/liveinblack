// Moteur de musique procédural (Web Audio) — "disques" générés en temps réel.
//
// Pourquoi procédural ? Aucun fichier audio à héberger, aucun souci de droits,
// ça marche toujours (offline inclus), et chaque "disque" = une ambiance
// distincte (House, Afro, Techno, Lo-Fi, Nuit). Le son démarre uniquement sur
// un geste utilisateur (clic) → conforme aux règles d'autoplay des navigateurs.
//
// Le moteur est un SINGLETON module : la musique continue quand on navigue
// entre les pages (l'UI MusicPlayer est démontée/remontée, pas le son).

export const DISCS = [
  { id: 'house',  name: 'House',  bpm: 124, color: '#e05aaa', desc: '4/4 chaud, claps' },
  { id: 'afro',   name: 'Afro',   bpm: 112, color: '#34d399', desc: 'Percu & marimba' },
  { id: 'techno', name: 'Techno', bpm: 130, color: '#8b5cf6', desc: 'Sombre & roulant' },
  { id: 'lofi',   name: 'Lo-Fi',  bpm: 84,  color: '#c8a96e', desc: 'Jazzy, posé' },
  { id: 'nuit',   name: 'Nuit',   bpm: 68,  color: '#60a5fa', desc: 'Nappes ambient' },
]

const mtof = m => 440 * Math.pow(2, (m - 69) / 12)
const VOL_KEY = 'lib_music_volume'
const DISC_KEY = 'lib_music_disc'

let ctx = null, master = null, comp = null, delay = null, delayGain = null
let crackleSrc = null
let playing = false, schedulerId = null
let curDiscIdx = 0, step = 0, bar = 0, nextTime = 0
let volume = (() => { const v = parseFloat(localStorage.getItem(VOL_KEY)); return Number.isFinite(v) ? v : 0.5 })()
const listeners = new Set()

const LOOKAHEAD = 0.025, SCHEDULE_AHEAD = 0.12

function notify() { listeners.forEach(cb => { try { cb(getState()) } catch {} }) }
export function subscribe(cb) { listeners.add(cb); cb(getState()); return () => listeners.delete(cb) }
export function getState() {
  return { playing, disc: DISCS[curDiscIdx], discId: DISCS[curDiscIdx]?.id, volume }
}

function ensureGraph() {
  if (ctx) return
  ctx = new (window.AudioContext || window.webkitAudioContext)()
  master = ctx.createGain(); master.gain.value = volume
  comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2
  // Envoi delay (espace/dub)
  delay = ctx.createDelay(1.0); delay.delayTime.value = 0.34
  delayGain = ctx.createGain(); delayGain.gain.value = 0.28
  const dFilter = ctx.createBiquadFilter(); dFilter.type = 'lowpass'; dFilter.frequency.value = 2200
  delay.connect(dFilter); dFilter.connect(delayGain); delayGain.connect(delay); delayGain.connect(comp)
  master.connect(comp); comp.connect(ctx.destination)
}

// ── Voix ──────────────────────────────────────────────────────────────────────
function kick(t, g = 1) {
  const o = ctx.createOscillator(), gain = ctx.createGain()
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.11)
  gain.gain.setValueAtTime(g, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26)
  o.connect(gain); gain.connect(master); o.start(t); o.stop(t + 0.3)
}
function noiseBuf(dur) {
  const b = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate)
  const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return b
}
function hat(t, open = false, g = 0.3) {
  const dur = open ? 0.17 : 0.04
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(dur)
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500
  const gain = ctx.createGain(); gain.gain.setValueAtTime(g, t); gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
  s.connect(hp); hp.connect(gain); gain.connect(master); s.start(t); s.stop(t + dur)
}
function clap(t, g = 0.4) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(0.16)
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 0.8
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(g, t + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
  s.connect(bp); bp.connect(gain); gain.connect(master); gain.connect(delay); s.start(t); s.stop(t + 0.16)
}
function bass(t, freq, dur, g = 0.5, type = 'sawtooth') {
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), gain = ctx.createGain()
  o.type = type; o.frequency.value = freq
  f.type = 'lowpass'; f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(160, t + dur); f.Q.value = 6
  gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(g, t + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(f); f.connect(gain); gain.connect(master); o.start(t); o.stop(t + dur + 0.02)
}
function chord(t, notes, dur, g = 0.16, send = true) {
  notes.forEach((m, i) => {
    const o = ctx.createOscillator(), gain = ctx.createGain()
    o.type = 'triangle'; o.frequency.value = mtof(m) * (i ? 1.004 : 1)
    gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(g, t + Math.min(0.08, dur * 0.3))
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(gain); gain.connect(master); if (send) gain.connect(delay); o.start(t); o.stop(t + dur + 0.05)
  })
}
function pluck(t, m, g = 0.24, type = 'triangle') {
  const o = ctx.createOscillator(), gain = ctx.createGain()
  o.type = type; o.frequency.value = mtof(m)
  gain.gain.setValueAtTime(g, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28)
  o.connect(gain); gain.connect(master); gain.connect(delay); o.start(t); o.stop(t + 0.3)
}

// ── Motifs par disque ───────────────────────────────────────────────────────
// Chaque fonction joue ce qu'il faut au pas `s` (0..15) du temps `t`.
const PAT = {
  house(s, b, t) {
    const prog = [45, 41, 48, 43] // Am F C G (basse)
    const r = prog[b % 4]
    if (s % 4 === 0) kick(t, 1)
    if (s % 2 === 1) hat(t, false, 0.16)
    if (s === 2 || s === 6 || s === 10 || s === 14) hat(t, true, 0.2)
    if (s === 4 || s === 12) clap(t, 0.4)
    if ([0, 3, 6, 8, 11, 14].includes(s)) bass(t, mtof(r), 0.16, 0.5)
    if (s === 4 || s === 12) chord(t, [r + 24, r + 27, r + 31], 0.2, 0.13)
  },
  afro(s, b, t) {
    const pent = [57, 60, 62, 64, 67, 69] // A C D E G A
    const roots = [45, 50, 43, 48]
    const r = roots[b % 4]
    if (s === 0 || s === 6 || s === 10) kick(t, 0.95)
    if (s % 2 === 0) hat(t, false, 0.12)
    if (s === 4 || s === 12) clap(t, 0.22)
    if ([0, 3, 7, 8, 11].includes(s)) bass(t, mtof(r), 0.2, 0.42)
    // marimba pentatonique
    if ([0, 2, 5, 6, 9, 11, 13].includes(s)) {
      const note = pent[(s + b * 3) % pent.length] + (s > 8 ? 12 : 0)
      pluck(t, note, 0.18, 'triangle')
    }
  },
  techno(s, b, t) {
    const r = 41 // F-ish dark root with movement
    if (s % 4 === 0) kick(t, 1)
    hat(t, false, s % 4 === 2 ? 0.18 : 0.1)
    if (s === 14) hat(t, true, 0.16)
    // basse roulante 16e (offbeat)
    if (s % 2 === 1) bass(t, mtof(r + (s % 8 === 7 ? 12 : 0)), 0.12, 0.4, 'square')
    if (b % 2 === 1 && s === 4) chord(t, [r + 24, r + 30, r + 36], 0.16, 0.1)
  },
  lofi(s, b, t) {
    // Cmaj7 Am7 Dm7 G7 — voicings doux
    const chords = [[48, 52, 55, 59], [45, 48, 52, 55], [50, 53, 57, 60], [43, 47, 50, 53]]
    const c = chords[b % 4]
    if (s === 0 || s === 8) kick(t, 0.8)
    if (s === 10) kick(t, 0.3)
    if (s === 4 || s === 12) clap(t, 0.22)
    if (s % 2 === 0) hat(t, false, 0.09)
    if (s === 0) chord(t, c, 1.7, 0.12)         // nappe sur 2 temps
    if ([0, 6].includes(s)) bass(t, mtof(c[0] - 12), 0.4, 0.38, 'sine')
  },
  nuit(s, b, t) {
    // Am9 — Fmaj7 — nappes longues, pas de batterie
    const chords = [[57, 60, 64, 67, 71], [53, 57, 60, 64], [55, 59, 62, 66], [52, 55, 59, 62]]
    const c = chords[Math.floor(b / 2) % 4]
    if (s === 0 && b % 2 === 0) chord(t, c, 4.2, 0.1)
    if (s === 0) bass(t, mtof(c[0] - 24), 3.8, 0.22, 'sine')
    if ((s === 5 || s === 11) && Math.random() < 0.5) pluck(t, c[2 + (s % 2)] + 12, 0.12, 'sine')
  },
}

function scheduler() {
  if (!ctx) return
  const disc = DISCS[curDiscIdx]
  const sec16 = (60 / disc.bpm) / 4
  const swing = disc.id === 'lofi' ? 0.22 : 0
  while (nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
    const t = nextTime + (swing && step % 2 === 1 ? sec16 * swing : 0)
    try { PAT[disc.id](step, bar, t) } catch {}
    nextTime += sec16
    step++; if (step >= 16) { step = 0; bar++ }
  }
}

function startCrackle() {
  if (!ctx || crackleSrc || (DISCS[curDiscIdx].id !== 'lofi')) return
  const src = ctx.createBufferSource()
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() < 0.0008) ? (Math.random() * 2 - 1) : 0
  src.buffer = b; src.loop = true
  const g = ctx.createGain(); g.gain.value = 0.5
  src.connect(g); g.connect(master); src.start()
  crackleSrc = src
}
function stopCrackle() { if (crackleSrc) { try { crackleSrc.stop() } catch {} crackleSrc = null } }

export async function play(discId) {
  ensureGraph()
  if (ctx.state === 'suspended') { try { await ctx.resume() } catch {} }
  if (discId) { const i = DISCS.findIndex(d => d.id === discId); if (i >= 0) curDiscIdx = i }
  try { localStorage.setItem(DISC_KEY, DISCS[curDiscIdx].id) } catch {}
  step = 0; bar = 0; nextTime = ctx.currentTime + 0.06
  playing = true
  stopCrackle(); startCrackle()
  if (schedulerId) clearInterval(schedulerId)
  schedulerId = setInterval(scheduler, LOOKAHEAD * 1000)
  notify()
}

export function stop() {
  playing = false
  if (schedulerId) { clearInterval(schedulerId); schedulerId = null }
  stopCrackle()
  notify()
}

export function toggle(discId) {
  if (playing && (!discId || DISCS[curDiscIdx].id === discId)) stop()
  else play(discId)
}

export function playRandom() {
  let i = Math.floor(Math.random() * DISCS.length)
  if (playing && DISCS.length > 1 && i === curDiscIdx) i = (i + 1) % DISCS.length
  play(DISCS[i].id)
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v))
  try { localStorage.setItem(VOL_KEY, String(volume)) } catch {}
  if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02)
  notify()
}

export function getSavedDiscId() {
  return localStorage.getItem(DISC_KEY) || DISCS[0].id
}
