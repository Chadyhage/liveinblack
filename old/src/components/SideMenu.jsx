import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getUserId } from '../utils/messaging'
import { ROLES, getTotalPendingCount, getEnabledRoles, switchActiveRole, cancelRoleRequest } from '../utils/accounts'
import { getNavItems } from './Layout'
import RoleBadge from './RoleBadge'

// Icônes des liens de navigation, par route. Le menu reprend getNavItems(role)
// (les MÊMES onglets que la nav de l'interface active) — toute route sans icône
// dédiée retombe sur la flèche générique.
const NAV_ICONS = {
  '/accueil': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5L12 4l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V10.5z"/><path d="M9 21V13h6v8"/></svg>,
  '/evenements': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="1.5"/><path d="M8 7V5m8 2V5"/></svg>,
  '/organisateurs': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2"/><path d="M17 8h4m-2-2v4"/></svg>,
  '/prestataires': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>,
  '/messagerie': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  '/mes-evenements': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v3"/><path d="M12 5C6 7 3 11 3 13h18c0-2-3-6-9-8z"/><path d="M3 13v7h18v-7"/><path d="M8 13v7"/><path d="M12 13v7"/><path d="M16 13v7"/></svg>,
  '/ma-page-organisateur': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z"/></svg>,
  '/proposer': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></svg>,
  '/mes-soirees': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>,
  billets: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4z"/><path d="M14 7v10" strokeDasharray="1.5 2.5"/></svg>,
  interests: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6c-1.8-1.8-4.7-1.8-6.5 0L12 6.9 9.7 4.6c-1.8-1.8-4.7-1.8-6.5 0s-1.8 4.7 0 6.5L12 20l8.8-8.9c1.8-1.8 1.8-4.7 0-6.5z"/></svg>,
  '/profil': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
}
const NAV_FALLBACK_ICON = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>

const ROLE_CONFIG = {
  client:       { label: 'Client',       color: '#8444ff', desc: 'Réserver des événements' },
  user:         { label: 'Client',       color: '#8444ff', desc: 'Réserver des événements' },
  organisateur: { label: 'Organisateur', color: '#8444ff', desc: 'Gérer mes événements' },
  prestataire:  { label: 'Prestataire',  color: '#ff4da6', desc: 'Mes services & prestations' },
  agent:        { label: 'Admin',        color: '#c8a96e', desc: 'Interface administration' },
}

