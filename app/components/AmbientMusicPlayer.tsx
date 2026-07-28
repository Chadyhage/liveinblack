'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { Pause, Play, Shuffle, Volume2 } from 'lucide-react'
import { DISCS, subscribe, getState, getServerSnapshot, play, toggle, playRandom, setVolume, playTrack } from '@/lib/client/musicEngine'
import { Button, Input, Slider } from '@/app/components/ui'

// useSyncExternalStore (pas useState+useEffect) : lit le moteur audio, un
// store externe au sens React, sans jamais déclencher de setState synchrone
// dans un effet — le rendu serveur / la 1re passe d'hydratation utilisent le
// 3e argument (snapshot serveur figé), jamais localStorage. Même convention
// que isDesktop dans app/(app)/messages/MessagesClient.tsx.
function subscribeToMusicEngine(onStoreChange: () => void) {
  return subscribe(() => onStoreChange())
}

// Mapping des images d'ambiance avec des filtres lumineux ajustés pour une meilleure visibilité
const DISC_ASSETS: Record<string, { img: string; bgPosition: string; filter: string }> = {
  house: {
    img: '/media1.jpg',
    bgPosition: 'center 40%',
    filter: 'brightness(0.7) saturate(1.4) contrast(1.1) hue-rotate(-20deg)',
  },
  afro: {
    img: '/media1.jpg',
    bgPosition: 'center 40%',
    filter: 'brightness(0.7) saturate(1.6) contrast(1.1) hue-rotate(50deg)',
  },
  techno: {
    img: '/media1.jpg',
    bgPosition: 'center 40%',
    filter: 'brightness(0.7) saturate(1.8) contrast(1.15) hue-rotate(150deg)',
  },
  lofi: {
    img: '/media3.jpg',
    bgPosition: 'center 35%',
    filter: 'brightness(0.75) sepia(0.2) contrast(1.1)',
  },
  nuit: {
    img: '/media2.jpg',
    bgPosition: 'center 50%',
    filter: 'brightness(0.7) saturate(1.3) contrast(1.1)',
  },
}

// Platine vinyle/CD SVG — pastille de couleur dynamique, sillons fins, reflet
// métallique rotatif et bras de lecture animé.
function Vinyl({ size = 30, color = '#ffe500', spinning, arm = false }: { size?: number; color?: string; spinning: boolean; arm?: boolean }) {
  const gid = 'v-' + size + '-' + color.replace('#', '')
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.45))' }}>
      <defs>
        <radialGradient id={gid + 'label'} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="30%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity="0.4" />
        </radialGradient>
        <linearGradient id={gid + 'sheen'} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.02)" />
          <stop offset="35%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0.01)" />
          <stop offset="65%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
        </linearGradient>
      </defs>

      <g className={spinning ? 'amp-spin' : ''} style={{ transformOrigin: '50px 50px' }}>
        <circle cx="50" cy="50" r="48" fill="#08080b" stroke="rgba(255,255,255,0.07)" strokeWidth="0.8" />
        <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="32" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="28" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="24" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="15" fill={`url(#${gid}label)`} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="11" fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="0.8" />
        <circle cx="50" cy="50" r="7" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="3" fill="#040406" stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="48" fill={`url(#${gid}sheen)`} pointerEvents="none" />
      </g>

      {arm && (
        <g className="amp-tonearm" style={{ transform: spinning ? 'rotate(0deg)' : 'rotate(-22deg)' }}>
          <line x1="80" y1="18" x2="55" y2="46" stroke="#d8d8de" strokeWidth="3.4" strokeLinecap="round" />
          <line x1="80" y1="18" x2="55" y2="46" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
          <circle cx="80" cy="18" r="5" fill="#2a2a30" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          <circle cx="55" cy="46" r="2.6" fill="#555" />
        </g>
      )}
    </svg>
  )
}

// Le lecteur d'ambiance flotte sur toutes les pages authentifiées, sauf celles
// qui prennent tout l'écran (chat plein écran, scanner caméra) — même logique
// que HIDE_ON dans le legacy MusicPlayer.jsx / MusicPlayerGate d'App.jsx.
const HIDE_ON = ['/messages', '/scanner']

// Masqué sur les pages « vitrine » publiques (landing anonyme, prestataires,
// organisateurs, à propos, connexion, inscriptions) : ces pages ont leur
// propre univers marketing et le disque flottait par-dessus le contenu.
// Port fidèle de MusicPlayerGate.onPublicShowcase dans le legacy App.jsx —
// /accueil (non connecté) → /home, /prestataires → /providers,
// /organisateurs → /organizers, /c-est-quoi → /about, /connexion → /login,
// /inscription-organisateur|prestataire → /organizer-signup, /provider-signup.
// Le layout public (public)/layout.tsx ne sert que les visiteurs anonymes
// (cf. commentaire de (public)/home/page.tsx), donc pas besoin de re-vérifier
// `user` ici comme le fait legacy pour /accueil.
const HIDE_ON_PUBLIC_SHOWCASE = ['/providers', '/organizers', '/about', '/login', '/organizer-signup', '/provider-signup']

