'use client'

// Port de src/components/EventStaffModal.jsx (Phase 7, #78) — « Équipe de la
// soirée » : l'organisateur invite des membres et leur attribue un rôle
// (serveur / contrôle entrée / DJ) pour UN événement.
//
// Divergences volontaires vs. legacy (déjà actées par la spec de ce port, pas
// des oublis) :
//   1. Cette modale n'est jamais ouverte par quelqu'un d'autre que le
//      propriétaire de l'événement (la route GET /staff 403 tout non-owner) —
//      la branche legacy « Seul le manager peut gérer l'équipe » n'a donc pas
//      d'équivalent ici, elle est supprimée.
//   2. Le retrait n'a plus qu'UNE confirmation (pas de variante « commandes en
//      cours » pré-vérifiée côté client) — DELETE réattribue atomiquement et
//      renvoie reassignedCount ; le message de succès s'adapte APRÈS coup.
//   3. Le propriétaire n'apparaît plus comme ligne « Manager » non-retirable
//      dans le roster : l'API ne renvoie que les membres invités.
//   4. Pas de concept pseudo/@handle ici (contrairement au legacy) — la
//      recherche affiche nom + email.

import { useEffect, useMemo, useRef, useState } from 'react'

const FONT = 'Inter, sans-serif'
// Mirroir des tokens définis dans app/globals.css (:root) — repris en constantes
// hex locales pour permettre la composition alpha (`${color}24` etc.), ce que
// `var(--teal)` ne permet pas en concaténation de chaîne.
const C = { teal: '#4ee8c8', gold: '#c8a96e', violet: '#8b5cf6', pink: '#e05aaa' }

type InviteRole = 'serveur' | 'scan' | 'dj'

const INVITE_ROLES: { value: InviteRole; label: string; desc: string; color: string }[] = [
  { value: 'serveur', label: 'Serveur', desc: 'Prend et sert les commandes au bar', color: C.teal },
  { value: 'scan', label: 'Contrôle entrée', desc: "Scanne les billets à l'entrée", color: C.violet },
  { value: 'dj', label: 'DJ', desc: 'Gère la playlist interactive de la soirée', color: C.pink },
]

const ROLE_META: Record<string, { label: string; color: string }> = {
  serveur: { label: 'Serveur', color: C.teal },
  scan: { label: 'Contrôle entrée', color: C.violet },
  dj: { label: 'DJ', color: C.pink },
}

interface StaffMember {
  userId: string
  role: string
  name: string
  addedAt: string
}

interface SearchUser {
  userId: string
  name: string
  email: string
}

interface StaffListResponse {
  ok: true
  members: StaffMember[]
}
interface ErrorResponse {
  ok?: false
  error: string
}

interface SearchResponse {
  ok: true
  users: SearchUser[]
}

interface AddStaffResponse {
  ok: true
  member: StaffMember
}

interface RemoveStaffResponse {
  ok: true
  reassignedCount: number
}

interface EventStaffModalProps {
  event: { id: string; name: string }
  onClose: () => void
}

