// Moteur de musique procédural (Web Audio) — "disques" générés en temps réel
// avec support hybride pour les fichiers MP3 réels fournis par le client.
//
// Pourquoi ce système ? Il joue les fichiers audios réels (.mp3) s'ils existent
// (House, Afro, Lo-Fi) et bascule sur le synthétiseur procédural Web Audio
// si aucun fichier n'est disponible (Techno, Nuit).
//
// Le moteur est un SINGLETON module : la musique continue quand on navigue
// entre les pages (l'UI AmbientMusicPlayer est démontée/remontée, pas le son).
//
// La persistance (volume + dernier disque) est gatée derrière le consentement
// cookies ("préférences fonctionnelles", cf. lib/shared/cookieConsent.ts) :
// tant que l'utilisateur n'a pas accepté, l'écriture est un no-op silencieux.

import { getFunctionalPreference, setFunctionalPreference } from '@/lib/shared/cookieConsent'

export interface Disc {
  id: string
  name: string
  bpm: number
  color: string
  desc: string
}

export interface CustomTrack {
  title: string
  artist: string
  cover: string | null
  previewUrl: string
}

export interface MusicState {
  playing: boolean
  disc: Disc | undefined
  discId: string | undefined
  volume: number
  track: CustomTrack | null
}

export const DISCS: Disc[] = [
  { id: 'house', name: 'House', bpm: 124, color: '#e05aaa', desc: '4/4 chaud, claps' },
  { id: 'afro', name: 'Afro', bpm: 112, color: '#34d399', desc: 'Percu & marimba' },
  { id: 'techno', name: 'Techno', bpm: 130, color: '#8b5cf6', desc: 'Sombre & roulant' },
  { id: 'lofi', name: 'Lo-Fi', bpm: 84, color: '#c8a96e', desc: 'Jazzy, posé' },
  { id: 'nuit', name: 'Nuit', bpm: 68, color: '#60a5fa', desc: 'Nappes ambient' },
]

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
const VOL_KEY = 'lib_music_volume'
const DISC_KEY = 'lib_music_disc'

// Fichiers MP3 réels
const ACTIVE_MP3S: Record<string, string> = {
  house: '/music_house.mp3',
  afro: '/music_afro.mp3',
  lofi: '/music_lofi.mp3',
  techno: '/music_techno.mp3',
}

