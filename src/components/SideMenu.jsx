import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'
import { ROLES, getTotalPendingCount, getEnabledRoles, switchActiveRole, cancelRoleRequest } from '../utils/accounts'
import RoleBadge from './RoleBadge'

const ROLE_CONFIG = {
  client:       { label: 'Client',       icon: '🎫', color: '#8444ff', desc: 'Réserver des événements' },
  user:         { label: 'Client',       icon: '🎫', color: '#8444ff', desc: 'Réserver des événements' },
  organisateur: { label: 'Organisateur', icon: '🎪', color: '#8444ff', desc: 'Gérer mes événements' },
  prestataire:  { label: 'Prestataire',  icon: '🎤', color: '#ff4da6', desc: 'Mes services & prestations' },
  agent:        { label: 'Admin',        icon: '🔑', color: '#c8a96e', desc: 'Interface administration' },
}

// Couleurs par rôle (cohérentes avec RoleBadge) pour les carrés d'icône SVG.
const ROLE_VISUAL = {
  client:       { color: '#60a5fa', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(96,165,250,0.25)' },
  user:         { color: '#60a5fa', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(96,165,250,0.25)' },
  organisateur: { color: '#a78bfa', bg: 'rgba(139,92,246,0.12)',  border: 'rgba(167,139,250,0.25)' },
  prestataire:  { color: '#f472b6', bg: 'rgba(236,72,153,0.12)',  border: 'rgba(244,114,182,0.25)' },
  agent:        { color: '#fb7185', bg: 'rgba(244,63,94,0.12)',   border: 'rgba(251,113,133,0.25)' },
}

function RoleGlyph({ role }) {
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (role === 'organisateur') return <svg {...p}><path d="M12 2v3" /><path d="M12 5C6 7 3 11 3 13h18c0-2-3-6-9-8z" /><path d="M3 13v7h18v-7" /><path d="M8 13v7" /><path d="M12 13v7" /><path d="M16 13v7" /></svg>
  if (role === 'prestataire') return <svg {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" /></svg>
  if (role === 'agent') return <svg {...p}><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2 19 4" /><path d="M18 5l2 2" /><path d="M15 8l2 2" /></svg>
  return <svg {...p}><path d="M4 8a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4z" /><path d="M14 7v12" strokeDasharray="1.5 2.5" /></svg>
}

function RoleIconSquare({ role, size = 34 }) {
  const v = ROLE_VISUAL[role] || ROLE_VISUAL.client
  return (
    <div style={{ width: size, height: size, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: v.bg, border: `1px solid ${v.border}`, color: v.color }}>
      <RoleGlyph role={role} />
    </div>
  )
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
                  {user.name || 'Toi'}
                </p>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                  {user.email || ''}
                </p>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {user.role && <RoleBadge role={user.role} />}
              <span style={{ display: 'inline-flex', alignItems: 'center', height: 32, fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, padding: '0 12px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>
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
                className="group relative flex h-11 w-full items-center rounded-xl bg-transparent px-3 text-zinc-400 transition-all duration-300 hover:bg-[#121216]/60 hover:text-white hover:translate-x-1 active:scale-[0.96] active:translate-x-0"
                style={{ cursor: 'pointer', border: 'none' }}
              >
                {/* Capsule émeraude à gauche */}
                <span className="absolute left-0 top-3 h-5 w-[3px] scale-y-0 rounded-r-full bg-emerald-400 opacity-0 transition-all duration-300 group-hover:scale-y-100 group-hover:opacity-100" />
                <div className="flex h-5 w-5 items-center justify-center transition-colors duration-300 group-hover:text-emerald-400">
                  {item.icon}
                </div>
                <span className="pl-3.5 text-[14px] font-bold tracking-wide transition-colors duration-300 group-hover:underline group-hover:underline-offset-[5px] group-hover:decoration-white" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {item.label}
                </span>
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
                      <RoleIconSquare role={role} />
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
                  onCancel={async () => { await cancelRoleRequest(user.uid, 'organisateur'); const u = JSON.parse(localStorage.getItem('lib_user') || 'null'); if (u && u.uid === user.uid) setUser(u) }}
                  onModify={() => go('/onboarding-organisateur')}
                />
              )}
              {!enabledRoles.includes('prestataire') && (
                <RoleRequestCard role="prestataire" status={prestStatus}
                  onRequest={() => go('/onboarding-prestataire')}
                  onViewDossier={() => go('/mon-dossier')}
                  onCancel={async () => { await cancelRoleRequest(user.uid, 'prestataire'); const u = JSON.parse(localStorage.getItem('lib_user') || 'null'); if (u && u.uid === user.uid) setUser(u) }}
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

// Icônes de rôle (SVG, pas d'emoji) — chapiteau pour l'organisateur, micro pour
// le prestataire. `stroke=currentColor` pour hériter de la couleur du conteneur.
function TentIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'relative', zIndex: 10 }}>
      <path d="M12 2v3" /><path d="M12 5C6 7 3 11 3 13h18c0-2-3-6-9-8z" /><path d="M3 13v7h18v-7" /><path d="M8 13v7" /><path d="M12 13v7" /><path d="M16 13v7" />
    </svg>
  )
}
function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'relative', zIndex: 10 }}>
      <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}

