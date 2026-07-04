import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { getStaffRole, addEventStaff, removeEventStaff, listenEventStaff, STAFF_ROLES, getActiveOrdersForStaff, reassignAndRemoveStaff } from '../utils/eventOrders'
import { searchUsers, getUserId } from '../utils/messaging'
import { isEventStarted } from '../utils/event-time'

// ── Gestion de l'équipe d'un événement (mini-POS soirée) ─────────────────────
// Le manager (organisateur propriétaire ou agent) invite des membres et leur
// attribue un rôle : « serveur » (prend/sert les commandes au bar) ou « scan »
// (contrôle des entrées). Le manager lui-même n'est jamais dans le roster —
// il l'est implicitement via la propriété de l'événement (getStaffRole).

const FONT = 'Inter, sans-serif'
const C = { teal: '#4ee8c8', gold: '#c8a96e', violet: '#8b5cf6', pink: '#e05aaa', red: 'rgba(220,100,100,0.9)' }

// Rôles invitables (le rôle « manager » reste réservé au propriétaire de l'event)
const INVITE_ROLES = [
  { value: STAFF_ROLES.SERVEUR, label: 'Serveur', desc: 'Prend et sert les commandes au bar', color: C.teal },
  { value: STAFF_ROLES.SCAN, label: 'Contrôle entrée', desc: 'Scanne les billets à l\'entrée', color: C.violet },
]

