import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'
import { getBalance } from '../utils/wallet'
import { ROLES, getTotalPendingCount, getEnabledRoles, switchActiveRole, requestAdditionalRole, cancelRoleRequest } from '../utils/accounts'

const dmMono = "'DM Mono', monospace"
const cormorant = "'Cormorant Garamond', serif"

// Role display config
const ROLE_CONFIG = {
  client:       { label: 'Client',       icon: '🎫', color: '#22c55e', desc: 'Réserver des événements' },
  user:         { label: 'Client',       icon: '🎫', color: '#22c55e', desc: 'Réserver des événements' },
  organisateur: { label: 'Organisateur', icon: '🎪', color: '#3b82f6', desc: 'Gérer mes événements' },
  prestataire:  { label: 'Prestataire',  icon: '🎤', color: '#8b5cf6', desc: 'Mes services & prestations' },
  agent:        { label: 'Admin',        icon: '🔑', color: '#d4af37', desc: 'Interface administration' },
}

export default function SideMenu({ open, onClose }) {
  const navigate = useNavigate()
  const { user, setUser } = useAuth()
  const balance = user ? getBalance(getUserId(user)) : 0
  const pendingCount = user?.role === 'agent' ? getTotalPendingCount() : 0
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [requestingRole, setRequestingRole] = useState(null) // 'organisateur' | 'prestataire'

  const activeRole    = user?.role || 'client'
  const enabledRoles  = user ? getEnabledRoles(user) : []
  const isAgent       = activeRole === 'agent'
  const isClient      = activeRole === 'client' || activeRole === 'user'
  const orgStatus     = user?.orgStatus || 'none'
  const prestStatus   = user?.prestStatus || 'none'

  function go(path) {
    navigate(path)
    onClose()
  }

  function logout() {
    setConfirmLogout(false)
    setUser(null)
    navigate('/accueil')
    onClose()
  }

  async function handleSwitchRole(newRole) {
    if (!user || switching) return
    setSwitching(true)
    try {
      const updatedUser = await switchActiveRole(user, newRole)
      setUser(updatedUser)
      onClose()
      // Redirect to the right home based on role
      if (newRole === 'agent') navigate('/agent')
      else navigate('/accueil')
    } finally {
      setSwitching(false)
    }
  }

  async function handleRequestRole(role, prestType = null) {
    if (!user) return
    setRequestingRole(role)
    try {
      await requestAdditionalRole(user, role, prestType)
      // Update local user state to show pending status
      const patch = role === 'organisateur'
        ? { orgStatus: 'pending' }
        : { prestStatus: 'pending' }
      setUser({ ...user, ...patch })
    } finally {
      setRequestingRole(null)
    }
  }

  // Status helpers
  function getRoleRequestStatus(role) {
    if (role === 'organisateur') return orgStatus
    if (role === 'prestataire') return prestStatus
    return 'none'
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 left-0 bottom-0 z-50 w-72 border-r border-white/[0.07] flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'rgba(6,6,14,0.92)', backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)' }}
      >
        {/* ── Header ── */}
        {user ? (
          <div style={{ padding: '28px 24px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                fontFamily: cormorant, fontSize: 18, color: 'rgba(255,255,255,0.7)',
              }}>
                {user.avatar
                  ? <img src={user.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : user.name?.[0]?.toUpperCase() || '?'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: cormorant, fontSize: 18, fontWeight: 400, color: 'rgba(255,255,255,0.9)', lineHeight: 1.2, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name || 'Utilisateur'}
                </p>
                <p style={{ fontFamily: dmMono, fontSize: 9, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.28)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.email || ''}
                </p>
              </div>
            </div>

            {/* Active role badge + balance/points */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {user.role && ROLES[user.role] && (
                <span className="badge" style={{ background: ROLES[user.role].color + '14', border: `1px solid ${ROLES[user.role].color}44`, color: ROLES[user.role].color }}>
                  {ROLES[user.role].icon} {ROLES[user.role].label}
                </span>
              )}
              {user.status === 'pending' && (
                <span className="badge" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
                  En attente
                </span>
              )}
              <span className="badge badge-upcoming">{user.points || 0} pts</span>
              {!isAgent && (
                <button onClick={() => go('/portefeuille')} className="badge badge-live" style={{ cursor: 'pointer' }}>
                  {balance.toFixed(0)} €
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Guest header */
          <div style={{ padding: '28px 24px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontFamily: cormorant, fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.85)', marginBottom: 6 }}>
              LIVEINBLACK
            </p>
            <p style={{ fontFamily: dmMono, fontSize: 9, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', marginBottom: 20 }}>
              EXPÉRIENCES EXCLUSIVES
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { onClose(); navigate('/connexion') }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.04)', fontFamily: dmMono, fontSize: 10,
                  letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)',
                  cursor: 'pointer',
                }}
              >
                Connexion
              </button>
              <button
                onClick={() => { onClose(); navigate('/connexion?mode=register') }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 4, border: '1px solid rgba(78,232,200,0.35)',
                  background: 'rgba(78,232,200,0.08)', fontFamily: dmMono, fontSize: 10,
                  letterSpacing: '0.15em', textTransform: 'uppercase', color: '#4ee8c8',
                  cursor: 'pointer',
                }}
              >
                S'inscrire
              </button>
            </div>
          </div>
        )}

        {/* ── Body ── */}
        <div style={{ flex: 1, padding: '16px 0', overflowY: 'auto' }}>

          {/* ──────────────────────────────────────
              INTERFACE SWITCHER
              Shows when the user has 2+ roles unlocked
          ────────────────────────────────────── */}
          {user && enabledRoles.length > 1 && (
            <div style={{ padding: '0 16px 16px' }}>
              <p style={{ fontFamily: dmMono, fontSize: 8, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 4 }}>
                Mes interfaces
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {enabledRoles.map(role => {
                  const cfg   = ROLE_CONFIG[role] || ROLE_CONFIG.client
                  const isActive = role === activeRole
                  return (
                    <button
                      key={role}
                      onClick={() => !isActive && handleSwitchRole(role)}
                      disabled={isActive || switching}
                      style={{
                        width: '100%', padding: '11px 14px', borderRadius: 6, textAlign: 'left',
                        cursor: isActive ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: isActive ? cfg.color + '12' : 'rgba(255,255,255,0.03)',
                        border: isActive ? `1px solid ${cfg.color}44` : '1px solid rgba(255,255,255,0.07)',
                        transition: 'all 0.2s',
                        opacity: switching ? 0.6 : 1,
                      }}
                    >
                      <span style={{ fontSize: 15 }}>{cfg.icon}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontFamily: dmMono, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: isActive ? cfg.color : 'rgba(255,255,255,0.6)', margin: 0 }}>
                          {cfg.label}
                        </p>
                        <p style={{ fontFamily: dmMono, fontSize: 8, color: 'rgba(255,255,255,0.22)', letterSpacing: '0.06em', margin: 0 }}>
                          {cfg.desc}
                        </p>
                      </div>
                      {isActive && (
                        <span style={{ fontFamily: dmMono, fontSize: 7, letterSpacing: '0.1em', color: cfg.color, padding: '2px 6px', borderRadius: 3, border: `1px solid ${cfg.color}44`, background: cfg.color + '10', textTransform: 'uppercase' }}>
                          Actif
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────
              ADMIN panel shortcut
          ────────────────────────────────────── */}
          {user && isAgent && (
            <div style={{ padding: '0 16px 16px' }}>
              <button onClick={() => go('/agent')} style={{
                width: '100%', padding: '13px 16px', borderRadius: 6,
                background: 'rgba(200,169,110,0.06)', border: '1px solid rgba(200,169,110,0.25)',
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{ fontSize: 16 }}>🔑</span>
                <div>
                  <p style={{ fontFamily: dmMono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 2 }}>
                    Interface Admin{pendingCount > 0 ? ` (${pendingCount})` : ''}
                  </p>
                  <p style={{ fontFamily: dmMono, fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em' }}>
                    Validation des comptes & demandes
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* ──────────────────────────────────────
              CLIENT → unlock extra roles
              Shows when user is client and doesn't yet have org/prest
          ────────────────────────────────────── */}
          {user && !isAgent && (
            <div style={{ padding: `0 16px ${enabledRoles.length > 1 ? '0' : '8px'}` }}>
              {/* Organiser */}
              {!enabledRoles.includes('organisateur') && (
                <RoleRequestCard
                  role="organisateur"
                  status={orgStatus}
                  onRequest={() => { go('/onboarding-organisateur') }}
                  onViewDossier={() => { go('/mon-dossier') }}
                  onCancel={async () => {
                    await cancelRoleRequest(user.uid, 'organisateur')
                    const updated = JSON.parse(localStorage.getItem('lib_user') || 'null')
                    if (updated) setUser(updated)
                  }}
                  onModify={() => { go('/onboarding-organisateur') }}
                />
              )}

              {/* Prestataire */}
              {!enabledRoles.includes('prestataire') && (
                <RoleRequestCard
                  role="prestataire"
                  status={prestStatus}
                  onRequest={() => { go('/onboarding-prestataire') }}
                  onViewDossier={() => { go('/mon-dossier') }}
                  onCancel={async () => {
                    await cancelRoleRequest(user.uid, 'prestataire')
                    const updated = JSON.parse(localStorage.getItem('lib_user') || 'null')
                    if (updated) setUser(updated)
                  }}
                  onModify={() => { go('/onboarding-prestataire') }}
                />
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {user && (
          <div style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={() => setConfirmLogout(true)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                padding: '11px 24px', background: 'transparent', border: 'none',
                cursor: 'pointer', textAlign: 'left',
              }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span style={{ fontFamily: dmMono, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
                Déconnexion
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Confirm logout modal */}
      {confirmLogout && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-6">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }} onClick={() => setConfirmLogout(false)} />
          <div className="relative glass" style={{ padding: 28, width: '100%', maxWidth: 320, textAlign: 'center' }}>
            <p style={{ fontFamily: cormorant, fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.9)', marginBottom: 8 }}>
              Se déconnecter ?
            </p>
            <p style={{ fontFamily: dmMono, fontSize: 10, letterSpacing: '0.12em', color: 'var(--muted)', marginBottom: 24 }}>
              Tu devras te reconnecter pour accéder à ton compte.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmLogout(false)} className="btn-outline" style={{ flex: 1 }}>
                Annuler
              </button>
              <button onClick={logout} style={{
                flex: 1, padding: '12px', background: 'rgba(220,50,50,0.12)',
                border: '1px solid rgba(220,50,50,0.35)', borderRadius: 4,
                fontFamily: dmMono, fontSize: 11, letterSpacing: '0.2em',
                textTransform: 'uppercase', color: 'rgba(220,100,100,0.9)', cursor: 'pointer',
              }}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Sub-component: role request card ─────────────────────────────────────────
function RoleRequestCard({ role, status, onRequest, onViewDossier, onCancel, onModify }) {
  const dmMono = "'DM Mono', monospace"
  const cfg = ROLE_CONFIG[role]
  const [cancelling, setCancelling] = useState(false)

  if (status === 'active') return null // already unlocked via enabledRoles

  const isPending  = status === 'pending'
  const isRejected = status === 'rejected'

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={isPending ? onViewDossier : onRequest}
        style={{
          width: '100%', padding: '13px 16px', borderRadius: isPending ? '6px 6px 0 0' : 6,
          background: isPending ? 'rgba(200,169,110,0.04)' : cfg.color + '08',
          border: isPending
            ? '1px solid rgba(200,169,110,0.2)'
            : `1px solid ${cfg.color}25`,
          borderBottom: isPending ? 'none' : undefined,
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer', textAlign: 'left',
        }}>
        <span style={{ fontSize: 16 }}>{cfg.icon}</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: dmMono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: isPending ? '#c8a96e' : cfg.color, marginBottom: 2 }}>
            {isPending ? 'Dossier en cours…' : isRejected ? `Nouveau dossier ${cfg.label}` : `Devenir ${cfg.label}`}
          </p>
          <p style={{ fontFamily: dmMono, fontSize: 8, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em' }}>
            {isPending
              ? 'Voir le statut de mon dossier →'
              : isRejected
                ? 'Soumettre un nouveau dossier'
                : role === 'organisateur'
                  ? 'Créer et gérer tes événements'
                  : 'Proposer tes services sur la plateforme'}
          </p>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" style={{ flexShrink: 0 }}>
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>

      {/* Cancel / Modify actions shown when pending */}
      {isPending && (
        <div style={{
          display: 'flex', borderRadius: '0 0 6px 6px',
          border: '1px solid rgba(200,169,110,0.2)', borderTop: '1px solid rgba(255,255,255,0.04)',
          overflow: 'hidden',
        }}>
          <button
            onClick={onModify}
            style={{
              flex: 1, padding: '8px 10px', background: 'transparent', border: 'none',
              borderRight: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
              fontFamily: dmMono, fontSize: 8, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
            }}>
            ✏️ Modifier
          </button>
          <button
            disabled={cancelling}
            onClick={async () => {
              setCancelling(true)
              await onCancel()
              setCancelling(false)
            }}
            style={{
              flex: 1, padding: '8px 10px', background: 'transparent', border: 'none',
              cursor: cancelling ? 'default' : 'pointer',
              fontFamily: dmMono, fontSize: 8, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: cancelling ? 'rgba(255,255,255,0.2)' : 'rgba(220,80,80,0.7)',
            }}>
            {cancelling ? '…' : '✕ Annuler'}
          </button>
        </div>
      )}
    </div>
  )
}
