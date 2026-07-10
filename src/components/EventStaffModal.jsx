import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getStaffRole, addEventStaff, removeEventStaff, listenEventStaff, STAFF_ROLES, getActiveOrdersForStaff, reassignAndRemoveStaff } from '../utils/eventOrders'
import { searchUsers, getUserId } from '../utils/messaging'
import { isEventStarted } from '../utils/event-time'
import { IconAlert, IconTrash } from './icons'

// ── Gestion de l'équipe d'un événement ────────────────────────────────────────
// Le manager (organisateur propriétaire ou agent) invite des membres et leur
// attribue un rôle : « serveur » (prend/sert les commandes au bar), « scan »
// (contrôle des entrées) ou « dj » (gestion de la playlist interactive).
// Le manager lui-même n'est jamais dans le roster — il l'est implicitement via
// la propriété de l'événement (getStaffRole).

const FONT = 'Inter, sans-serif'
const C = { teal: '#4ee8c8', gold: '#c8a96e', violet: '#8b5cf6', pink: '#e05aaa', red: 'rgba(220,100,100,0.9)' }

// Rôles invitables (le rôle « manager » reste réservé au propriétaire de l'event)
const INVITE_ROLES = [
  { value: STAFF_ROLES.SERVEUR, label: 'Serveur', desc: 'Prend et sert les commandes au bar', color: C.teal },
  { value: STAFF_ROLES.SCAN, label: 'Contrôle entrée', desc: 'Scanne les billets à l\'entrée', color: C.violet },
  { value: STAFF_ROLES.DJ, label: 'DJ', desc: 'Gère la playlist interactive de la soirée', color: C.pink },
]

const ROLE_META = {
  manager: { label: 'Manager', color: C.gold },
  serveur: { label: 'Serveur', color: C.teal },
  scan: { label: 'Contrôle entrée', color: C.violet },
  dj: { label: 'DJ', color: C.pink },
}

function Avatar({ name, avatar, size = 38 }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  return avatar ? (
    <img src={avatar} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
      fontFamily: FONT, fontWeight: 600, fontSize: size * 0.42, color: 'rgba(255,255,255,0.6)',
    }}>{initial}</div>
  )
}

function RoleBadge({ role }) {
  const m = ROLE_META[role] || { label: role, color: 'rgba(255,255,255,0.5)' }
  return (
    <span style={{
      fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      color: m.color, background: `${m.color}24`, border: `1px solid ${m.color}59`,
      borderRadius: 8, padding: '4px 10px', flexShrink: 0, whiteSpace: 'nowrap',
    }}>{m.label}</span>
  )
}

