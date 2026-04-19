import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'
import { ROLES, getTotalPendingCount, getEnabledRoles, switchActiveRole, cancelRoleRequest } from '../utils/accounts'

const ROLE_CONFIG = {
  client:       { label: 'Client',       icon: '🎫', color: '#8444ff', desc: 'Réserver des événements' },
  user:         { label: 'Client',       icon: '🎫', color: '#8444ff', desc: 'Réserver des événements' },
  organisateur: { label: 'Organisateur', icon: '🎪', color: '#8444ff', desc: 'Gérer mes événements' },
  prestataire:  { label: 'Prestataire',  icon: '🎤', color: '#ff4da6', desc: 'Mes services & prestations' },
  agent:        { label: 'Admin',        icon: '🔑', color: '#c8a96e', desc: 'Interface administration' },
}

export default function SideMenu({ open, onClose }) {
  const navigate = useNavigate()
  const { user, setUser } = useAuth()
  const pendingCount = user?.role === 'agent' ? getTotalPendingCount() : 0
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [switching, setSwitching] = useState(false)

  const activeRole   = user?.role || 'client'
  const enabledRoles = user ? getEnabledRoles(user) : []
  const isAgent      = activeRole === 'agent'
  const orgStatus    = user?.orgStatus  || 'none'
  const prestStatus  = user?.prestStatus || 'none'

  function go(path) { navigate(path); onClose() }

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
      navigate(newRole === 'agent' ? '/agent' : '/accueil')
    } finally { setSwitching(false) }
  }

  const avatarLetter = user?.name?.[0]?.toUpperCase() || '?'

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.28s ease',
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 60,
          width: 300,
          background: 'linear-gradient(180deg, rgba(18,10,32,0.97) 0%, rgba(10,8,20,0.98) 100%)',
          backdropFilter: 'blur(28px) saturate(160%)',
          WebkitBackdropFilter: 'blur(28px) saturate(160%)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Violet glow top-left */}
        <div style={{ position: 'absolute', top: -40, left: -40, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(132,68,255,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Close button */}
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* ── Header ── */}
        {user ? (
          <div style={{ padding: '32px 24px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
              {/* Avatar */}
              <div style={{
                width: 52, height: 52, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(132,68,255,0.3), rgba(255,77,166,0.2))',
                border: '2px solid rgba(132,68,255,0.35)',
                fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 20, color: '#fff',
              }}>
                {user.avatar
                  ? <img src={user.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : avatarLetter}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 16, color: '#fff', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name || 'Utilisateur'}
                </p>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                  {user.email || ''}
                </p>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 8 }}>
              {user.role && ROLES[user.role] && (
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, padding: '5px 11px', borderRadius: 999, background: 'rgba(132,68,255,0.15)', border: '1px solid rgba(132,68,255,0.3)', color: '#c9b0ff' }}>
                  {ROLES[user.role].icon} {ROLES[user.role].label}
                </span>
              )}
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, padding: '5px 11px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>
                {user.points || 0} pts
              </span>
            </div>
          </div>
        ) : (
          <div style={{ padding: '32px 24px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.12em', color: '#fff', marginBottom: 6 }}>
              LIVEINBLACK
            </p>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.28)', marginBottom: 24 }}>
              Expériences exclusives
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { onClose(); navigate('/connexion') }} style={{ flex: 1, padding: '11px 0', borderRadius: 999, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}>
                Connexion
              </button>
              <button onClick={() => { onClose(); navigate('/connexion?mode=register') }} style={{ flex: 1, padding: '11px 0', borderRadius: 999, border: 'none', background: 'linear-gradient(135deg, rgba(132,68,255,0.96), rgba(255,77,166,0.92))', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 16px rgba(132,68,255,0.3)' }}>
                S'inscrire
              </button>
            </div>
          </div>
        )}

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>

          {/* Nav links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 20 }}>
            {[
              { label: 'Accueil', path: '/accueil', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5L12 4l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V10.5z"/><path d="M9 21V13h6v8"/></svg> },
              { label: 'Événements', path: '/evenements', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="1.5"/><path d="M8 7V5m8 2V5"/></svg> },
              ...(user ? [
                { label: 'Messages', path: '/messagerie', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> },
                { label: 'Mon Profil', path: '/profil', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg> },
              ] : []),
            ].map(item => (
              <button key={item.path} onClick={() => go(item.path)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'transparent', border: 'none', borderRadius: 12, cursor: 'pointer', color: 'rgba(255,255,255,0.55)', fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 500, textAlign: 'left', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          {user && <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 0 20px' }} />}

          {/* Role switcher (multi-role users) */}
          {user && enabledRoles.length > 1 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 10, paddingLeft: 4 }}>
                Mes interfaces
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {enabledRoles.map(role => {
                  const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.client
                  const isActive = role === activeRole
                  return (
                    <button key={role} onClick={() => !isActive && handleSwitchRole(role)} disabled={isActive || switching}
                      style={{
                        width: '100%', padding: '12px 14px', borderRadius: 12, textAlign: 'left',
                        cursor: isActive ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: isActive ? 'rgba(132,68,255,0.12)' : 'rgba(255,255,255,0.03)',
                        border: isActive ? '1px solid rgba(132,68,255,0.28)' : '1px solid rgba(255,255,255,0.07)',
                        transition: 'all 0.2s', opacity: switching ? 0.6 : 1,
                      }}>
                      <span style={{ fontSize: 16 }}>{cfg.icon}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: isActive ? '#c9b0ff' : 'rgba(255,255,255,0.55)', margin: 0 }}>{cfg.label}</p>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.22)', margin: 0 }}>{cfg.desc}</p>
                      </div>
                      {isActive && (
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, color: '#c9b0ff', padding: '3px 8px', borderRadius: 999, border: '1px solid rgba(132,68,255,0.35)', background: 'rgba(132,68,255,0.12)' }}>
                          Actif
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Admin shortcut */}
          {user && isAgent && (
            <button onClick={() => go('/agent')} style={{ width: '100%', padding: '14px 16px', borderRadius: 12, background: 'rgba(200,169,110,0.07)', border: '1px solid rgba(200,169,110,0.22)', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', marginBottom: 12 }}>
              <span style={{ fontSize: 18 }}>🔑</span>
              <div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--gold)', margin: '0 0 2px' }}>Interface Admin{pendingCount > 0 ? ` (${pendingCount})` : ''}</p>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.25)', margin: 0 }}>Validation des comptes & demandes</p>
              </div>
            </button>
          )}

          {/* Unlock roles */}
          {user && !isAgent && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!enabledRoles.includes('organisateur') && (
                <RoleRequestCard role="organisateur" status={orgStatus}
                  onRequest={() => go('/onboarding-organisateur')}
                  onViewDossier={() => go('/mon-dossier')}
                  onCancel={async () => { await cancelRoleRequest(user.uid, 'organisateur'); const u = JSON.parse(localStorage.getItem('lib_user') || 'null'); if (u) setUser(u) }}
                  onModify={() => go('/onboarding-organisateur')}
                />
              )}
              {!enabledRoles.includes('prestataire') && (
                <RoleRequestCard role="prestataire" status={prestStatus}
                  onRequest={() => go('/onboarding-prestataire')}
                  onViewDossier={() => go('/mon-dossier')}
                  onCancel={async () => { await cancelRoleRequest(user.uid, 'prestataire'); const u = JSON.parse(localStorage.getItem('lib_user') || 'null'); if (u) setUser(u) }}
                  onModify={() => go('/onboarding-prestataire')}
                />
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {user && (
          <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={() => setConfirmLogout(true)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'transparent', border: '1px solid rgba(220,50,50,0.15)', borderRadius: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,50,50,0.07)'; e.currentTarget.style.borderColor = 'rgba(220,50,50,0.3)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(220,50,50,0.15)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(220,100,100,0.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500, color: 'rgba(220,100,100,0.65)' }}>
                Déconnexion
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Confirm logout modal */}
      {confirmLogout && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }} onClick={() => setConfirmLogout(false)} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 320, background: 'linear-gradient(180deg, rgba(18,10,32,0.98), rgba(10,8,20,0.98))', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '28px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 18, color: '#fff', marginBottom: 8 }}>Se déconnecter ?</p>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 24, lineHeight: 1.5 }}>Tu devras te reconnecter pour accéder à ton compte.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmLogout(false)} style={{ flex: 1, padding: '12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.45)', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={logout} style={{ flex: 1, padding: '12px', borderRadius: 999, background: 'rgba(220,50,50,0.15)', border: '1px solid rgba(220,50,50,0.4)', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(220,100,100,0.9)', cursor: 'pointer' }}>
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Role request card ────────────────────────────────────────────────────────
function RoleRequestCard({ role, status, onRequest, onViewDossier, onCancel, onModify }) {
  const cfg = ROLE_CONFIG[role]
  const [cancelling, setCancelling] = useState(false)
  if (status === 'active') return null

  const isPending  = status === 'pending'
  const isRejected = status === 'rejected'
  const accentColor = role === 'prestataire' ? 'rgba(255,77,166' : 'rgba(132,68,255'

  return (
    <div>
      <button onClick={isPending ? onViewDossier : onRequest}
        style={{
          width: '100%', padding: '14px 16px',
          borderRadius: isPending ? '12px 12px 0 0' : 12,
          background: `${accentColor},0.08)`,
          border: `1px solid ${accentColor},0.22)`,
          borderBottom: isPending ? 'none' : undefined,
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: 'pointer', textAlign: 'left',
        }}>
        <span style={{ fontSize: 20 }}>{cfg.icon}</span>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: isPending ? 'var(--gold)' : '#fff', margin: '0 0 2px' }}>
            {isPending ? 'Dossier en cours…' : isRejected ? `Nouveau dossier ${cfg.label}` : `Devenir ${cfg.label}`}
          </p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: 0 }}>
            {isPending ? 'Voir le statut →' : isRejected ? 'Soumettre un nouveau dossier' : cfg.desc}
          </p>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
      </button>

      {isPending && (
        <div style={{ display: 'flex', borderRadius: '0 0 12px 12px', border: `1px solid ${accentColor},0.22)`, borderTop: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <button onClick={onModify} style={{ flex: 1, padding: '9px', background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
            ✏️ Modifier
          </button>
          <button disabled={cancelling} onClick={async () => { setCancelling(true); await onCancel(); setCancelling(false) }}
            style={{ flex: 1, padding: '9px', background: 'transparent', border: 'none', cursor: cancelling ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12, color: cancelling ? 'rgba(255,255,255,0.2)' : 'rgba(220,80,80,0.7)' }}>
            {cancelling ? '…' : '✕ Annuler'}
          </button>
        </div>
      )}
    </div>
  )
}