function readPreference(key: string, fallback: string) {
  if (typeof window === 'undefined') return fallback
  try {
    return getFunctionalPreference(key, fallback) ?? fallback
  } catch {
    return fallback
  }
}
function writePreference(key: string, value: string) {
  if (typeof window === 'undefined') return
  try {
    // No-op silencieux tant que l'utilisateur n'a pas accepté les préférences
    // fonctionnelles (cf. lib/shared/cookieConsent.ts:allowsFunctionalPreferences).
    setFunctionalPreference(key, value)
  } catch {
    // stockage indisponible (navigation privée, quota…) — silencieux, comme le legacy
  }
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
let comp: DynamicsCompressorNode | null = null
let delayNode: DelayNode | null = null
let delayGain: GainNode | null = null
let crackleSrc: AudioBufferSourceNode | null = null
let playing = false
let schedulerId: ReturnType<typeof setInterval> | null = null
let curDiscIdx = 0
let step = 0
let bar = 0
let nextTime = 0
let volume = 0.5
let preferencesLoaded = false
const listeners = new Set<(state: MusicState) => void>()

let audioHtmlElement: HTMLAudioElement | null = null

// Piste custom (recherche iTunes) : descriptor { title, artist, cover, previewUrl }
// publié dans l'état des subscribers pour que l'UI affiche titre/artiste.
let customTrack: CustomTrack | null = null

const LOOKAHEAD = 0.025
const SCHEDULE_AHEAD = 0.12

// Snapshot mémoïsé : requis par useSyncExternalStore côté composant (il exige
// une référence stable tant que rien n'a changé, sous peine de re-render en
// boucle) — reconstruit uniquement quand l'état sous-jacent bouge réellement.
let currentSnapshot: MusicState = { playing: false, disc: DISCS[0], discId: DISCS[0]?.id, volume, track: null }
// Snapshot serveur figé : jamais reconstruit, ne touche jamais à localStorage.
// C'est ce que React utilise pendant le rendu serveur et la 1re passe
// d'hydratation côté client, avant de resynchroniser sur le vrai état.
const SERVER_SNAPSHOT: MusicState = currentSnapshot

function rebuildSnapshot() {
  currentSnapshot = { playing, disc: DISCS[curDiscIdx], discId: DISCS[curDiscIdx]?.id, volume, track: customTrack }
}

// Chargement paresseux (volume + dernier disque) depuis localStorage — appelé
// au premier accès côté client uniquement (jamais pendant le rendu serveur).
function ensurePreferencesLoaded() {
  if (preferencesLoaded) return
  preferencesLoaded = true
  const v = parseFloat(readPreference(VOL_KEY, ''))
  if (Number.isFinite(v)) volume = v
  const savedDiscId = readPreference(DISC_KEY, DISCS[0].id)
  const i = DISCS.findIndex((d) => d.id === savedDiscId)
  if (i >= 0) curDiscIdx = i
  rebuildSnapshot()
}

function notify() {
  rebuildSnapshot()
  listeners.forEach((cb) => {
    try {
      cb(currentSnapshot)
    } catch {
      // un subscriber cassé ne doit pas casser les autres
    }
  })
}

export function subscribe(cb: (state: MusicState) => void) {
  ensurePreferencesLoaded()
  listeners.add(cb)
  cb(currentSnapshot)
  return () => {
    listeners.delete(cb)
  }
}

export function getState(): MusicState {
  ensurePreferencesLoaded()
  return currentSnapshot
}

// Snapshot statique pour le 3e argument de useSyncExternalStore (rendu
// serveur / hydratation) — ne doit jamais lire localStorage.
export function getServerSnapshot(): MusicState {
  return SERVER_SNAPSHOT
}

function ensureGraph() {
  if (ctx) return
  const AudioContextCtor =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) return
  ctx = new AudioContextCtor()
  master = ctx.createGain()
  master.gain.value = volume
  comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.ratio.value = 6
  comp.attack.value = 0.004
  comp.release.value = 0.2
  // Envoi delay (espace/dub)
  delayNode = ctx.createDelay(1.0)
  delayNode.delayTime.value = 0.34
  delayGain = ctx.createGain()
  delayGain.gain.value = 0.28
  const dFilter = ctx.createBiquadFilter()
  dFilter.type = 'lowpass'
  dFilter.frequency.value = 2200
  delayNode.connect(dFilter)
  dFilter.connect(delayGain)
  delayGain.connect(delayNode)
  delayGain.connect(comp)
  master.connect(comp)
  comp.connect(ctx.destination)
}

// ── Gestion de la lecture de fichiers audio MP3 ──────────────────────────────
function stopAudioFile() {
  if (audioHtmlElement) {
    try {
      audioHtmlElement.pause()
      audioHtmlElement.src = ''
    } catch {
      // lecteur déjà détruit — sans conséquence
    }
    audioHtmlElement = null
  }
}

function playAudioFile(url: string, { loop = true, onEnded }: { loop?: boolean; onEnded?: () => void } = {}) {
  stopAudioFile()

  const el = new Audio(url)
  el.loop = loop
  el.volume = volume
  audioHtmlElement = el
  if (onEnded) {
    el.addEventListener('ended', () => {
      if (audioHtmlElement === el) onEnded()
    })
  }

  el.play().catch(() => {
    // lecture bloquée par le navigateur avant interaction utilisateur — silencieux
  })
}