const SEEN_KEY = 'lib_ambiance_seen'

interface SearchResult {
  title: string
  artist: string
  cover: string | null
  previewUrl: string | null
}

export default function AmbientMusicPlayer() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const st = useSyncExternalStore(subscribeToMusicEngine, getState, getServerSnapshot)
  // Chip « Ambiance » : visible à l'arrivée tant que le lecteur n'a jamais été
  // ouvert (flag localStorage), puis se replie tout seul après ~5 s. Lecture
  // localStorage dans l'initialiseur paresseux : sans conséquence pour
  // l'hydratation, la valeur ne peut affecter le DOM rendu qu'une fois
  // chipReady passé à true (effet différé ci-dessous, jamais pendant le
  // premier rendu client).
  const [chipIntro, setChipIntro] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return !window.localStorage.getItem(SEEN_KEY)
    } catch {
      return false
    }
  })
  const [chipReady, setChipReady] = useState(false)
  // Recherche iTunes (extraits 30 s)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLDivElement>(null)
  const searchDebRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const searchReqRef = useRef(0)

  // Fade d'apparition du chip (simple fade, compatible prefers-reduced-motion)
  useEffect(() => {
    const t = setTimeout(() => setChipReady(true), 60)
    return () => clearTimeout(t)
  }, [])

  // Repli automatique du chip après ~5 s
  useEffect(() => {
    if (!chipIntro) return
    const t = setTimeout(() => setChipIntro(false), 5000)
    return () => clearTimeout(t)
  }, [chipIntro])

  // Nettoyage du debounce de recherche
  useEffect(() => () => clearTimeout(searchDebRef.current), [])

  // Fermer le panneau au clic extérieur
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) && btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  if (HIDE_ON.some((p) => pathname?.startsWith(p))) return null
  if (HIDE_ON_PUBLIC_SHOWCASE.some((p) => pathname?.startsWith(p))) return null

  const current = DISCS.find((d) => d.id === st.discId) || DISCS[0]
  const accent = '#ffe500'
  const activeAsset = DISC_ASSETS[current.id]
  const track = st.track
  const bigCover = track?.cover ? track.cover.replace('100x100', '400x400').replace('60x60', '400x400') : null
  const chipShown = chipReady && (chipIntro || st.playing)
  const chipLabel = st.playing ? (track ? track.title : current.name) : 'Ambiance'

  function togglePanel() {
    if (!open) {
      try {
        localStorage.setItem(SEEN_KEY, '1')
      } catch {
        // stockage indisponible — sans conséquence
      }
      setChipIntro(false)
    }
    setOpen((o) => !o)
  }

  function handleSearch(val: string) {
    setQuery(val)
    clearTimeout(searchDebRef.current)
    if (val.trim().length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    searchDebRef.current = setTimeout(async () => {
      const reqId = ++searchReqRef.current
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(val)}&media=music&entity=song&limit=8`)
        const data = await res.json()
        if (searchReqRef.current !== reqId) return
        setResults(
          ((data.results || []) as Array<{ trackName?: string; artistName?: string; artworkUrl100?: string; artworkUrl60?: string; previewUrl?: string }>)
            .map((r) => ({
              title: r.trackName || '',
              artist: r.artistName || '',
              cover: r.artworkUrl100 || r.artworkUrl60 || null,
              previewUrl: r.previewUrl || null,
            }))
            .filter((r) => r.previewUrl)
        )
      } catch {
        if (searchReqRef.current === reqId) setResults([])
      } finally {
        if (searchReqRef.current === reqId) setSearching(false)
      }
    }, 350)
  }

  function pickResult(r: SearchResult) {
    if (!r.previewUrl) return
    playTrack({ title: r.title, artist: r.artist, cover: r.cover, previewUrl: r.previewUrl })
    setQuery('')
    setResults([])
    setSearching(false)
  }

  return (
    <div className="amp-root" style={{ position: 'fixed', right: 14, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 86px)', zIndex: 45, fontFamily: 'Inter, sans-serif' }}>
      <style>{`
        .amp-spin { animation: amp-spin 2.4s linear infinite; }
        @keyframes amp-spin { to { transform: rotate(360deg); } }
        @keyframes amp-pop { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: none; } }
        .amp-tonearm { transition: transform 0.5s cubic-bezier(0.175,0.885,0.32,1.275); transform-origin: 80% 18%; }
        .amp-press { transition: transform 0.18s cubic-bezier(0.3,0.9,0.3,1), box-shadow 0.2s ease, border-color 0.2s ease; }
        .amp-press:active { transform: scale(0.96); }
        @media (prefers-reduced-motion: reduce) {
          .amp-spin { animation: none; }
          .amp-press, .amp-tonearm { transition: none; }
        }
        /* Sur petit écran, réduit l'emprise du bouton flottant pour limiter le
           chevauchement avec le contenu scrollable en dessous (ex. le texte de
           stock du panneau de réservation, EventCheckoutPanel.tsx). */
        @media (max-width: 480px) {
          .amp-root {
            right: 10px !important;
            bottom: calc(env(safe-area-inset-bottom, 0px) + var(--cookie-consent-height, 0px) + 18px) !important;
          }
          .amp-trigger { width: 52px !important; height: 52px !important; }
          .mp-chip { display: none !important; }
        }
        .mp-btn-card {
          position: relative;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 12px;
          cursor: pointer;
          text-align: left;
          overflow: hidden;
          height: 48px;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.06);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s cubic-bezier(0.22,0.9,0.3,1);
        }
        .mp-btn-card:hover {
          transform: translateY(-2px);
        }
        .mp-btn-card:active {
          transform: translateY(0) scale(0.97);
        }
        .mp-btn-bg {
          position: absolute;
          inset: 0;
          background-size: cover;
          z-index: 0;
          transition: transform 0.5s cubic-bezier(0.22,0.9,0.3,1);
        }
        .mp-btn-card:hover .mp-btn-bg {
          transform: scale(1.12);
        }
        .mp-chip { transition: opacity 0.45s ease; }
        .mp-res { background: transparent; transition: background 0.15s; }
        .mp-res:hover { background: rgba(255,255,255,0.06); }
        @media (prefers-reduced-motion: reduce) {
          .mp-chip { transition: none; }
        }
      `}</style>

      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute',
            bottom: 74,
            right: 0,
            width: 288,
            background: 'var(--surface-2)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 20,
            boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
            padding: 14,
            animation: 'amp-pop 0.2s cubic-bezier(0.22,0.9,0.3,1)',
            maxHeight: 'calc(100vh - 220px)',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '0 2px' }}>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>Ambiance</span>
            <Button
              onClick={() => playRandom()}
              variant="ghost"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                borderRadius: 999,
                background: 'rgba(255,229,0,0.12)',
                border: '1px solid rgba(255,229,0,0.42)',
                color: 'var(--primary)',
                fontFamily: 'Inter, sans-serif',
                fontSize: 11,
                fontWeight: 700,
                transition: 'all 0.2s',
              }}
            >
              <Shuffle size={13} strokeWidth={2.4} aria-hidden="true" />
              Au hasard
            </Button>
          </div>

          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 16,
              border: `1px solid ${accent}44`,
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              marginBottom: 12,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `url(${track && bigCover ? bigCover : activeAsset.img})`,
                backgroundSize: 'cover',
                backgroundPosition: track && bigCover ? 'center' : activeAsset.bgPosition,
                filter: track && bigCover ? 'brightness(0.75)' : activeAsset.filter,
                zIndex: 0,
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, rgba(10,10,14,0.3) 0%, rgba(10,10,14,0.88) 100%)',
                zIndex: 1,
              }}
            />

            <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              <Vinyl size={42} color={accent} spinning={st.playing} arm />
              <div style={{ flex: 1, minWidth: 0, lineHeight: 1.15 }}>
                <p style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {track ? track.title : current.name}
                </p>
                <p style={{ margin: '3px 0 0', fontSize: 11.5, color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {track ? track.artist || 'Extrait 30 s' : st.playing ? 'En lecture…' : current.desc}
                </p>
              </div>
              <Button
                onClick={() => toggle(track ? undefined : current.id)}
                aria-label={st.playing ? 'Pause' : 'Jouer'}
                variant="ghost"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  flexShrink: 0,
                  padding: 0,
                  border: 'none',
                  background: accent,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  transition: 'transform 0.2s',
                }}
              >
                {st.playing ? <Pause size={14} strokeWidth={2.8} color="#171500" aria-hidden="true" /> : <Play size={14} strokeWidth={2.8} fill="#171500" color="#171500" aria-hidden="true" />}
              </Button>
            </div>
          </div>

          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Chercher un titre, un artiste…"
              aria-label="Chercher un titre ou un artiste"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'var(--obsidian)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 999,
                padding: '11px 36px 11px 12px',
                fontFamily: 'Inter, sans-serif',
                fontSize: 13,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.92)',
                outline: 'none',
              }}
            />
            {searching && (
              <span
                className="amp-spin"
                style={{
                  position: 'absolute',
                  right: 11,
                  top: '50%',
                  marginTop: -7,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.25)',
                  borderTopColor: '#fff',
                  display: 'inline-block',
                }}
              />
            )}
          </div>

          {results.length > 0 && (
            <div
              style={{
                background: '#0e0f16',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                marginBottom: 10,
                maxHeight: 230,
                overflowY: 'auto',
                overflowX: 'hidden',
              }}
            >
              {results.map((r, i) => (
                <Button
                  key={r.previewUrl || i}
                  onClick={() => pickResult(r)}
                  variant="ghost"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '7px 10px',
                    minHeight: 46,
                    border: 'none',
                    textAlign: 'left',
                    justifyContent: 'flex-start',
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  }}
                >
                  {r.cover ? (
                    <Image src={r.cover} alt="" width={32} height={32} style={{ borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                  )}
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.2 }}>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{r.artist}</span>
                  </span>
                </Button>
              ))}
            </div>
          )}

          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <p style={{ margin: '0 0 10px', padding: '0 2px', fontFamily: 'Inter, sans-serif', fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>Aucun résultat pour cette recherche.</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {DISCS.map((d, idx) => {
              const isCur = d.id === current.id
              const asset = DISC_ASSETS[d.id]
              const isLast = idx === DISCS.length - 1
              return (
                <Button
                  key={d.id}
                  onClick={() => play(d.id)}
                  variant="ghost"
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 12,
                    textAlign: 'left',
                    overflow: 'hidden',
                    height: 48,
                    background: 'transparent',
                    border: '1px solid rgba(255,255,255,0.06)',
                    gridColumn: isLast ? '1 / span 2' : undefined,
                    borderColor: isCur ? accent : 'rgba(255,255,255,0.06)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    transition: 'border-color 0.25s, box-shadow 0.25s, transform 0.25s cubic-bezier(0.22,0.9,0.3,1)',
                  }}
                >
                  <div
                    className="mp-btn-bg"
                    style={{
                      backgroundImage: `url(${asset.img})`,
                      backgroundPosition: asset.bgPosition,
                      filter: asset.filter,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: isCur ? 'linear-gradient(180deg, rgba(255,229,0,0.16) 0%, rgba(10,10,14,0.92) 100%)' : 'linear-gradient(180deg, rgba(4,4,8,0.25) 0%, rgba(10,10,14,0.95) 100%)',
                      zIndex: 1,
                    }}
                  />
                  <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                    <Vinyl size={22} color={accent} spinning={isCur && st.playing} />
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.1 }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, color: isCur ? '#fff' : 'rgba(255,255,255,0.85)', letterSpacing: '0.01em' }}>{d.name}</span>
                      <span
                        style={{
                          fontFamily: 'Inter, sans-serif',
                          fontSize: 10.5,
                          color: isCur ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.45)',
                          letterSpacing: '0.01em',
                          marginTop: 1,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {d.desc}
                      </span>
                    </div>
                  </div>
                </Button>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 2px' }}>
            <Volume2 size={15} strokeWidth={2} color="rgba(255,255,255,0.52)" aria-hidden="true" />
            <Slider
              min="0"
              max="1"
              step="0.01"
              value={st.volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: accent }}
            />
          </div>
        </div>
      )}

      <div ref={btnRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        <span className="mp-chip" style={{ opacity: chipShown ? 1 : 0, pointerEvents: chipShown ? 'auto' : 'none', display: 'inline-flex' }}>
          <Button
            onClick={togglePanel}
            aria-hidden={!chipShown}
            tabIndex={chipShown ? 0 : -1}
            variant="ghost"
            style={{
              maxWidth: 180,
              minHeight: 44,
              padding: '11px 16px',
              borderRadius: 999,
              background: 'var(--surface-2)',
              border: '1px solid rgba(255,255,255,0.14)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chipLabel}</span>
          </Button>
        </span>
        <span className="amp-trigger" style={{ display: 'inline-flex' }}>
          <Button
            onClick={togglePanel}
            title="Ambiance musicale"
            variant="ghost"
            style={{
              position: 'relative',
              width: 64,
              height: 64,
              borderRadius: '50%',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--surface-2)',
              border: `2px solid ${st.playing ? accent : 'rgba(255,255,255,0.22)'}`,
              boxShadow: '0 10px 28px rgba(0,0,0,0.55)',
              transition: 'border-color 0.3s, box-shadow 0.3s',
            }}
          >
            <Vinyl size={36} color={accent} spinning={st.playing} arm />
            {st.playing && <span style={{ position: 'absolute', top: 5, right: 5, width: 9, height: 9, borderRadius: '50%', background: accent, border: '1px solid rgba(0,0,0,0.4)' }} />}
          </Button>
        </span>
      </div>
    </div>
  )
}