// Couleurs par rôle (cohérentes avec RoleBadge) pour les chips d'icône SVG.
// Chip = fond OPAQUE plein arrondi, SANS bordure : une seule forme, l'icône se
// pose dessus (pas de « carré dans un carré » — le liseré faisait un 2e cadre).
const ROLE_VISUAL = {
  client:       { color: '#7cb2fb', bg: '#182338' },
  user:         { color: '#7cb2fb', bg: '#182338' },
  organisateur: { color: '#b79bfb', bg: '#221d3b' },
  prestataire:  { color: '#f584c0', bg: '#2e1a29' },
  agent:        { color: '#fb8a9a', bg: '#2f1c23' },
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
    <div style={{ width: size, height: size, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: v.bg, color: v.color }}>
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

  function go(path, state) { navigate(path, state ? { state } : undefined); onClose() }

  // Liens du menu = les MÊMES onglets que la nav de l'interface active
  // (getNavItems de Layout), complétés par « Mes billets » et « Mon Profil ».
  // Avant, la liste était codée en dur → les entrées propres à chaque interface
  // (Mes Events, Mon Espace, Prestataires, Ma Page…) manquaient dans le menu.
  const navLinks = [
    ...(user
      ? getNavItems(activeRole)
      : [
          { path: '/accueil', label: 'Accueil' },
          { path: '/evenements', label: 'Événements' },
          { path: '/organisateurs', label: 'Organisateurs' },
          { path: '/prestataires', label: 'Prestataires' },
        ]),
    ...(user ? [
      { path: '/profil', label: 'Mes billets', state: { panel: 'billets' }, iconKey: 'billets' },
      { path: '/profil/evenements-interesses', label: 'Événements intéressés', iconKey: 'interests' },
      { path: '/profil', label: 'Mon Profil' },
    ] : []),
  ]

  async function logout() {
    setConfirmLogout(false)
    // Déconnexion Firebase RÉELLE obligatoire : sans signOut, auth.currentUser
    // reste vivant et les pages qui « réconcilient » la session (onboarding,
    // retour Stripe) re-connectent automatiquement l'ancien compte.
    try {
      const { USE_REAL_FIREBASE, auth } = await import('../firebase')
      if (USE_REAL_FIREBASE && auth) {
        const { signOut } = await import('firebase/auth')
        await signOut(auth).catch(() => {})
      }
    } catch {}
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
          background: '#12131c',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '24px 0 64px rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
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
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                  {user.email || ''}
                </p>
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {user.role && <RoleBadge role={user.role} />}
              <span style={{ display: 'inline-flex', alignItems: 'center', height: 32, fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, padding: '0 12px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}>
                {user.points || 0} pts
              </span>
            </div>
          </div>
        ) : (
          <div style={{ padding: '32px 24px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.12em', color: '#fff', marginBottom: 6 }}>
              LIVEINBLACK
            </p>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 24 }}>
              Expériences exclusives
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { onClose(); navigate('/connexion') }} style={{ flex: 1, padding: '11px 0', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.08)', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)', cursor: 'pointer' }}>
                Connexion
              </button>
              <button onClick={() => { onClose(); navigate('/connexion?mode=register') }} style={{ flex: 1, padding: '11px 0', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)', background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', boxShadow: '0 6px 20px rgba(122,59,242,0.35)' }}>
                S'inscrire
              </button>
            </div>
          </div>
        )}

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>

          {/* Nav links — mêmes onglets que la nav de l'interface active */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 20 }}>
            {navLinks.map(item => (
              <button key={`${item.path}-${item.label}`} onClick={() => go(item.path, item.state)}
                className="group relative flex h-11 w-full items-center rounded-xl bg-transparent px-3 text-zinc-400 transition-all duration-300 hover:bg-[#1c1e2a] hover:text-white hover:translate-x-1 active:scale-[0.96] active:translate-x-0"
                style={{ cursor: 'pointer', border: 'none' }}
              >
                {/* Capsule d'accent à gauche */}
                <span className="absolute left-0 top-3 h-5 w-[3px] scale-y-0 rounded-r-full bg-violet-400 opacity-0 transition-all duration-300 group-hover:scale-y-100 group-hover:opacity-100" />
                <div className="flex h-5 w-5 items-center justify-center transition-colors duration-300 group-hover:text-violet-300">
                  {NAV_ICONS[item.iconKey || item.path] || NAV_FALLBACK_ICON}
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
              <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 10, paddingLeft: 4 }}>
                Mes interfaces
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {enabledRoles.map(role => {
                  const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.client
                  const isActive = role === activeRole
                  // Surfaces OPAQUES et affordance claire (refonte 2026-07) : les
                  // cartes translucides « néon » ne se lisaient pas comme des
                  // boutons. Inactif = carte pleine + chevron + hover marqué ;
                  // actif = surface violette pleine + badge CTA plein.
                  return (
                    <button key={role} onClick={() => !isActive && handleSwitchRole(role)} disabled={isActive || switching}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = '#232636'; e.currentTarget.style.borderColor = 'rgba(143,86,255,0.55)' } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = '#1b1d29'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)' } }}
                      style={{
                        width: '100%', padding: '12px 14px', borderRadius: 12, textAlign: 'left',
                        cursor: isActive ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: isActive ? '#241b41' : '#1b1d29',
                        border: isActive ? '1px solid rgba(143,86,255,0.55)' : '1px solid rgba(255,255,255,0.16)',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.28)',
                        transition: 'all 0.2s', opacity: switching ? 0.6 : 1,
                      }}>
                      <RoleIconSquare role={role} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, color: isActive ? '#fff' : 'rgba(255,255,255,0.92)', margin: 0 }}>{cfg.label}</p>
                        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.48)', margin: 0 }}>{cfg.desc}</p>
                      </div>
                      {isActive ? (
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, color: '#fff', padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)', background: 'linear-gradient(180deg, #8f56ff, #7a3bf2)' }}>
                          Actif
                        </span>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Admin shortcut */}
          {user && isAgent && (
            <button onClick={() => go('/agent')} style={{ width: '100%', padding: '14px 16px', borderRadius: 12, background: 'rgba(200,169,110,0.12)', border: '1px solid rgba(200,169,110,0.35)', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left', marginBottom: 12 }}>
              <span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2b2417' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                </svg>
              </span>
              <div>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--gold)', margin: '0 0 2px' }}>Interface Admin{pendingCount > 0 ? ` (${pendingCount})` : ''}</p>
                <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0 }}>Validation des comptes et demandes</p>
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
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'transparent', border: '1px solid rgba(224,90,170,0.25)', borderRadius: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(224,90,170,0.10)'; e.currentTarget.style.borderColor = 'rgba(224,90,170,0.45)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(224,90,170,0.25)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(224,90,170,0.8)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(224,90,170,0.85)' }}>
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
          <div style={{ position: 'relative', width: '100%', maxWidth: 320, background: '#12131c', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.55)', padding: '28px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 18, color: '#fff', marginBottom: 8 }}>Se déconnecter ?</p>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 24, lineHeight: 1.5 }}>Tu devras te reconnecter pour accéder à ton compte.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmLogout(false)} style={{ flex: 1, padding: '12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.08)', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={logout} style={{ flex: 1, padding: '12px', borderRadius: 999, background: '#c2347f', border: '1px solid rgba(255,255,255,0.14)', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
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
    btn: 'border-violet-500/15 bg-[#12111a] hover:border-violet-500/35 hover:bg-[#151322]',
    iconBox: 'bg-[#221d3b] text-violet-300 group-hover:bg-[#2a2348] group-hover:text-violet-200',
    sub: 'group-hover:text-violet-400/80', arrow: 'group-hover:text-violet-400',
    rgba: '139,92,246', Icon: TentIcon,
  },
  prestataire: {
    btn: 'border-pink-500/15 bg-[#1a1016] hover:border-pink-500/35 hover:bg-[#1f1018]',
    iconBox: 'bg-[#2e1a29] text-pink-300 group-hover:bg-[#381f31] group-hover:text-pink-200',
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
        <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${v.iconBox}`}>
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
          <button onClick={onModify} style={{ flex: 1, padding: '9px', background: 'transparent', border: 'none', borderRight: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>
            Modifier
          </button>
          <button disabled={cancelling} onClick={async () => { setCancelling(true); await onCancel(); setCancelling(false) }}
            style={{ flex: 1, padding: '9px', background: 'transparent', border: 'none', cursor: cancelling ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: cancelling ? 'rgba(255,255,255,0.35)' : 'rgba(224,90,170,0.85)' }}>
            {cancelling
              ? <span className="lib-spin" style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', verticalAlign: '-2px' }} />
              : 'Annuler'}
          </button>
        </div>
      )}
    </div>
  )
}
