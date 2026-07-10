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

import { useEffect, useRef, useState } from 'react'
import ui from '../styles/ui'
import { useAuth } from '../context/AuthContext'
import { isClientDiscoverableEvent } from '../utils/eventDiscovery'
import {
  listenActualite, saveActualite, normalizeActualite,
  defaultActualite, ACTUALITE_ACCENTS,
} from '../utils/homepageConfig'

const FONT = 'Inter, sans-serif'

export default function ActualiteAdminPanel({ allEvents = [] }) {
  const { user } = useAuth()
  const [draft, setDraft] = useState(defaultActualite())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null) // { ok, text }
  const seededRef = useRef(false)

  // Chargement initial (une seule fois) — on n'écrase pas les modifs en cours
  // si un snapshot arrive pendant l'édition.
  useEffect(() => {
    const unsub = listenActualite(cfg => {
      if (!seededRef.current) {
        seededRef.current = true
        setDraft(cfg)
      }
    })
    return unsub
  }, [])

  const cfg = normalizeActualite(draft)
  const selectedIds = cfg.eventIds
  const selectedSet = new Set(selectedIds)

  // Événements sélectionnés, dans l'ordre curé (résolus depuis allEvents).
  const byId = new Map(allEvents.map(e => [String(e.id), e]))
  const selectedEvents = selectedIds.map(id => byId.get(String(id))).filter(Boolean)

  // Candidats à l'ajout : événements découvrables, non déjà sélectionnés,
  // filtrés par la recherche, triés par date la plus proche.
  const q = search.trim().toLowerCase()
  const candidates = allEvents
    .filter(e => isClientDiscoverableEvent(e))
    .filter(e => !selectedSet.has(String(e.id)))
    .filter(e => !q || `${e.name || ''} ${e.city || ''} ${e.region || ''}`.toLowerCase().includes(q))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 30)

  function patch(p) { setDraft(d => ({ ...normalizeActualite(d), ...p })); setMsg(null) }
  function addEvent(id) { patch({ eventIds: [...selectedIds, String(id)] }) }
  function removeEvent(id) { patch({ eventIds: selectedIds.filter(x => x !== String(id)) }) }
  function move(id, dir) {
    const i = selectedIds.indexOf(String(id))
    const j = i + dir
    if (i < 0 || j < 0 || j >= selectedIds.length) return
    const next = [...selectedIds]
    ;[next[i], next[j]] = [next[j], next[i]]
    patch({ eventIds: next })
  }

  async function onSave() {
    setSaving(true); setMsg(null)
    const res = await saveActualite(cfg, user?.uid || '')
    setSaving(false)
    setMsg(res.ok
      ? { ok: true, text: 'Enregistré. Le carrousel est à jour sur l\'accueil.' }
      : { ok: false, text: `Échec de l'enregistrement : ${res.error || 'réessaie'}.` })
  }

  const activeAccent = ACTUALITE_ACCENTS[cfg.accent] || ACTUALITE_ACCENTS.teal

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
              {cfg.active ? 'Le carrousel est visible par les visiteurs.' : 'Masqué — personne ne le voit.'}
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={cfg.active}
            onClick={() => patch({ active: !cfg.active })}
            style={{
              flexShrink: 0, width: 48, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer',
              background: cfg.active ? '#3ed6b5' : 'rgba(255,255,255,0.14)', position: 'relative', transition: 'background 0.2s',
            }}>
            <span style={{ position: 'absolute', top: 3, left: cfg.active ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </button>
        </label>

        <div>
          <span style={ui.label}>Accent</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.values(ACTUALITE_ACCENTS).map(a => (
              <button key={a.key} type="button" onClick={() => patch({ accent: a.key })}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                  background: cfg.accent === a.key ? a.soft : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${cfg.accent === a.key ? a.border : 'rgba(255,255,255,0.08)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  font: `700 12px ${FONT}`, color: cfg.accent === a.key ? a.dot : ui.text.secondary,
                }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: a.dot }} />
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Titre + sous-titre */}
      <div style={{ ...ui.card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <span style={ui.label}>Titre</span>
          <input style={ui.input} value={cfg.title} maxLength={80}
            onChange={e => patch({ title: e.target.value })} placeholder="L'actu du moment" />
        </div>
        <div>
          <span style={ui.label}>Sous-titre</span>
          <input style={ui.input} value={cfg.subtitle} maxLength={140}
            onChange={e => patch({ subtitle: e.target.value })} placeholder="Les temps forts à ne pas manquer" />
        </div>
      </div>

      {/* Événements sélectionnés (ordre curé) */}
      <div style={{ ...ui.card, padding: '16px 18px' }}>
        <span style={{ ...ui.label, marginBottom: 10 }}>À la une ({selectedEvents.length})</span>
        {selectedEvents.length === 0 ? (
          <p style={{ margin: 0, font: `500 13px ${FONT}`, color: ui.text.tertiary }}>
            Aucun événement choisi. Ajoute-en depuis la liste ci-dessous.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedEvents.map((ev, i) => (
              <div key={ev.id} style={{ ...ui.inset, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ font: `700 12px ${FONT}`, color: ui.text.tertiary, width: 18, textAlign: 'center' }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', font: `700 13px ${FONT}`, color: ui.text.primary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.name}</span>
                  <span style={{ display: 'block', font: `500 11px ${FONT}`, color: ui.text.tertiary }}>{[ev.date, ev.city || ev.region].filter(Boolean).join(' · ')}</span>
                </span>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <IconBtn label="Monter" disabled={i === 0} onClick={() => move(ev.id, -1)}>↑</IconBtn>
                  <IconBtn label="Descendre" disabled={i === selectedEvents.length - 1} onClick={() => move(ev.id, +1)}>↓</IconBtn>
                  <IconBtn label="Retirer" danger onClick={() => removeEvent(ev.id)}>✕</IconBtn>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ajout d'événements */}
      <div style={{ ...ui.card, padding: '16px 18px' }}>
        <span style={{ ...ui.label, marginBottom: 10 }}>Ajouter un événement</span>
        <input style={{ ...ui.input, marginBottom: 10 }} value={search}
          onChange={e => setSearch(e.target.value)} placeholder="Rechercher par nom, ville…" />
        {candidates.length === 0 ? (
          <p style={{ margin: 0, font: `500 13px ${FONT}`, color: ui.text.tertiary }}>
            {q ? 'Aucun événement à venir ne correspond.' : 'Aucun autre événement à venir.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
            {candidates.map(ev => (
              <button key={ev.id} type="button" onClick={() => addEvent(ev.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer',
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

      {/* Aperçu de l'en-tête */}
      <div style={{ ...ui.card, padding: '16px 18px' }}>
        <span style={{ ...ui.label, marginBottom: 10 }}>Aperçu</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 8, background: activeAccent.soft, border: `1px solid ${activeAccent.border}` }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: activeAccent.dot }} />
            <span style={{ font: `700 11px ${FONT}`, letterSpacing: '0.04em', textTransform: 'uppercase', color: activeAccent.dot }}>{cfg.title}</span>
          </span>
          {cfg.subtitle && <span style={{ font: `500 12px ${FONT}`, color: ui.text.secondary }}>{cfg.subtitle}</span>}
        </div>
        <p style={{ margin: '10px 0 0', font: `500 12px ${FONT}`, color: ui.text.tertiary }}>
          {cfg.active
            ? (selectedEvents.length ? `Visible sur l'accueil avec ${selectedEvents.length} événement${selectedEvents.length > 1 ? 's' : ''}.` : 'Activé, mais aucun événement à venir → rien ne s\'affichera.')
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