// Variantes statiques (Tailwind ne génère pas les classes dynamiquement) :
// violet pour l'organisateur, rose pour le prestataire.
const ROLE_CARD = {
  organisateur: {
    btn: 'border-violet-500/15 bg-[#12111a] hover:border-violet-500/35 hover:bg-[#151322] hover:shadow-[0_12px_30px_rgba(139,92,246,0.1)]',
    iconBox: 'border-violet-500/20 bg-violet-500/10 text-violet-400 group-hover:bg-violet-500/20 group-hover:text-violet-300',
    glow: 'radial-gradient(circle,rgba(139,92,246,0.3) 0%,transparent 70%)',
    sub: 'group-hover:text-violet-400/80', arrow: 'group-hover:text-violet-400',
    rgba: '139,92,246', Icon: TentIcon,
  },
  prestataire: {
    btn: 'border-pink-500/15 bg-[#1a1016] hover:border-pink-500/35 hover:bg-[#1f1018] hover:shadow-[0_12px_30px_rgba(236,72,153,0.1)]',
    iconBox: 'border-pink-500/20 bg-pink-500/10 text-pink-400 group-hover:bg-pink-500/20 group-hover:text-pink-300',
    glow: 'radial-gradient(circle,rgba(236,72,153,0.3) 0%,transparent 70%)',
    sub: 'group-hover:text-pink-400/80', arrow: 'group-hover:text-pink-400',
    rgba: '236,72,153', Icon: MicIcon,
  },
}

// ── Role request card ────────────────────────────────────────────────────────
function RoleRequestCard({ role, status, onRequest, onViewDossier, onCancel, onModify }) {
  const cfg = ROLE_CONFIG[role]
  const v = ROLE_CARD[role] || ROLE_CARD.organisateur
  const [cancelling, setCancelling] = useState(false)
  if (status === 'active') return null

  const isPending  = status === 'pending'
  const isRejected = status === 'rejected'

  return (
    <div>
      <button onClick={isPending ? onViewDossier : onRequest}
        className={`group relative flex w-full items-center overflow-hidden border p-3 text-left transition-all duration-300 active:scale-[0.98] ${v.btn}`}
        style={{ borderRadius: isPending ? '16px 16px 0 0' : 16, borderBottomWidth: isPending ? 0 : undefined, cursor: 'pointer' }}>
        {/* Zone d'icône */}
        <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${v.iconBox}`}>
          <div className="pointer-events-none absolute -inset-3 -z-10 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-bounce" style={{ background: v.glow }} />
          <v.Icon />
        </div>
        {/* Textes */}
        <div className="relative z-10 flex flex-col pl-3">
          <span className="text-[13px] font-bold tracking-wide text-zinc-200 transition-colors group-hover:text-white" style={{ fontFamily: 'Inter, sans-serif', color: isPending ? 'var(--gold)' : undefined }}>
            {isPending ? 'Dossier en cours…' : isRejected ? `Nouveau dossier ${cfg.label}` : `Devenir ${cfg.label}`}
          </span>
          <span className={`text-[11px] font-medium text-zinc-500 mt-0.5 transition-colors ${v.sub}`} style={{ fontFamily: 'Inter, sans-serif' }}>
            {isPending ? 'Voir le statut →' : isRejected ? 'Soumettre un nouveau dossier' : cfg.desc}
          </span>
        </div>
        {/* Flèche */}
        <div className={`ml-auto text-zinc-600 transition-all duration-300 group-hover:translate-x-0.5 ${v.arrow}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </div>
      </button>

      {isPending && (
        <div style={{ display: 'flex', borderRadius: '0 0 16px 16px', border: `1px solid rgba(${v.rgba},0.18)`, borderTop: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <button onClick={onModify} style={{ flex: 1, padding: '9px', background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            Modifier
          </button>
          <button disabled={cancelling} onClick={async () => { setCancelling(true); await onCancel(); setCancelling(false) }}
            style={{ flex: 1, padding: '9px', background: 'transparent', border: 'none', cursor: cancelling ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12, color: cancelling ? 'rgba(255,255,255,0.2)' : 'rgba(220,80,80,0.75)' }}>
            {cancelling ? '…' : 'Annuler'}
          </button>
        </div>
      )}
    </div>
  )
}