export default function EventStaffModal({ event, user, onClose }) {
  const [roster, setRoster] = useState(() => ({}))
  const [query, setQuery] = useState('')
  const [remoteResults, setRemoteResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [role, setRole] = useState(STAFF_ROLES.SERVEUR)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(null) // { uid, name, count } — retrait avec commandes en cours

  const myUid = user?.uid || getUserId(user)
  const myRole = getStaffRole(event.id, user, event)
  const isManager = myRole === 'manager'
  const byUser = useMemo(() => ({ ...user, uid: myUid, _staffRole: myRole }), [user, myUid, myRole])

  // Membres dont le retrait est en cours (anti-résurrection) : Firestore peut
  // réémettre un snapshot avec l'ancien état pendant la propagation du deleteField
  // (optimistic-apply/rollback) → sans garde, le membre « réapparaît » 2 s.
  const pendingRemovals = useRef(new Set())

  // Roster temps réel (cross-device), filtré des retraits en cours.
  useEffect(() => {
    const unsub = listenEventStaff(event.id, incoming => {
      const filtered = { ...incoming }
      for (const uid of pendingRemovals.current) {
        if (uid in filtered) delete filtered[uid]        // encore présent → on masque
        else pendingRemovals.current.delete(uid)          // absent → retrait confirmé
      }
      setRoster(filtered)
    })
    return () => unsub()
  }, [event.id])

  // Recherche : local (searchUsers) + fallback Firestore par email exact
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setRemoteResults([]); setSearching(false); return }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      let hits = []
      // Email exact → lookup Firestore (marche même si l'user n'est pas en cache local)
      if (q.includes('@')) {
        try {
          const [{ db }, { collection, query: fsQuery, where, getDocs }] = await Promise.all([
            import('../firebase'), import('firebase/firestore'),
          ])
          const snap = await getDocs(fsQuery(collection(db, 'users'), where('email', '==', q.toLowerCase())))
          hits = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        } catch { /* hors-ligne → on retombe sur le local */ }
      }
      if (cancelled) return
      setRemoteResults(hits)
      setSearching(false)
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query])

  // Résultats = local + distant, dédupliqués, hors moi et hors membres déjà présents
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const local = searchUsers(q)
    const merged = [...local, ...remoteResults]
    const seen = new Set()
    return merged.filter(u => {
      const id = u.id || u.uid
      if (!id || id === myUid) return false          // pas moi
      if (roster[id]) return false                    // déjà dans l'équipe
      if (seen.has(id)) return false                  // dédup
      seen.add(id)
      return true
    }).slice(0, 6)
  }, [query, remoteResults, roster, myUid])

  function notify(txt, isError = false) {
    setMessage((isError ? 'err:' : 'ok:') + txt)
    setTimeout(() => setMessage(''), 3500)
  }

  async function invite(u) {
    if (busy) return
    setBusy(true)
    const id = u.id || u.uid
    // eventName transmis → alimente l'index inversé staff_assignments (page « Mes
    // soirées » + notification côté membre, générée par son propre client).
    const res = await addEventStaff(event.id, id, role, u.name || u.username || 'Membre', byUser, event.name)
    if (!res.ok) { setBusy(false); notify(res.error || 'Impossible d\'ajouter ce membre.', true); return }
    // Inviter un DJ active implicitement la playlist interactive de l'événement,
    // sinon son bouton « Gérer la playlist » mènerait à une fiche sans onglet.
    if (role === STAFF_ROLES.DJ && !event.playlist) {
      try {
        const { syncDoc } = await import('../utils/firestore-sync')
        syncDoc(`events/${event.id}`, { playlist: true })
        event.playlist = true // reflète localement pour la suite de la session
      } catch {}
    }
    setBusy(false)
    const roleLabel = INVITE_ROLES.find(r => r.value === role)?.label || role
    notify(`${u.name || 'Membre'} ajouté comme ${roleLabel.toLowerCase()} · il sera prévenu.`)
    setQuery('')
    setRemoteResults([])
  }

  // Tout retrait passe par une CONFIRMATION. Le dialogue s'adapte : s'il a des
  // commandes en cours → réattribution au manager ; sinon → simple confirmation.
  function remove(uid, name) {
    const active = getActiveOrdersForStaff(event.id, uid)
    setConfirmRemove({ uid, name, count: active.length })
  }

  async function doConfirmRemove() {
    if (!confirmRemove || busy) return
    const { uid, name, count } = confirmRemove
    setBusy(true)
    // Optimiste : on masque le membre TOUT DE SUITE et on garde l'anti-résurrection
    // le temps que le deleteField se propage (fin du flicker « disparaît/réapparaît »).
    pendingRemovals.current.add(uid)
    setRoster(r => { const n = { ...r }; delete n[uid]; return n })
    const res = count > 0
      ? await reassignAndRemoveStaff(event.id, uid, byUser, byUser) // réattribue puis retire
      : await removeEventStaff(event.id, uid, byUser)
    setBusy(false)
    setConfirmRemove(null)
    if (!res.ok) {
      // Échec serveur → on lève la garde : le listener réaffichera le membre (rollback).
      pendingRemovals.current.delete(uid)
      notify(res.error || 'Retrait impossible.', true)
      return
    }
    notify(count > 0
      ? `${name} retiré · ${res.reassigned} commande${res.reassigned > 1 ? 's' : ''} réattribuée${res.reassigned > 1 ? 's' : ''} à toi.`
      : `${name || 'Membre'} retiré de l'équipe.`)
  }

  const rosterEntries = Object.entries(roster)
    .map(([uid, v]) => ({ uid, ...v }))
    .sort((a, b) => (a.addedAt || '').localeCompare(b.addedAt || ''))

  const isErr = message.startsWith('err:')
  const msgText = message.slice(message.indexOf(':') + 1)

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 440, maxHeight: '86vh', overflowY: 'auto',
        background: '#12131c',
        border: '1px solid rgba(255,255,255,0.10)', borderRadius: 20, padding: 22,
        boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="1.6"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <p style={{ fontFamily: FONT, fontSize: 21, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.4px' }}>Équipe de la soirée</p>
            </div>
            <p style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.5 }}>
              <span style={{ color: C.teal }}>{event.name}</span>
              {rosterEntries.length > 0 && <> · {rosterEntries.length} membre{rosterEntries.length > 1 ? 's' : ''}</>}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0, color: 'rgba(255,255,255,0.4)', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {!isManager ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
            <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.55 }}>
              Seul le <strong style={{ color: C.gold }}>manager</strong> de l'événement peut gérer l'équipe.
            </p>
          </div>
        ) : (
          <>
            {/* Invite */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 15, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
              <p style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.65)', margin: 0 }}>Inviter un membre</p>

              {/* Rôle */}
              <div style={{ display: 'flex', gap: 8 }}>
                {INVITE_ROLES.map(r => {
                  const active = role === r.value
                  return (
                    <button key={r.value} onClick={() => setRole(r.value)} style={{
                      flex: 1, padding: '10px 8px', borderRadius: 11, cursor: 'pointer', textAlign: 'left',
                      border: active ? `1px solid ${r.color}88` : '1px solid rgba(255,255,255,0.10)',
                      background: active ? `${r.color}22` : 'rgba(255,255,255,0.05)',
                    }}>
                      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: active ? r.color : 'rgba(255,255,255,0.75)' }}>{r.label}</span>
                      <span style={{ display: 'block', fontFamily: FONT, fontSize: 10.5, color: 'rgba(255,255,255,0.4)', marginTop: 2, lineHeight: 1.4 }}>{r.desc}</span>
                    </button>
                  )
                })}
              </div>

              {/* Recherche */}
              <div style={{ position: 'relative' }}>
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Nom, pseudo ou email…"
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10,
                    background: '#0b0c12', border: '1px solid rgba(255,255,255,0.12)',
                    fontFamily: FONT, fontSize: 14, color: 'rgba(255,255,255,0.92)', outline: 'none',
                  }}
                  onFocus={e => (e.target.style.borderColor = C.teal)}
                  onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
                />
              </div>

              {/* Résultats */}
              {query.trim().length >= 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {results.length === 0 ? (
                    <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,0.38)', margin: 0, textAlign: 'center', padding: '6px 0', lineHeight: 1.5 }}>
                      {searching ? 'Recherche…' : <>Aucun membre trouvé. Essaie son <strong>email exact</strong> — il doit avoir un compte LIVEINBLACK.</>}
                    </p>
                  ) : results.map(u => (
                    <div key={u.id || u.uid} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <Avatar name={u.name} avatar={u.avatar} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || u.username || 'Membre'}</p>
                        <p style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username ? '@' + u.username : u.email}</p>
                      </div>
                      <button onClick={() => invite(u)} disabled={busy} style={{
                        flexShrink: 0, padding: '8px 14px', borderRadius: 10, cursor: busy ? 'not-allowed' : 'pointer',
                        border: busy ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
                        color: busy ? 'rgba(255,255,255,0.35)' : '#04120e', fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
                        background: busy ? 'rgba(255,255,255,0.07)' : '#3ed6b5',
                      }}>Ajouter</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Message */}
            {message && (
              <div style={{
                padding: '10px 14px', borderRadius: 12, fontFamily: FONT, fontSize: 13, textAlign: 'center',
                border: isErr ? '1px solid rgba(224,90,170,0.5)' : '1px solid rgba(78,232,200,0.5)',
                background: 'rgba(12,12,22,0.96)',
                color: '#fff',
              }}>{msgText}</div>
            )}

            {/* Roster */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>
                Mon équipe
              </p>

              {/* Manager (toi) — implicite, toujours affiché */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: '3px solid rgba(200,169,110,0.55)' }}>
                <Avatar name={user?.name} avatar={user?.avatar} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: FONT, fontSize: 14.5, fontWeight: 600, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || 'Toi'}</p>
                  <p style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '1px 0 0' }}>Organisateur · toi</p>
                </div>
                <RoleBadge role="manager" />
              </div>

              {rosterEntries.length === 0 ? (
                <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '10px 0', lineHeight: 1.6, margin: 0 }}>
                  Personne d'autre pour l'instant. Invite tes serveurs, contrôleurs d'entrée ou ton DJ ci-dessus.
                </p>
              ) : rosterEntries.map(m => (
                <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <Avatar name={m.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: FONT, fontSize: 14.5, fontWeight: 600, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name || 'Membre'}</p>
                    <p style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '1px 0 0' }}>Ajouté à l'équipe</p>
                  </div>
                  <RoleBadge role={m.role} />
                  <button onClick={() => remove(m.uid, m.name)} title="Retirer" style={{
                    flexShrink: 0, width: 30, height: 30, borderRadius: 9, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(224,90,170,0.14)', border: '1px solid rgba(224,90,170,0.45)', color: '#ff9ed2',
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                </div>
              ))}
            </div>

            <p style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: 0 }}>
              Un <strong style={{ color: 'rgba(255,255,255,0.75)' }}>serveur</strong> prend et sert les commandes en mode Service du scanner. Un <strong style={{ color: 'rgba(255,255,255,0.75)' }}>contrôle entrée</strong> peut scanner les billets. Un <strong style={{ color: 'rgba(255,255,255,0.75)' }}>DJ</strong> gère la playlist interactive (sons proposés, validation, en cours de lecture) — sans accès au scanner ni au bar. Toi seul (manager) peux annuler une commande ou consulter l'historique.
            </p>
          </>
        )}
      </div>

      {/* Confirmation de retrait — texte adaptatif selon les commandes en cours */}
      {confirmRemove && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => !busy && setConfirmRemove(null)}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} />
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 360, background: '#12131c', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 22, boxShadow: '0 24px 64px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: confirmRemove.count > 0 ? 'rgba(200,169,110,0.12)' : 'rgba(224,90,170,0.12)', border: `1px solid ${confirmRemove.count > 0 ? 'rgba(200,169,110,0.35)' : 'rgba(224,90,170,0.35)'}` }}>
                {confirmRemove.count > 0 ? <IconAlert size={18} color="#c8a96e" /> : <IconTrash size={18} color="#e05aaa" />}
              </span>
              <p style={{ fontFamily: FONT, fontSize: 17, fontWeight: 700, color: '#fff', margin: 0 }}>
                {confirmRemove.count > 0 ? 'Commandes en cours' : 'Retirer de l\'équipe ?'}
              </p>
            </div>
            <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.55 }}>
              {confirmRemove.count > 0 ? (
                <>
                  <strong style={{ color: '#fff' }}>{confirmRemove.name}</strong> a <strong style={{ color: C.gold }}>{confirmRemove.count} commande{confirmRemove.count > 1 ? 's' : ''} en cours</strong> non servie{confirmRemove.count > 1 ? 's' : ''} ou non encaissée{confirmRemove.count > 1 ? 's' : ''}.
                  {isEventStarted(event) && <span style={{ color: 'rgba(255,255,255,0.45)' }}> La soirée a commencé.</span>}
                  {' '}Le retirer laisserait ces additions sans serveur. Veux-tu <strong style={{ color: C.teal }}>te les réattribuer</strong> puis le retirer ?
                </>
              ) : (
                <><strong style={{ color: '#fff' }}>{confirmRemove.name}</strong> n'aura plus accès au scanner de cette soirée. Tu pourras le réinviter à tout moment.</>
              )}
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
              <button onClick={() => setConfirmRemove(null)} disabled={busy} style={{ flex: 1, padding: '11px', borderRadius: 12, cursor: busy ? 'not-allowed' : 'pointer', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.9)', fontFamily: FONT, fontSize: 13.5, fontWeight: 600 }}>
                Annuler
              </button>
              <button onClick={doConfirmRemove} disabled={busy} style={{ flex: 1.4, padding: '11px', borderRadius: 12, cursor: busy ? 'not-allowed' : 'pointer', background: busy ? 'rgba(255,255,255,0.07)' : confirmRemove.count > 0 ? '#3ed6b5' : '#c2347f', border: busy ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent', color: busy ? 'rgba(255,255,255,0.35)' : confirmRemove.count > 0 ? '#04120e' : '#fff', fontFamily: FONT, fontSize: 13.5, fontWeight: 700 }}>
                {busy ? <span className="lib-spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', verticalAlign: '-2px' }} /> : confirmRemove.count > 0 ? 'Réattribuer et retirer' : 'Retirer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
