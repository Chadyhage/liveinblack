// Panneau admin — édition du carrousel « Actualité » de l'accueil.
//
// L'agent choisit : actif on/off, un titre, un sous-titre, un accent (teal /
// or / rose), et une sélection ORDONNÉE d'événements à mettre en avant. La
// sauvegarde écrit le doc global app_config/homepage_actualite (règle Firestore
// agent-only). Le carrousel côté accueil (ActualiteCarousel) lit ce doc en
// temps réel et s'affiche/s'efface tout seul.
//
// Pensé pour un non-technicien : recherche d'événement par nom, ajout d'un
// clic, réordonnancement par flèches, aperçu du rendu directement dans le
// panneau. Aucune donnée sensible, aucune manipulation d'argent.
//
// IMPORTANT (leçons de revue) : le brouillon d'édition est gardé BRUT (pas de
// normalisation à chaque frappe) — sinon le trim du titre empêcherait de taper
// une espace ou de vider le champ. La normalisation (trim, cap 12, défauts) est
// appliquée UNIQUEMENT à l'enregistrement (saveActualite) et à l'aperçu.

import { useEffect, useRef, useState } from 'react'
import ui from '../styles/ui'
import { useAuth } from '../context/AuthContext'
import { isClientDiscoverableEvent } from '../utils/eventDiscovery'
import {
  listenActualite, saveActualite, normalizeActualite, resolveActualiteEvents,
  defaultActualite, ACTUALITE_ACCENTS,
} from '../utils/homepageConfig'

const FONT = 'Inter, sans-serif'
const MAX_EVENTS = 12

