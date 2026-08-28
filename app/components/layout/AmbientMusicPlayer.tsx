'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { ChevronDown, Music4, Pause, Play, Shuffle, SkipForward, Volume1, Volume2, VolumeX, X } from 'lucide-react'
import { DISCS, subscribe, getState, getServerSnapshot, play, toggle, playRandom, setVolume, playTrack, stop } from '@/lib/client/musicEngine'
import { Button, IconButton, Input, Card, Slider } from '@/app/components/ui'

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
    img: '/images/live-in-black/ambient/ambient-house-disco-grid.png',
    bgPosition: 'center 40%',
    filter: 'brightness(0.7) saturate(1.4) contrast(1.1) hue-rotate(-20deg)',
  },
  afro: {
    img: '/images/live-in-black/ambient/ambient-afro-percussion-haze.png',
    bgPosition: 'center 40%',
    filter: 'brightness(0.7) saturate(1.6) contrast(1.1) hue-rotate(50deg)',
  },
  techno: {
    img: '/images/live-in-black/ambient/ambient-techno-laser-tunnel.png',
    bgPosition: 'center 40%',
    filter: 'brightness(0.7) saturate(1.8) contrast(1.15) hue-rotate(150deg)',
  },
  lofi: {
    img: '/images/live-in-black/ambient/ambient-lofi-vinyl-lounge.png',
    bgPosition: 'center 35%',
    filter: 'brightness(0.75) sepia(0.2) contrast(1.1)',
  },
  nuit: {
    img: '/images/live-in-black/ambient/ambient-nuit-rooftop-moon.png',
    bgPosition: 'center 50%',
    filter: 'brightness(0.7) saturate(1.3) contrast(1.1)',
  },
}

// Mini égaliseur animé (3 barres) — remplace l'ancien bras de lecture comme
// indicateur "en lecture" : plus lisible en petit format, et purement
// décoratif donc gelé sous prefers-reduced-motion (cf. règle globale
// `.amp-eq` ci-dessous) sans perdre l'information (le disque reste visible).
function EqBars({ active, color = 'var(--primary)' }: { active: boolean; color?: string }) {
  return (
    <span className="amp-eq" aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 12, width: 14 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={active ? 'amp-eq-bar amp-eq-bar-active' : 'amp-eq-bar'}
          style={{ display: 'block', width: 3, borderRadius: 1.5, background: color, animationDelay: `${i * 0.14}s` }}
        />
      ))}
    </span>
  )
}

// Pastille disque compacte — utilisée comme vignette dans la liste et sur le
// déclencheur flottant. Remplace l'ancien SVG "platine vinyle + bras de
// lecture" par une simple pochette circulaire (image du disque ou pochette
// de piste custom), plus proche des conventions Spotify/Apple Music mini-
// player demandées par le client, avec un léger effet de rotation en lecture.
function DiscArt({ size, imgSrc, bgPosition, filter, spinning, ring }: { size: number; imgSrc: string; bgPosition: string; filter: string; spinning: boolean; ring?: boolean }) {
  return (
    <span
      className={spinning ? 'amp-disc amp-disc-spin' : 'amp-disc'}
      style={{
        display: 'block',
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        backgroundImage: `url(${imgSrc})`,
        backgroundSize: 'cover',
        backgroundPosition: bgPosition,
        filter,
        boxShadow: ring ? `0 0 0 2px var(--obsidian), 0 0 0 3.5px var(--primary), 0 6px 16px rgba(0,0,0,0.5)` : '0 4px 10px rgba(0,0,0,0.4)',
        position: 'relative',
      }}
    >
      <span style={{ position: 'absolute', inset: '38%', borderRadius: '50%', background: 'rgba(4,4,11,0.88)', border: '1px solid rgba(255,255,255,0.18)' }} />
    </span>
  )
}

// Passe UX 2026-08-20 : le lecteur flottant surchargeait les espaces privés
// (capture client sur /notifications) et entrait en concurrence avec des
// éléments déjà présents dans la navigation. On le réserve désormais à la
// page d'accueil publique, où l'ambiance fait partie de l'expérience,
// au lieu de le laisser suivre le visiteur partout.
const SHOW_ON_PUBLIC_PATHS = ['/home']

const SEEN_KEY = 'lib_ambiance_seen'
interface SearchResult {
  title: string
  artist: string
  cover: string | null
  previewUrl: string | null
}