// ── Voix Synthétiseur Procédural (Fallback / Techno & Nuit) ──────────────────
function kick(t: number, g = 1) {
  if (!ctx || !master) return
  const o = ctx.createOscillator()
  const gain = ctx.createGain()
  o.frequency.setValueAtTime(150, t)
  o.frequency.exponentialRampToValueAtTime(48, t + 0.11)
  gain.gain.setValueAtTime(g, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26)
  o.connect(gain)
  gain.connect(master)
  o.start(t)
  o.stop(t + 0.3)
}
function noiseBuf(dur: number) {
  if (!ctx) throw new Error('no ctx')
  const b = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return b
}
function hat(t: number, open = false, g = 0.3) {
  if (!ctx || !master) return
  const dur = open ? 0.17 : 0.04
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf(dur)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 7500
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(g, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
  s.connect(hp)
  hp.connect(gain)
  gain.connect(master)
  s.start(t)
  s.stop(t + dur)
}
function clap(t: number, g = 0.4) {
  if (!ctx || !master || !delayNode) return
  const s = ctx.createBufferSource()
  s.buffer = noiseBuf(0.16)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1600
  bp.Q.value = 0.8
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(g, t + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
  s.connect(bp)
  bp.connect(gain)
  gain.connect(master)
  gain.connect(delayNode)
  s.start(t)
  s.stop(t + 0.16)
}
function bass(t: number, freq: number, dur: number, g = 0.5, type: OscillatorType = 'sawtooth') {
  if (!ctx || !master) return
  const o = ctx.createOscillator()
  const f = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  o.type = type
  o.frequency.value = freq
  f.type = 'lowpass'
  f.frequency.setValueAtTime(700, t)
  f.frequency.exponentialRampToValueAtTime(160, t + dur)
  f.Q.value = 6
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(g, t + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(f)
  f.connect(gain)
  gain.connect(master)
  o.start(t)
  o.stop(t + dur + 0.02)
}
function chord(t: number, notes: number[], dur: number, g = 0.16, send = true) {
  if (!ctx || !master) return
  notes.forEach((m, i) => {
    if (!ctx || !master) return
    const o = ctx.createOscillator()
    const gain = ctx.createGain()
    o.type = 'triangle'
    o.frequency.value = mtof(m) * (i ? 1.004 : 1)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(g, t + Math.min(0.08, dur * 0.3))
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(gain)
    gain.connect(master)
    if (send && delayNode) gain.connect(delayNode)
    o.start(t)
    o.stop(t + dur + 0.05)
  })
}
function pluck(t: number, m: number, g = 0.24, type: OscillatorType = 'triangle') {
  if (!ctx || !master || !delayNode) return
  const o = ctx.createOscillator()
  const gain = ctx.createGain()
  o.type = type
  o.frequency.value = mtof(m)
  gain.gain.setValueAtTime(g, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28)
  o.connect(gain)
  gain.connect(master)
  gain.connect(delayNode)
  o.start(t)
  o.stop(t + 0.3)
}

// ── Motifs par disque (Fallback synthétiseur) ────────────────────────────────
const PAT: Record<string, (s: number, b: number, t: number) => void> = {
  house(s, b, t) {
    const prog = [45, 41, 48, 43]
    const r = prog[b % 4]
    if (s % 4 === 0) kick(t, 1)
    if (s % 2 === 1) hat(t, false, 0.16)
    if (s === 2 || s === 6 || s === 10 || s === 14) hat(t, true, 0.2)
    if (s === 4 || s === 12) clap(t, 0.4)
    if ([0, 3, 6, 8, 11, 14].includes(s)) bass(t, mtof(r), 0.16, 0.5)
    if (s === 4 || s === 12) chord(t, [r + 24, r + 27, r + 31], 0.2, 0.13)
  },
  afro(s, b, t) {
    const pent = [57, 60, 62, 64, 67, 69]
    const roots = [45, 50, 43, 48]
    const r = roots[b % 4]
    if (s === 0 || s === 6 || s === 10) kick(t, 0.95)
    if (s % 2 === 0) hat(t, false, 0.12)
    if (s === 4 || s === 12) clap(t, 0.22)
    if ([0, 3, 7, 8, 11].includes(s)) bass(t, mtof(r), 0.2, 0.42)
    if ([0, 2, 5, 6, 9, 11, 13].includes(s)) {
      const note = pent[(s + b * 3) % pent.length] + (s > 8 ? 12 : 0)
      pluck(t, note, 0.18, 'triangle')
    }
  },
  techno(s, b, t) {
    const r = 41
    if (s % 4 === 0) kick(t, 1)
    hat(t, false, s % 4 === 2 ? 0.18 : 0.1)
    if (s === 14) hat(t, true, 0.16)
    if (s % 2 === 1) bass(t, mtof(r + (s % 8 === 7 ? 12 : 0)), 0.12, 0.4, 'square')
    if (b % 2 === 1 && s === 4) chord(t, [r + 24, r + 30, r + 36], 0.16, 0.1)
  },
  lofi(s, b, t) {
    const chords = [
      [48, 52, 55, 59],
      [45, 48, 52, 55],
      [50, 53, 57, 60],
      [43, 47, 50, 53],
    ]
    const c = chords[b % 4]
    if (s === 0 || s === 8) kick(t, 0.8)
    if (s === 10) kick(t, 0.3)
    if (s === 4 || s === 12) clap(t, 0.22)
    if (s % 2 === 0) hat(t, false, 0.09)
    if (s === 0) chord(t, c, 1.7, 0.12)
    if ([0, 6].includes(s)) bass(t, mtof(c[0] - 12), 0.4, 0.38, 'sine')
  },
  nuit(s, b, t) {
    const chords = [
      [57, 60, 64, 67, 71],
      [53, 57, 60, 64],
      [55, 59, 62, 66],
      [52, 55, 59, 62],
    ]
    const c = chords[Math.floor(b / 2) % 4]
    if (s === 0 && b % 2 === 0) chord(t, c, 4.2, 0.1)
    if (s === 0) bass(t, mtof(c[0] - 24), 3.8, 0.22, 'sine')
    if ((s === 5 || s === 11) && Math.random() < 0.5) pluck(t, c[2 + (s % 2)] + 12, 0.12, 'sine')
  },
}

function scheduler() {
  if (!ctx) return
  const disc = DISCS[curDiscIdx]
  const sec16 = 60 / disc.bpm / 4
  const swing = disc.id === 'lofi' ? 0.22 : 0
  while (nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
    const t = nextTime + (swing && step % 2 === 1 ? sec16 * swing : 0)
    try {
      PAT[disc.id](step, bar, t)
    } catch {
      // un pattern qui échoue ne doit pas arrêter le scheduler
    }
    nextTime += sec16
    step++
    if (step >= 16) {
      step = 0
      bar++
    }
  }
}

function startCrackle() {
  if (!ctx || !master || crackleSrc || DISCS[curDiscIdx].id !== 'lofi') return
  const src = ctx.createBufferSource()
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() < 0.0008 ? Math.random() * 2 - 1 : 0
  src.buffer = b
  src.loop = true
  const g = ctx.createGain()
  g.gain.value = 0.5
  src.connect(g)
  g.connect(master)
  src.start()
  crackleSrc = src
}
function stopCrackle() {
  if (crackleSrc) {
    try {
      crackleSrc.stop()
    } catch {
      // déjà arrêtée
    }
    crackleSrc = null
  }
}

// ── API Publique de contrôle ──────────────────────────────────────────────────
export async function play(discId?: string) {
  ensureGraph()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      // reprise refusée — l'utilisateur relancera via une interaction
    }
  }
  if (discId) {
    const i = DISCS.findIndex((d) => d.id === discId)
    if (i >= 0) curDiscIdx = i
  }
  writePreference(DISC_KEY, DISCS[curDiscIdx].id)

  const currentDisc = DISCS[curDiscIdx]
  customTrack = null
  playing = true

  if (schedulerId) {
    clearInterval(schedulerId)
    schedulerId = null
  }
  stopCrackle()
  stopAudioFile()

  const mp3Path = ACTIVE_MP3S[currentDisc.id]
  if (mp3Path) {
    playAudioFile(mp3Path)
  } else {
    step = 0
    bar = 0
    nextTime = ctx.currentTime + 0.06
    startCrackle()
    schedulerId = setInterval(scheduler, LOOKAHEAD * 1000)
  }
  notify()
}

// Joue une piste custom (extrait 30 s, ex. recherche iTunes) via le même
// pipeline audio/volume que les disques MP3. Coupe le disque en cours,
// publie le descriptor dans l'état, et s'arrête proprement à la fin (ended).
export async function playTrack(track: { title?: string; artist?: string; cover?: string | null; previewUrl?: string | null }) {
  if (!track || !track.previewUrl) return
  ensureGraph()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      // reprise refusée
    }
  }

  if (schedulerId) {
    clearInterval(schedulerId)
    schedulerId = null
  }
  stopCrackle()
  stopAudioFile()

  customTrack = {
    title: track.title || '',
    artist: track.artist || '',
    cover: track.cover || null,
    previewUrl: track.previewUrl,
  }
  playing = true
  playAudioFile(customTrack.previewUrl, {
    loop: false,
    onEnded: () => {
      playing = false
      stopAudioFile()
      notify()
    },
  })
  notify()
}

export function stop() {
  playing = false
  if (schedulerId) {
    clearInterval(schedulerId)
    schedulerId = null
  }
  stopCrackle()
  stopAudioFile()
  notify()
}

export function toggle(discId?: string) {
  // Piste custom : toggle() sans id met en pause / relance l'extrait.
  // Un id de disque explicite reprend le comportement normal (disques).
  if (playing && (!discId || (!customTrack && DISCS[curDiscIdx].id === discId))) stop()
  else if (!discId && customTrack) playTrack(customTrack)
  else play(discId)
}

export function playRandom() {
  let i = Math.floor(Math.random() * DISCS.length)
  if (playing && DISCS.length > 1 && i === curDiscIdx) i = (i + 1) % DISCS.length
  play(DISCS[i].id)
}

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v))
  writePreference(VOL_KEY, String(volume))
  if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02)
  if (audioHtmlElement) {
    try {
      audioHtmlElement.volume = volume
    } catch {
      // pas de conséquence si non applicable
    }
  }
  notify()
}

export function getSavedDiscId() {
  return readPreference(DISC_KEY, DISCS[0].id)
}