const ROLE_META = {
  manager: { label: 'Manager', color: C.gold },
  serveur: { label: 'Serveur', color: C.teal },
  scan: { label: 'Contrôle entrée', color: C.violet },
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
      fontFamily: FONT, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: m.color, background: `${m.color}1c`, border: `1px solid ${m.color}55`,
      borderRadius: 999, padding: '3px 9px', flexShrink: 0, whiteSpace: 'nowrap',
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

  // Roster temps réel (cross-device)
  useEffect(() => {
    const unsub = listenEventStaff(event.id, setRoster)
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
    setBusy(false)
    if (!res.ok) { notify(res.error || 'Impossible d\'ajouter ce membre.', true); return }
    const roleLabel = INVITE_ROLES.find(r => r.value === role)?.label || role
    notify(`${u.name || 'Membre'} ajouté comme ${roleLabel.toLowerCase()} · il sera prévenu.`)
    setQuery('')
    setRemoteResults([])
  }

  function remove(uid, name) {
    // Garde : si le membre a des commandes EN COURS (prises/non servies/non payées),
    // on ne le retire pas sec — ça laisserait ces additions sans acteur habilité.
    // On demande confirmation pour réattribuer ses commandes au manager puis retirer.
    const active = getActiveOrdersForStaff(event.id, uid)
    if (active.length > 0) {
      setConfirmRemove({ uid, name, count: active.length })
      return
    }
    const res = removeEventStaff(event.id, uid, byUser)
    if (!res.ok) { notify(res.error || 'Retrait impossible.', true); return }
    notify(`${name || 'Membre'} retiré de l'équipe.`)
  }

  async function doReassignRemove() {
    if (!confirmRemove || busy) return
    setBusy(true)
    // Réattribue au manager courant (toi) puis retire.
    const res = await reassignAndRemoveStaff(event.id, confirmRemove.uid, byUser, byUser)
    setBusy(false)
    const removed = confirmRemove
    setConfirmRemove(null)
    if (!res.ok) { notify(res.error || 'Retrait impossible.', true); return }
    notify(`${removed.name} retiré · ${res.reassigned} commande${res.reassigned > 1 ? 's' : ''} réattribuée${res.reassigned > 1 ? 's' : ''} à toi.`)
  }

  const rosterEntries = Object.entries(roster)
    .map(([uid, v]) => ({ uid, ...v }))
    .sort((a, b) => (a.addedAt || '').localeCompare(b.addedAt || ''))

  const isErr = message.startsWith('err:')
  const msgText = message.slice(message.indexOf(':') + 1)

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 440, maxHeight: '86vh', overflowY: 'auto',
        background: 'rgba(8,10,20,0.96)', backdropFilter: 'blur(22px) saturate(1.5)',
        border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, padding: 22,
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 15, background: 'rgba(78,232,200,0.04)', border: '1px solid rgba(78,232,200,0.14)', borderRadius: 14 }}>
              <p style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.65)', margin: 0 }}>Inviter un membre</p>

              {/* Rôle */}
              <div style={{ display: 'flex', gap: 8 }}>
                {INVITE_ROLES.map(r => {
                  const active = role === r.value
                  return (
                    <button key={r.value} onClick={() => setRole(r.value)} style={{
                      flex: 1, padding: '10px 8px', borderRadius: 11, cursor: 'pointer', textAlign: 'left',
                      border: active ? `1px solid ${r.color}88` : '1px solid rgba(255,255,255,0.10)',
                      background: active ? `${r.color}14` : 'rgba(255,255,255,0.02)',
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
                    width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 11,
                    background: 'rgba(6,8,16,0.6)', border: '1px solid rgba(255,255,255,0.12)',
                    fontFamily: FONT, fontSize: 14, color: '#fff', outline: 'none',
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
                    <div key={u.id || u.uid} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <Avatar name={u.name} avatar={u.avatar} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name || u.username || 'Membre'}</p>
                        <p style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username ? '@' + u.username : u.email}</p>
                      </div>
                      <button onClick={() => invite(u)} disabled={busy} style={{
                        flexShrink: 0, padding: '8px 14px', borderRadius: 999, cursor: busy ? 'default' : 'pointer',
                        border: 'none', color: '#04040b', fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
                        background: `linear-gradient(135deg, ${C.teal}, #7af0d8)`, opacity: busy ? 0.5 : 1,
                      }}>Ajouter</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Message */}
            {message && (
              <div style={{
                padding: '10px 14px', borderRadius: 11, fontFamily: FONT, fontSize: 13, textAlign: 'center',
                border: isErr ? '1px solid rgba(234,88,12,0.35)' : `1px solid ${C.teal}4d`,
                background: isErr ? 'rgba(234,88,12,0.08)' : 'rgba(78,232,200,0.07)',
                color: isErr ? '#fb923c' : C.teal,
              }}>{msgText}</div>
            )}

            {/* Roster */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', margin: '2px 0 0' }}>
                Mon équipe
              </p>

              {/* Manager (toi) — implicite, toujours affiché */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', borderRadius: 12, background: `${C.gold}0d`, border: `1px solid ${C.gold}33` }}>
                <Avatar name={user?.name} avatar={user?.avatar} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: FONT, fontSize: 14.5, fontWeight: 600, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || 'Toi'}</p>
                  <p style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '1px 0 0' }}>Organisateur · toi</p>
                </div>
                <RoleBadge role="manager" />
              </div>

              {rosterEntries.length === 0 ? (
                <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,0.32)', textAlign: 'center', padding: '10px 0', lineHeight: 1.6, margin: 0 }}>
                  Personne d'autre pour l'instant — invite tes serveurs ci-dessus.
                </p>
              ) : rosterEntries.map(m => (
                <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <Avatar name={m.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: FONT, fontSize: 14.5, fontWeight: 600, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name || 'Membre'}</p>
                    <p style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '1px 0 0' }}>Ajouté à l'équipe</p>
                  </div>
                  <RoleBadge role={m.role} />
                  <button onClick={() => remove(m.uid, m.name)} title="Retirer" style={{
                    flexShrink: 0, width: 30, height: 30, borderRadius: 9, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(220,50,50,0.07)', border: '1px solid rgba(220,50,50,0.20)', color: C.red,
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                </div>
              ))}
            </div>

            <p style={{ fontFamily: FONT, fontSize: 10.5, color: 'rgba(255,255,255,0.28)', lineHeight: 1.6, margin: 0 }}>
              Un <strong style={{ color: 'rgba(255,255,255,0.45)' }}>serveur</strong> prend et sert les commandes en mode Service du scanner. Un <strong style={{ color: 'rgba(255,255,255,0.45)' }}>contrôle entrée</strong> peut scanner les billets. Toi seul (manager) peux annuler une commande ou encaisser.
            </p>
          </>
        )}
      </div>

      {/* Confirmation : retrait d'un membre qui a des commandes en cours */}
      {confirmRemove && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => !busy && setConfirmRemove(null)}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} />
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 360, background: 'rgba(12,14,24,0.98)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>⚠️</span>
              <p style={{ fontFamily: FONT, fontSize: 17, fontWeight: 700, color: '#fff', margin: 0 }}>Commandes en cours</p>
            </div>
            <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.55 }}>
              <strong style={{ color: '#fff' }}>{confirmRemove.name}</strong> a <strong style={{ color: C.gold }}>{confirmRemove.count} commande{confirmRemove.count > 1 ? 's' : ''} en cours</strong> non servie{confirmRemove.count > 1 ? 's' : ''} ou non encaissée{confirmRemove.count > 1 ? 's' : ''}.
              {isEventStarted(event) && <span style={{ color: 'rgba(255,255,255,0.45)' }}> La soirée a commencé.</span>}
              {' '}Le retirer maintenant laisserait ces additions sans serveur. Veux-tu <strong style={{ color: C.teal }}>te les réattribuer</strong> puis le retirer ?
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
              <button onClick={() => setConfirmRemove(null)} disabled={busy} style={{ flex: 1, padding: '11px', borderRadius: 11, cursor: busy ? 'default' : 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', fontFamily: FONT, fontSize: 13.5, fontWeight: 600 }}>
                Annuler
              </button>
              <button onClick={doReassignRemove} disabled={busy} style={{ flex: 1.4, padding: '11px', borderRadius: 11, cursor: busy ? 'default' : 'pointer', background: `linear-gradient(135deg, ${C.teal}, #7af0d8)`, border: 'none', color: '#04040b', fontFamily: FONT, fontSize: 13.5, fontWeight: 800, opacity: busy ? 0.6 : 1 }}>
                {busy ? 'Réattribution…' : 'Réattribuer + retirer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