export default function AmbientMusicPlayer({ publicMode = false }: { publicMode?: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  // Fermeture complète (distincte de la réduction) : coupe la lecture et
  // masque tout le widget flottant (chip + déclencheur) jusqu'à ce que
  // l'utilisateur le rouvre explicitement via la petite pastille qui reste
  // affichée à sa place — cf. retour client "pouvoir la réduire ou la
  // fermer". Volontairement en mémoire (pas de localStorage) : une fermeture
  // ne doit pas suivre l'utilisateur d'une visite à l'autre.
  const [dismissed, setDismissed] = useState(false)
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

  // Fermer au clavier (Échap) — accessibilité standard pour un panneau flottant
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open])

  if (publicMode) return null
  if (!SHOW_ON_PUBLIC_PATHS.some((p) => pathname === p || pathname?.startsWith(`${p}/`))) return null

  const current = DISCS.find((d) => d.id === st.discId) || DISCS[0]
  const accent = 'var(--primary)'
  const activeAsset = DISC_ASSETS[current.id]
  const track = st.track
  const bigCover = track?.cover ? track.cover.replace('100x100', '400x400').replace('60x60', '400x400') : null
  const chipShown = chipReady && (chipIntro || st.playing)
  const chipLabel = st.playing ? (track ? track.title : current.name) : 'Ambiance'
  const heroImg = track && bigCover ? bigCover : activeAsset.img
  const heroFilter = track && bigCover ? 'brightness(0.6)' : activeAsset.filter
  const heroPos = track && bigCover ? 'center' : activeAsset.bgPosition
  const volumeIcon = st.volume <= 0 ? <VolumeX size={15} strokeWidth={2} aria-hidden="true" /> : st.volume < 0.5 ? <Volume1 size={15} strokeWidth={2} aria-hidden="true" /> : <Volume2 size={15} strokeWidth={2} aria-hidden="true" />

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

  // Fermeture complète : arrête la lecture (le disque/l'extrait en cours) et
  // masque le widget. `collapsePanel` (bouton chevron) laisse au contraire la
  // lecture continuer en arrière-plan — seul le panneau se replie.
  function dismissPlayer() {
    if (st.playing) stop()
    setOpen(false)
    setDismissed(true)
  }

  function reopenPlayer() {
    setDismissed(false)
  }

  function collapsePanel() {
    setOpen(false)
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

  function nextDisc() {
    // "Suivant" — bascule sur le disque suivant de la liste (boucle), même
    // logique que playRandom() côté moteur mais déterministe : utile quand on
    // écoute déjà un disque et qu'on veut avancer plutôt que retomber sur le
    // même par hasard. N'agit pas sur une piste custom (pas de notion
    // d'ordre côté recherche iTunes) — bascule alors sur le premier disque.
    const idx = track ? -1 : DISCS.findIndex((d) => d.id === current.id)
    const next = DISCS[(idx + 1 + DISCS.length) % DISCS.length]
    play(next.id)
  }

  return (
    <div className="amp-root" style={{ position: 'fixed', right: 14, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 86px)', zIndex: 45, }}>
      <style>{`
        @keyframes amp-spin { to { transform: rotate(360deg); } }
        .amp-disc-spin { animation: amp-spin 3.2s linear infinite; }
        @keyframes amp-eq-bounce { 0%, 100% { height: 3px; } 50% { height: 12px; } }
        .amp-eq-bar { height: 3px; transition: height 0.15s ease; }
        .amp-eq-bar-active { animation: amp-eq-bounce 0.9s ease-in-out infinite; }
        .amp-press { transition: transform 0.15s cubic-bezier(0.3,0.9,0.3,1); }
        .amp-press:active { transform: scale(0.94); }
        @media (prefers-reduced-motion: reduce) {
          .amp-disc-spin { animation: none; }
          .amp-eq-bar-active { animation: none; height: 8px; }
          .amp-press { transition: none; }
        }
        /* Sur petit écran, réduit l'emprise du bouton flottant pour limiter le
           chevauchement avec le contenu scrollable en dessous (ex. le texte de
           stock du panneau de réservation, EventCheckoutPanel.tsx). */
        @media (max-width: 480px) {
          .amp-root {
            right: 10px !important;
            bottom: calc(env(safe-area-inset-bottom, 0px) + 18px) !important;
          }
          .amp-trigger { width: 52px !important; height: 52px !important; }
          .amp-panel { width: min(92vw, 320px) !important; }
          .mp-chip { display: none !important; }
        }
        .mp-chip { transition: opacity 0.3s ease; }
        .mp-res { background: transparent; transition: background 0.15s; }
        .mp-res:hover { background: rgba(255,255,255,0.06); }
        .mp-disc-card { transition: border-color 0.2s, transform 0.2s; }
        .mp-disc-card:hover { transform: translateY(-1px); }
        @media (prefers-reduced-motion: reduce) {
          .mp-chip { transition: none; }
        }
      `}</style>

      {dismissed ? (
        // Pastille de réouverture — tout ce qui reste visible une fois le
        // lecteur "fermé" (lecture arrêtée). Volontairement plus petite et
        // discrète que le déclencheur normal : signale "le lecteur existe
        // toujours, en un clic" sans reproduire l'emprise visuelle habituelle.
        <IconButton
          label="Rouvrir l'ambiance musicale"
          icon={<Music4 size={16} strokeWidth={1.8} color="rgba(255,255,255,0.7)" aria-hidden="true" />}
          onClick={reopenPlayer}
          size={38}
          style={{ borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border-strong)', boxShadow: '0 8px 20px rgba(0,0,0,0.5)', transition: 'transform 0.15s cubic-bezier(0.3,0.9,0.3,1), background .16s ease, border-color .16s ease' }}
          onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)' }}
          onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
        />
      ) : (
        <>
      {open && (
        <Card
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label="Ambiance musicale"
          className="amp-panel"
          accent="var(--border-strong)"
          style={{
            position: 'absolute',
            bottom: 74,
            right: 0,
            width: 348,
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
            maxHeight: 'calc(100vh - 200px)',
            overflowY: 'auto',
            opacity: 1,
            transform: 'translateY(0) scale(1)',
            transformOrigin: 'bottom right',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '0 2px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Ambiance</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconButton label="Un disque au hasard" icon={<Shuffle size={14} strokeWidth={2.4} aria-hidden="true" />} tone="accent" size={32} onClick={() => playRandom()} />
              <IconButton label="Réduire" icon={<ChevronDown size={16} strokeWidth={2.2} aria-hidden="true" />} size={32} onClick={collapsePanel} />
              <IconButton label="Fermer et arrêter la lecture" icon={<X size={16} strokeWidth={2} aria-hidden="true" />} size={32} onClick={dismissPlayer} />
            </div>
          </div>

          {/* Carte "now playing" — pochette/fond, titre/artiste, play-pause,
              suivant, égaliseur animé comme indicateur de lecture. */}
          <div
            style={{
              position: 'relative',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-strong)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              marginBottom: 16,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `url(${heroImg})`,
                backgroundSize: 'cover',
                backgroundPosition: heroPos,
                filter: heroFilter,
                zIndex: 0,
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, rgba(10,10,14,0.35) 0%, rgba(10,10,14,0.9) 100%)',
                zIndex: 1,
              }}
            />

            <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '16px' }}>
              <DiscArt size={56} imgSrc={activeAsset.img} bgPosition={activeAsset.bgPosition} filter={activeAsset.filter} spinning={st.playing} ring />
              <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: '0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {track ? track.title : current.name}
                  </p>
                  {st.playing && <EqBars active color={accent} />}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,0.62)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {track ? track.artist || 'Extrait 30 s' : st.playing ? 'En lecture…' : current.desc}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {!track && (
                  <IconButton
                    label="Disque suivant"
                    icon={<SkipForward size={16} strokeWidth={2.2} aria-hidden="true" />}
                    size={36}
                    style={{ color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}
                    onClick={nextDisc}
                  />
                )}
                <IconButton
                  label={st.playing ? 'Mettre en pause' : 'Jouer'}
                  icon={st.playing ? <Pause size={17} strokeWidth={2.8} aria-hidden="true" /> : <Play size={17} strokeWidth={2.8} fill="var(--primary-ink)" aria-hidden="true" />}
                  size={42}
                  style={{ borderRadius: '50%', border: 'none', background: accent, color: 'var(--primary-ink)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', transition: 'transform 0.15s cubic-bezier(0.3,0.9,0.3,1)' }}
                  onClick={() => toggle(track ? undefined : current.id)}
                />
              </div>
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
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-pill)',
                padding: '11px 36px 11px 12px',
                fontSize: 13,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.92)',
                outline: 'none',
              }}
            />
            {searching && (
              <span
                className="amp-disc-spin"
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
            <Card
              accent="var(--border-strong)"
              style={{ padding: 0, marginBottom: 10, maxHeight: 230, overflowY: 'auto', overflowX: 'hidden' }}
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
                    borderRadius: 0,
                    textAlign: 'left',
                    justifyContent: 'flex-start',
                    borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  {r.cover ? (
                    <Image src={r.cover} alt="" width={32} height={32} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                  )}
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{r.artist}</span>
                  </span>
                </Button>
              ))}
            </Card>
          )}

          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <p style={{ margin: '0 0 10px', padding: '0 2px', fontSize: 11.5, color: 'var(--text-faint)' }}>Aucun résultat pour cette recherche.</p>
          )}

          {/* Liste des ambiances — rangée compacte type "file d'attente" plutôt
              que la grille de cartes précédente : pastille ronde + nom + tag,
              coche visuelle sur l'ambiance active. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            {DISCS.map((d) => {
              const isCur = d.id === current.id && !track
              const asset = DISC_ASSETS[d.id]
              return (
                <Button
                  key={d.id}
                  onClick={() => play(d.id)}
                  variant="ghost"
                  aria-pressed={isCur}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 8px',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'left',
                    height: 44,
                    background: isCur ? 'var(--primary-a10)' : 'transparent',
                    border: `1px solid ${isCur ? 'var(--primary-a04)' : 'transparent'}`,
                    justifyContent: 'flex-start',
                  }}
                >
                  <DiscArt size={28} imgSrc={asset.img} bgPosition={asset.bgPosition} filter={asset.filter} spinning={isCur && st.playing} />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.1, flex: 1 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: isCur ? '#fff' : 'rgba(255,255,255,0.85)', letterSpacing: '0.01em' }}>{d.name}</span>
                    <span
                      style={{
                        fontSize: 10.5,
                        color: isCur ? 'rgba(255,255,255,0.6)' : 'var(--text-faint)',
                        letterSpacing: '0.01em',
                        marginTop: 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {d.desc}
                    </span>
                  </span>
                  {isCur && <EqBars active={st.playing} color={accent} />}
                </Button>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px 0' }}>
            <span style={{ color: 'rgba(255,255,255,0.52)', display: 'inline-flex' }}>{volumeIcon}</span>
            <Slider
              accent="teal"
              min={0}
              max={100}
              value={Math.round(st.volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              aria-label="Volume"
            />
          </div>
        </Card>
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
              padding: '10px 16px 10px 12px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border-strong)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            {st.playing && <EqBars active color={accent} />}
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chipLabel}</span>
          </Button>
        </span>
        <span className="amp-trigger amp-press" style={{ display: 'inline-flex', position: 'relative' }}>
          <IconButton
            label="Ambiance musicale"
            aria-expanded={open}
            icon={
              st.playing ? (
                <DiscArt size={38} imgSrc={activeAsset.img} bgPosition={activeAsset.bgPosition} filter={activeAsset.filter} spinning ring={false} />
              ) : (
                <Music4 size={24} strokeWidth={1.8} color="rgba(255,255,255,0.8)" aria-hidden="true" />
              )
            }
            onClick={togglePanel}
            size={60}
            style={{
              borderRadius: '50%',
              background: 'var(--surface-2)',
              border: `2px solid ${st.playing ? accent : 'var(--border-strong)'}`,
              boxShadow: st.playing ? `0 0 0 4px var(--primary-a14), 0 10px 28px rgba(0,0,0,0.55)` : '0 10px 28px rgba(0,0,0,0.55)',
              transition: 'border-color 0.3s, box-shadow 0.3s',
            }}
          />
          {st.playing && (
            <span
              aria-hidden="true"
              style={{ position: 'absolute', top: 4, right: 4, width: 9, height: 9, borderRadius: '50%', background: accent, border: '1px solid rgba(0,0,0,0.4)', pointerEvents: 'none' }}
            />
          )}
        </span>
      </div>
        </>
      )}
    </div>
  )
}