function Avatar({ name, size = 38 }: { name?: string; size?: number }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.10)',
        fontFamily: FONT,
        fontWeight: 600,
        fontSize: size * 0.42,
        color: 'rgba(255,255,255,0.6)',
      }}
    >
      {initial}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const m = ROLE_META[role] || { label: role, color: 'rgba(255,255,255,0.5)' }
  return (
    <span
      style={{
        fontFamily: FONT,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: m.color,
        background: `${m.color}24`,
        border: `1px solid ${m.color}59`,
        borderRadius: 8,
        padding: '4px 10px',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {m.label}
    </span>
  )
}

function Spinner({ size = 16, color = 'rgba(255,255,255,0.6)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'inline-block' }} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={3} />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}

function IconAlert({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 L1.82 18 a2 2 0 0 0 1.71 3 h16.94 a2 2 0 0 0 1.71 -3 L13.71 3.86 a2 2 0 0 0 -3.42 0 z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12" y2="17" />
    </svg>
  )
}

export default function EventStaffModal({ event, onClose }: EventStaffModalProps) {
  const [members, setMembers] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchUser[]>([])
  const [searching, setSearching] = useState(false)

  const [role, setRole] = useState<InviteRole>('serveur')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; name: string } | null>(null)

  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/organizer-events/${event.id}/staff`)
      .then(async (res) => {
        const data = (await res.json()) as StaffListResponse | ErrorResponse
        if (cancelled) return
        if (!res.ok || !('ok' in data) || !data.ok) {
          setLoadError(('error' in data && data.error) || 'load_failed')
          setLoading(false)
          return
        }
        setMembers(data.members)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('network_error')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [event.id])

  // Recherche débouncée (350 ms, min 2 caractères) — mêmes seuils que legacy,
  // sur /api/users/search (nom/prénom/email — pas de pseudo dans ce modèle).
  useEffect(() => {
    // Requête trop courte : rien à chercher — les résultats affichés sont de
    // toute façon dérivés de `query` via `visibleResults` ci-dessous (jamais
    // rendus sous 2 caractères), donc pas besoin de reset ici (évite un
    // setState synchrone dans le corps de l'effet).
    const q = query.trim()
    if (q.length < 2) return
    let cancelled = false
    const t = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`)
        const data = (await res.json()) as SearchResponse | ErrorResponse
        if (cancelled) return
        if (!res.ok || !('ok' in data) || !data.ok) {
          setResults([])
        } else {
          setResults(data.users)
        }
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members])

  const visibleResults = useMemo(() => {
    if (query.trim().length < 2) return []
    return results.filter((u) => !memberIds.has(u.userId)).slice(0, 6)
  }, [results, memberIds, query])

  function notify(txt: string, isError = false) {
    setMessage((isError ? 'err:' : 'ok:') + txt)
    if (messageTimer.current) clearTimeout(messageTimer.current)
    messageTimer.current = setTimeout(() => setMessage(''), 3500)
  }

  useEffect(() => {
    return () => {
      if (messageTimer.current) clearTimeout(messageTimer.current)
    }
  }, [])

  const ADD_ERROR_MESSAGES: Record<string, string> = {
    already_staff: 'Ce membre fait déjà partie de l\'équipe.',
    user_not_found: 'Utilisateur introuvable.',
    cannot_invite_self: 'Tu ne peux pas t\'inviter toi-même.',
  }

  async function invite(u: SearchUser) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/organizer-events/${event.id}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: u.userId, role }),
      })
      const data = (await res.json()) as AddStaffResponse | ErrorResponse
      if (!res.ok || !('ok' in data) || !data.ok) {
        const err = 'error' in data ? data.error : ''
        notify(ADD_ERROR_MESSAGES[err] || 'Impossible d\'ajouter ce membre.', true)
        return
      }
      setMembers((prev) => [...prev, data.member])
      const roleLabel = INVITE_ROLES.find((r) => r.value === role)?.label || role
      notify(`${u.name || 'Membre'} ajouté comme ${roleLabel.toLowerCase()} · il sera prévenu.`)
      setQuery('')
      setResults([])
    } finally {
      setBusy(false)
    }
  }

  function askRemove(userId: string, name: string) {
    setConfirmRemove({ userId, name })
  }

  async function doConfirmRemove() {
    if (!confirmRemove || busy) return
    const { userId, name } = confirmRemove
    setBusy(true)
    try {
      const res = await fetch(`/api/organizer-events/${event.id}/staff`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId }),
      })
      const data = (await res.json()) as RemoveStaffResponse | ErrorResponse
      setConfirmRemove(null)
      if (!res.ok || !('ok' in data) || !data.ok) {
        notify(('error' in data && data.error) || 'Retrait impossible.', true)
        return
      }
      setMembers((prev) => prev.filter((m) => m.userId !== userId))
      notify(
        data.reassignedCount > 0
          ? `${name} retiré — ${data.reassignedCount} commande(s) en cours réattribuée(s) à toi.`
          : `${name || 'Membre'} retiré de l'équipe.`
      )
    } finally {
      setBusy(false)
    }
  }

  const rosterEntries = useMemo(() => [...members].sort((a, b) => (a.addedAt || '').localeCompare(b.addedAt || '')), [members])

  const isErr = message.startsWith('err:')
  const msgText = message.slice(message.indexOf(':') + 1)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(3,4,8,0.72)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          maxHeight: '88vh',
          overflowY: 'auto',
          background: 'var(--surface-2)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 20,
          padding: 22,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <button
          onClick={onClose}
          aria-label="Fermer"
          style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 0, color: 'rgba(255,255,255,0.5)', fontSize: 26, cursor: 'pointer', lineHeight: 1 }}
        >
          ×
        </button>

        {/* Header */}
        <div style={{ paddingRight: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="1.6">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p style={{ fontFamily: FONT, fontSize: 21, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.4px' }}>Équipe de la soirée</p>
          </div>
          <p style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.5 }}>
            <span style={{ color: C.teal }}>{event.name}</span>
            {rosterEntries.length > 0 && (
              <>
                {' '}· {rosterEntries.length} membre{rosterEntries.length > 1 ? 's' : ''}
              </>
            )}
          </p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '20px 0' }}>
            <Spinner />
            <p style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>Chargement…</p>
          </div>
        ) : loadError ? (
          <p style={{ fontFamily: FONT, fontSize: 13, color: '#ff9ed2', textAlign: 'center', padding: '20px 0', margin: 0 }}>
            Impossible de charger l&apos;équipe — vérifie ta connexion.
          </p>
        ) : (
          <>
            {/* Invite */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 15, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
              <p style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: 'rgba(255,255,255,0.65)', margin: 0 }}>Inviter un membre</p>

              {/* Rôle */}
              <div style={{ display: 'flex', gap: 8 }}>
                {INVITE_ROLES.map((r) => {
                  const active = role === r.value
                  return (
                    <button
                      key={r.value}
                      onClick={() => setRole(r.value)}
                      style={{
                        flex: 1,
                        padding: '10px 8px',
                        borderRadius: 11,
                        cursor: 'pointer',
                        textAlign: 'left',
                        border: active ? `1px solid ${r.color}88` : '1px solid rgba(255,255,255,0.10)',
                        background: active ? `${r.color}22` : 'rgba(255,255,255,0.05)',
                      }}
                    >
                      <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: active ? r.color : 'rgba(255,255,255,0.75)' }}>{r.label}</span>
                      <span style={{ display: 'block', fontFamily: FONT, fontSize: 10.5, color: 'rgba(255,255,255,0.4)', marginTop: 2, lineHeight: 1.4 }}>{r.desc}</span>
                    </button>
                  )
                })}
              </div>

              {/* Recherche */}
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom ou email…"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: '#0b0c12',
                  border: '1px solid rgba(255,255,255,0.12)',
                  fontFamily: FONT,
                  fontSize: 14,
                  color: 'rgba(255,255,255,0.92)',
                  outline: 'none',
                }}
                onFocus={(e) => (e.target.style.borderColor = C.teal)}
                onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
              />

              {/* Résultats */}
              {query.trim().length > 0 && query.trim().length < 2 ? (
                <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,0.38)', margin: 0, textAlign: 'center', padding: '6px 0' }}>Tape au moins 2 caractères.</p>
              ) : query.trim().length >= 2 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {visibleResults.length === 0 ? (
                    <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(255,255,255,0.38)', margin: 0, textAlign: 'center', padding: '6px 0', lineHeight: 1.5 }}>
                      {searching ? (
                        'Recherche…'
                      ) : (
                        <>
                          Aucun membre trouvé. Cherche par <strong>nom ou email</strong> — la personne doit avoir un compte LIVEINBLACK.
                        </>
                      )}
                    </p>
                  ) : (
                    visibleResults.map((u) => (
                      <div
                        key={u.userId}
                        style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 11px', borderRadius: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                      >
                        <Avatar name={u.name} size={36} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.name || 'Membre'}
                          </p>
                          <p style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.email}
                          </p>
                        </div>
                        <button
                          onClick={() => invite(u)}
                          disabled={busy}
                          style={{
                            flexShrink: 0,
                            padding: '8px 14px',
                            borderRadius: 10,
                            cursor: busy ? 'not-allowed' : 'pointer',
                            border: busy ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
                            color: busy ? 'rgba(255,255,255,0.35)' : '#04120e',
                            fontFamily: FONT,
                            fontSize: 12.5,
                            fontWeight: 700,
                            background: busy ? 'rgba(255,255,255,0.07)' : '#3ed6b5',
                          }}
                        >
                          {busy ? 'Ajout…' : 'Ajouter'}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            {/* Message */}
            {message && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  fontFamily: FONT,
                  fontSize: 13,
                  textAlign: 'center',
                  border: isErr ? '1px solid rgba(224,90,170,0.5)' : '1px solid rgba(78,232,200,0.5)',
                  background: 'rgba(12,12,22,0.96)',
                  color: '#fff',
                }}
              >
                {msgText}
              </div>
            )}

            {/* Roster */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p
                style={{
                  fontFamily: FONT,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.4)',
                  margin: '2px 0 0',
                }}
              >
                Mon équipe
              </p>

              {rosterEntries.length === 0 ? (
                <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '10px 0', lineHeight: 1.6, margin: 0 }}>
                  Personne d&apos;autre pour l&apos;instant. Invite tes serveurs, contrôleurs d&apos;entrée ou ton DJ ci-dessus.
                </p>
              ) : (
                rosterEntries.map((m) => (
                  <div
                    key={m.userId}
                    style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <Avatar name={m.name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: FONT, fontSize: 14.5, fontWeight: 600, color: '#fff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.name || 'Membre'}
                      </p>
                      <p style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '1px 0 0' }}>Ajouté à l&apos;équipe</p>
                    </div>
                    <RoleBadge role={m.role} />
                    <button
                      onClick={() => askRemove(m.userId, m.name)}
                      title="Retirer"
                      style={{
                        flexShrink: 0,
                        width: 30,
                        height: 30,
                        borderRadius: 9,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(224,90,170,0.14)',
                        border: '1px solid rgba(224,90,170,0.45)',
                        color: '#ff9ed2',
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>

            <p style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: 0 }}>
              Un <strong style={{ color: 'rgba(255,255,255,0.75)' }}>serveur</strong> prend et sert les commandes en mode Service du scanner. Un{' '}
              <strong style={{ color: 'rgba(255,255,255,0.75)' }}>contrôle entrée</strong> peut scanner les billets. Un <strong style={{ color: 'rgba(255,255,255,0.75)' }}>DJ</strong> gère la
              playlist interactive (sons proposés, validation, en cours de lecture) — sans accès au scanner ni au bar. Toi seul (manager) peux annuler une commande ou consulter l&apos;historique.
            </p>
          </>
        )}
      </div>

      {/* Confirmation de retrait */}
      {confirmRemove && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 3010, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => !busy && setConfirmRemove(null)}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 360,
              background: 'var(--surface-2)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 16,
              padding: 22,
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(224,90,170,0.12)',
                  border: '1px solid rgba(224,90,170,0.35)',
                }}
              >
                <IconAlert size={18} color="var(--pink)" />
              </span>
              <p style={{ fontFamily: FONT, fontSize: 17, fontWeight: 700, color: '#fff', margin: 0 }}>Retirer de l&apos;équipe ?</p>
            </div>
            <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.55 }}>
              <strong style={{ color: '#fff' }}>{confirmRemove.name}</strong> n&apos;aura plus accès au scanner de cette soirée. Tu pourras le réinviter à tout moment.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
              <button
                onClick={() => setConfirmRemove(null)}
                disabled={busy}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: 12,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  color: 'rgba(255,255,255,0.9)',
                  fontFamily: FONT,
                  fontSize: 13.5,
                  fontWeight: 600,
                }}
              >
                Annuler
              </button>
              <button
                onClick={doConfirmRemove}
                disabled={busy}
                style={{
                  flex: 1.4,
                  padding: '11px',
                  borderRadius: 12,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  background: busy ? 'rgba(255,255,255,0.07)' : 'var(--pink)',
                  border: busy ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
                  color: busy ? 'rgba(255,255,255,0.35)' : '#fff',
                  fontFamily: FONT,
                  fontSize: 13.5,
                  fontWeight: 700,
                }}
              >
                {busy ? 'Retrait…' : 'Retirer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