export default function ActualiteAdminPanel({ allEvents = [] }) {
  const { user } = useAuth()
  const [draft, setDraft] = useState(defaultActualite())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null) // { ok, text }
  const [loaded, setLoaded] = useState(false)
  const dirtyRef = useRef(false) // true dès la 1re édition de l'agent

  // On charge la config au montage mais on n'affiche le formulaire QU'UNE FOIS
  // le 1er snapshot reçu (ou après un délai de secours si Firestore est
  // injoignable) — ainsi l'agent ne peut pas éditer, puis enregistrer, un
  // brouillon PAR DÉFAUT avant que la valeur réellement enregistrée soit chargée
  // (sinon un save écraserait la config existante). Un snapshot tardif re-seede
  // tant que l'agent n'a pas commencé à éditer (dirtyRef).
  useEffect(() => {
    const unsub = listenActualite(cfg => {
      if (!dirtyRef.current) setDraft(cfg)
      setLoaded(true)
    })
    const timer = setTimeout(() => setLoaded(true), 4000) // secours offline/permission refusée
    return () => { clearTimeout(timer); unsub() }
  }, [])

  // Brouillon BRUT — jamais re-normalisé pendant l'édition.
  function patch(p) {
    dirtyRef.current = true
    setDraft(d => ({ ...d, ...p }))
    setMsg(null)
  }

  const eventIds = Array.isArray(draft.eventIds) ? draft.eventIds.map(String) : []
  const selectedSet = new Set(eventIds)
  const atMax = eventIds.length >= MAX_EVENTS

  const byId = new Map(allEvents.map(e => [String(e.id), e]))

  // Candidats à l'ajout : événements découvrables, non déjà sélectionnés,
  // filtrés par la recherche, triés par date la plus proche.
  const q = search.trim().toLowerCase()
  const candidates = allEvents
    .filter(e => isClientDiscoverableEvent(e))
    .filter(e => !selectedSet.has(String(e.id)))
    .filter(e => !q || `${e.name || ''} ${e.city || ''} ${e.region || ''}`.toLowerCase().includes(q))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 30)

  function addEvent(id) {
    if (eventIds.length >= MAX_EVENTS || selectedSet.has(String(id))) return
    patch({ eventIds: [...eventIds, String(id)] })
  }
  function removeEvent(id) { patch({ eventIds: eventIds.filter(x => x !== String(id)) }) }
  function move(id, dir) {
    const i = eventIds.indexOf(String(id))
    const j = i + dir
    if (i < 0 || j < 0 || j >= eventIds.length) return
    const next = [...eventIds]
    ;[next[i], next[j]] = [next[j], next[i]]
    patch({ eventIds: next })
  }

  async function onSave() {
    setSaving(true); setMsg(null)
    const res = await saveActualite(draft, user?.uid || '') // saveActualite normalise (trim, cap, défauts)
    setSaving(false)
    setMsg(res.ok
      ? { ok: true, text: 'Enregistré. Le carrousel est à jour sur l\'accueil.' }
      : { ok: false, text: `Échec de l'enregistrement : ${res.error || 'réessaie'}.` })
  }

  // Aperçu = ce qui sera RÉELLEMENT enregistré/affiché (normalisé).
  const preview = normalizeActualite(draft)
  const previewAccent = ACTUALITE_ACCENTS[preview.accent] || ACTUALITE_ACCENTS.teal
  const willShowCount = resolveActualiteEvents({ ...preview, active: true }, allEvents).length

  if (!loaded) {
    return (
      <div style={{ ...ui.card, padding: '28px 18px', textAlign: 'center' }}>
        <span style={{ font: `600 13px ${FONT}`, color: ui.text.secondary }}>Chargement de la configuration…</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Intro */}
      <div style={{ ...ui.card, padding: '16px 18px' }}>
        <h3 style={{ margin: '0 0 6px', font: `800 16px ${FONT}`, color: ui.text.primary }}>Carrousel « Actualité »</h3>
        <p style={{ margin: 0, font: `500 13px ${FONT}`, color: ui.text.secondary, lineHeight: 1.6 }}>
          Un bandeau éditorial en haut de l'accueil pour mettre en avant une sélection d'événements
          (le gros événement du week-end, les nouveautés, une saison…). Il n'apparaît que s'il est
          activé et qu'au moins un événement choisi est encore à venir.
        </p>
      </div>

      {/* Actif + accent */}
      <div style={{ ...ui.card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}>
          <span>
            <span style={{ display: 'block', font: `700 14px ${FONT}`, color: ui.text.primary }}>Afficher sur l'accueil</span>
            <span style={{ display: 'block', font: `500 12px ${FONT}`, color: ui.text.tertiary, marginTop: 2 }}>
              {draft.active ? 'Le carrousel est visible par les visiteurs.' : 'Masqué — personne ne le voit.'}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={!!draft.active}
            onClick={() => patch({ active: !draft.active })}
            style={{
              flexShrink: 0, width: 48, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer',
              background: draft.active ? '#3ed6b5' : 'rgba(255,255,255,0.14)', position: 'relative', transition: 'background 0.2s',
            }}>
            <span style={{ position: 'absolute', top: 3, left: draft.active ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </button>
        </label>

        <div>
          <span style={ui.label}>Accent</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.values(ACTUALITE_ACCENTS).map(a => (
              <button key={a.key} type="button" onClick={() => patch({ accent: a.key })}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                  background: draft.accent === a.key ? a.soft : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${draft.accent === a.key ? a.border : 'rgba(255,255,255,0.08)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  font: `700 12px ${FONT}`, color: draft.accent === a.key ? a.dot : ui.text.secondary,
                }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: a.dot }} />
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Titre + sous-titre — liés au brouillon BRUT (pas de trim pendant la frappe) */}
      <div style={{ ...ui.card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <span style={ui.label}>Titre</span>
          <input style={ui.input} value={draft.title ?? ''} maxLength={80}
            onChange={e => patch({ title: e.target.value })} placeholder="L'actu du moment" />
        </div>
        <div>
          <span style={ui.label}>Sous-titre</span>
          <input style={ui.input} value={draft.subtitle ?? ''} maxLength={140}
            onChange={e => patch({ subtitle: e.target.value })} placeholder="Les temps forts à ne pas manquer" />
        </div>
      </div>

      {/* Événements sélectionnés (ordre curé) — rendus depuis eventIds pour que
          les index des flèches restent alignés même si un événement a été supprimé */}
      <div style={{ ...ui.card, padding: '16px 18px' }}>
        <span style={{ ...ui.label, marginBottom: 10 }}>À la une ({eventIds.length}/{MAX_EVENTS})</span>
        {eventIds.length === 0 ? (
          <p style={{ margin: 0, font: `500 13px ${FONT}`, color: ui.text.tertiary }}>
            Aucun événement choisi. Ajoute-en depuis la liste ci-dessous.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {eventIds.map((id, i) => {
              const ev = byId.get(id)
              return (
                <div key={id} style={{ ...ui.inset, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ font: `700 12px ${FONT}`, color: ui.text.tertiary, width: 18, textAlign: 'center' }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {ev ? (
                      <>
                        <span style={{ display: 'block', font: `700 13px ${FONT}`, color: ui.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.name}</span>
                        <span style={{ display: 'block', font: `500 11px ${FONT}`, color: ui.text.tertiary }}>{[ev.date, ev.city || ev.region].filter(Boolean).join(' · ')}</span>
                      </>
                    ) : (
                      <>
                        <span style={{ display: 'block', font: `700 13px ${FONT}`, color: '#ff9ed2' }}>Événement introuvable</span>
                        <span style={{ display: 'block', font: `500 11px ${FONT}`, color: ui.text.tertiary }}>Supprimé ou indisponible — retire-le</span>
                      </>
                    )}
                  </span>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <IconBtn label="Monter" disabled={i === 0} onClick={() => move(id, -1)}>↑</IconBtn>
                    <IconBtn label="Descendre" disabled={i === eventIds.length - 1} onClick={() => move(id, +1)}>↓</IconBtn>
                    <IconBtn label="Retirer" danger onClick={() => removeEvent(id)}>✕</IconBtn>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Ajout d'événements */}
      <div style={{ ...ui.card, padding: '16px 18px' }}>
        <span style={{ ...ui.label, marginBottom: 10 }}>Ajouter un événement</span>
        {atMax && (
          <p style={{ margin: '0 0 10px', font: `600 12px ${FONT}`, color: '#c8a96e' }}>
            Maximum atteint ({MAX_EVENTS} événements). Retire-en un pour en ajouter un autre.
          </p>
        )}
        <input style={{ ...ui.input, marginBottom: 10 }} value={search}
          onChange={e => setSearch(e.target.value)} placeholder="Rechercher par nom, ville…" />
        {candidates.length === 0 ? (
          <p style={{ margin: 0, font: `500 13px ${FONT}`, color: ui.text.tertiary }}>
            {q ? 'Aucun événement à venir ne correspond.' : 'Aucun autre événement à venir.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
            {candidates.map(ev => (
              <button key={ev.id} type="button" onClick={() => addEvent(ev.id)} disabled={atMax}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  cursor: atMax ? 'not-allowed' : 'pointer', opacity: atMax ? 0.5 : 1,
                  padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', font: `700 13px ${FONT}`, color: ui.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.name}</span>
                  <span style={{ display: 'block', font: `500 11px ${FONT}`, color: ui.text.tertiary }}>{[ev.date, ev.city || ev.region].filter(Boolean).join(' · ')}</span>
                </span>
                <span style={{ flexShrink: 0, font: `700 12px ${FONT}`, color: '#4ee8c8' }}>+ Ajouter</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Aperçu de l'en-tête (rendu normalisé = ce qui sera enregistré) */}
      <div style={{ ...ui.card, padding: '16px 18px' }}>
        <span style={{ ...ui.label, marginBottom: 10 }}>Aperçu</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 8, background: previewAccent.soft, border: `1px solid ${previewAccent.border}` }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: previewAccent.dot }} />
            <span style={{ font: `700 11px ${FONT}`, letterSpacing: '0.04em', textTransform: 'uppercase', color: previewAccent.dot }}>{preview.title}</span>
          </span>
          {preview.subtitle && <span style={{ font: `500 12px ${FONT}`, color: ui.text.secondary }}>{preview.subtitle}</span>}
        </div>
        <p style={{ margin: '10px 0 0', font: `500 12px ${FONT}`, color: ui.text.tertiary }}>
          {draft.active
            ? (willShowCount > 0 ? `Visible sur l'accueil avec ${willShowCount} événement${willShowCount > 1 ? 's' : ''}.` : 'Activé, mais aucun événement à venir → rien ne s\'affichera.')
            : 'Désactivé → masqué sur l\'accueil.'}
        </p>
      </div>

      {/* Enregistrer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onSave} disabled={saving}
          style={{ ...ui.btnPrimary, ...(saving ? ui.btnDisabled : {}) }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {msg && (
          <span style={{ font: `600 13px ${FONT}`, color: msg.ok ? '#4ee8c8' : '#ff9ed2' }}>{msg.text}</span>
        )}
      </div>
    </div>
  )
}

function IconBtn({ children, label, onClick, disabled, danger }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled}
      style={{
        width: 30, height: 30, borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: danger ? 'rgba(224,90,170,0.14)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${danger ? 'rgba(224,90,170,0.4)' : 'rgba(255,255,255,0.1)'}`,
        color: disabled ? 'rgba(255,255,255,0.25)' : (danger ? '#ff9ed2' : 'rgba(255,255,255,0.8)'),
        font: '700 13px Inter, sans-serif',
      }}>
      {children}
    </button>
  )
}
