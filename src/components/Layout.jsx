import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SideMenu from './SideMenu'
import { getUserId, getTotalUnreadCount } from '../utils/messaging'
import { getTotalPendingCount } from '../utils/accounts'
import { getNotifications, getUnreadCount, markAllRead, markRead, NOTIF_CONFIG } from '../utils/notifications'

// ── Nav icons ──────────────────────────────────────────────────────────────────
function NavIcon({ id, active }) {
  const color = active ? 'var(--violet)' : 'rgba(255,255,255,0.28)'
  const s = active ? 1.5 : 1.3
  const props = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: s, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (id === '/accueil') return <svg {...props}><path d="M3 10.5L12 4l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V10.5z"/><path d="M9 21V13h6v8"/></svg>
  if (id === '/evenements') return <svg {...props}><rect x="3" y="7" width="18" height="13" rx="1.5"/><path d="M8 7V5m8 2V5"/><path d="M7 13h2m2 0h2m2 0h2"/></svg>
  if (id === '/messagerie') return <svg {...props}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
  if (id === '/mes-evenements') return <svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
  if (id === '/proposer') return <svg {...props}><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
  return null
}

// ── Nav items per role ──────────────────────────────────────────────────────────
function getNavItems(role) {
  // Guest
  if (!role) return [
    { path: '/accueil',    icon: '⬜', label: 'Accueil' },
    { path: '/evenements', icon: '🎟', label: 'Événements' },
  ]
  // Admin (agent) — view everything
  if (role === 'agent') return [
    { path: '/accueil',        icon: '⬜', label: 'Accueil' },
    { path: '/evenements',     icon: '🎟', label: 'Événements' },
    { path: '/messagerie',     icon: '💬', label: 'Messages' },
    { path: '/proposer',       icon: '◈',  label: 'Services' },
  ]
  // Organisateur — event creation + hiring prestataires
  if (role === 'organisateur') return [
    { path: '/accueil',        icon: '⬜', label: 'Accueil' },
    { path: '/evenements',     icon: '🎟', label: 'Événements' },
    { path: '/messagerie',     icon: '💬', label: 'Messages' },
    { path: '/mes-evenements', icon: '✦',  label: 'Mes Events' },
    { path: '/proposer',       icon: '◈',  label: 'Services' },
  ]
  // Prestataire — their space + browse
  if (role === 'prestataire') return [
    { path: '/accueil',    icon: '⬜', label: 'Accueil' },
    { path: '/evenements', icon: '🎟', label: 'Événements' },
    { path: '/messagerie', icon: '💬', label: 'Messages' },
    { path: '/proposer',   icon: '◈',  label: 'Mon Espace' },
  ]
  // Client (user/client) — browse + book only
  return [
    { path: '/accueil',    icon: '⬜', label: 'Accueil' },
    { path: '/evenements', icon: '🎟', label: 'Événements' },
    { path: '/messagerie', icon: '💬', label: 'Messages' },
  ]
}

export default function Layout({ children, hideNav, chatMode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { user, openAuthModal } = useAuth()
  const activeRole = user?.role || null
  const isAgent    = activeRole === 'agent'
  const [pendingCount, setPendingCount] = useState(() => isAgent ? getTotalPendingCount() : 0)

  const navItems = getNavItems(activeRole)
  const uid = getUserId(user)
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const notifBellRef = useRef(null)

  // ── Hide header on scroll-down, reveal on scroll-up ──
  const [headerHidden, setHeaderHidden] = useState(false)
  const lastScrollY = useRef(0)
  useEffect(() => {
    if (chatMode) return // chat has its own fixed layout, no window scroll
    const onScroll = () => {
      const y = window.scrollY
      const prev = lastScrollY.current
      // Only hide after 80px so the header doesn't vanish immediately on page load / small bounces
      if (y > prev + 6 && y > 80) {
        setHeaderHidden(true)
      } else if (y < prev - 6) {
        setHeaderHidden(false)
      }
      lastScrollY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [chatMode])
  // Always show header when navigating to a new page
  useEffect(() => {
    setHeaderHidden(false)
    lastScrollY.current = 0
  }, [location.pathname])
  useEffect(() => {
    if (!uid) return
    setUnreadMsgCount(getTotalUnreadCount(uid))
    const interval = setInterval(() => setUnreadMsgCount(getTotalUnreadCount(uid)), 3000)
    return () => clearInterval(interval)
  }, [uid])

  // Poll notifications
  useEffect(() => {
    if (!uid) return
    const refresh = () => {
      const notifs = getNotifications(uid)
      setNotifications(notifs)
      setUnreadNotifCount(getUnreadCount(uid))
    }
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [uid])

  // Close notif dropdown on outside click
  useEffect(() => {
    if (!notifOpen) return
    const handler = e => {
      if (notifBellRef.current && !notifBellRef.current.contains(e.target)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen])

  function handleOpenNotifs() {
    setNotifOpen(o => !o)
    if (!notifOpen && uid && unreadNotifCount > 0) {
      markAllRead(uid)
      setUnreadNotifCount(0)
      setNotifications(n => n.map(x => ({ ...x, read: true })))
    }
  }

  // Poll pending validations count for agent badge
  useEffect(() => {
    if (!isAgent) return
    setPendingCount(getTotalPendingCount())
    const id = setInterval(() => setPendingCount(getTotalPendingCount()), 5000)
    return () => clearInterval(id)
  }, [isAgent])

  function handleProtectedNav(path) {
    if (!user) {
      openAuthModal('Connecte-toi pour accéder à cet espace.', () => navigate(path))
      return
    }
    navigate(path)
  }

  const avatarLetter = user?.name?.[0]?.toUpperCase() || '?'

  return (
    <div className="min-h-screen">

      {/* ── DESKTOP: Top Floating Pill Navbar ── */}
      {!chatMode && (
        <div className="hidden md:block" style={{ position: 'sticky', top: 0, zIndex: 40, padding: '16px 24px 0', pointerEvents: 'none' }}>
          <div style={{
            maxWidth: 1320, margin: '0 auto', pointerEvents: 'all',
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 16px',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.04))',
            backdropFilter: 'blur(24px) saturate(1.6)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 28,
            boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset',
          }}>
            {/* Logo */}
            <button onClick={() => navigate('/accueil')}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, marginRight: 8 }}>
              <span style={{
                width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                background: 'radial-gradient(circle at 28% 28%, rgba(255,255,255,0.85), transparent 18%), linear-gradient(135deg, rgba(132,68,255,0.98), rgba(255,77,166,0.94))',
                boxShadow: '0 0 20px rgba(132,68,255,0.4), 0 0 40px rgba(255,77,166,0.1)',
              }} />
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
                <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.1rem', letterSpacing: '0.08em', lineHeight: 1, color: 'white' }}>L</span>
                <span style={{ display: 'inline-block', width: '2px', height: '12px', background: 'white', margin: '0 2px 1px', flexShrink: 0, alignSelf: 'center' }} />
                <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.1rem', letterSpacing: '0.08em', lineHeight: 1, color: 'white' }}>VE IN</span>
                <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontStyle: 'italic', fontWeight: 900, fontSize: '1.05rem', letterSpacing: '0.02em', lineHeight: 1, color: 'white', marginLeft: '4px', position: 'relative', top: '1px' }}>BLACK</span>
              </span>
            </button>

            {/* Nav pills — centered */}
            <nav style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              {navItems.map((item) => {
                const active = location.pathname === item.path
                const isMsgItem = item.path === '/messagerie'
                return (
                  <button key={item.path} onClick={() => navigate(item.path)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      padding: '7px 16px',
                      background: active ? 'rgba(132,68,255,0.18)' : 'transparent',
                      border: `1px solid ${active ? 'rgba(132,68,255,0.28)' : 'transparent'}`,
                      borderRadius: 999,
                      boxShadow: active ? '0 0 20px rgba(132,68,255,0.2)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      position: 'relative',
                    }}>
                    <div style={{ position: 'relative' }}>
                      <NavIcon id={item.path} active={active} />
                      {isMsgItem && unreadMsgCount > 0 && (
                        <span style={{ position: 'absolute', top: -5, right: -7, minWidth: 14, height: 14, borderRadius: 7, background: 'linear-gradient(135deg,#8444ff,#ff4da6)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                          {unreadMsgCount > 99 ? '99+' : unreadMsgCount}
                        </span>
                      )}
                    </div>
                    <span style={{
                      fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, fontWeight: active ? 600 : 400,
                      color: active ? '#fff' : 'rgba(255,255,255,0.45)',
                    }}>
                      {item.label}
                    </span>
                  </button>
                )
              })}

              {isAgent && (
                <button onClick={() => navigate('/agent')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '7px 16px',
                    background: 'rgba(200,169,110,0.10)', border: '1px solid rgba(200,169,110,0.22)',
                    borderRadius: 999, cursor: 'pointer',
                  }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                  </svg>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 500, color: 'var(--gold)' }}>Admin</span>
                  {pendingCount > 0 && (
                    <span style={{ fontSize: 9, fontFamily: 'Inter, sans-serif', padding: '2px 6px', borderRadius: 999, background: 'rgba(200,169,110,0.18)', color: 'var(--gold)' }}>{pendingCount}</span>
                  )}
                </button>
              )}
            </nav>

            {/* Right: avatar / connexion + notification bell + hamburger */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {user ? (
                <>
                  {/* Notification bell */}
                  <div ref={notifBellRef} style={{ position: 'relative' }}>
                    <button onClick={handleOpenNotifs}
                      style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: notifOpen ? 'rgba(139,92,246,0.14)' : 'rgba(255,255,255,0.06)', border: `1px solid ${notifOpen ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.09)'}`, cursor: 'pointer', flexShrink: 0, position: 'relative' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                      </svg>
                      {unreadNotifCount > 0 && (
                        <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 14, height: 14, borderRadius: 7, background: 'linear-gradient(135deg,#8b5cf6,#e05aaa)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                          {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                        </span>
                      )}
                    </button>
                    {notifOpen && (
                      <NotifDropdown notifications={notifications} onClose={() => setNotifOpen(false)} uid={uid} />
                    )}
                  </div>
                  <button onClick={() => navigate('/profil')}
                    style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>
                    {user.avatar ? <img src={user.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarLetter}
                  </button>
                </>
              ) : (
                <button onClick={() => navigate('/connexion')}
                  style={{ padding: '8px 18px', borderRadius: 999, background: 'linear-gradient(135deg, rgba(132,68,255,0.96), rgba(255,77,166,0.92))', border: 'none', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 20px rgba(132,68,255,0.3)' }}>
                  Se connecter
                </button>
              )}
              <button onClick={() => setMenuOpen(true)}
                style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, cursor: 'pointer', flexShrink: 0 }}>
                <span style={{ width: 14, height: 1.5, borderRadius: 1, background: 'rgba(255,255,255,0.5)' }} />
                <span style={{ width: 10, height: 1.5, borderRadius: 1, background: 'rgba(255,255,255,0.5)' }} />
                <span style={{ width: 14, height: 1.5, borderRadius: 1, background: 'rgba(255,255,255,0.5)' }} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MOBILE: Top Bar — floating glass pill ── */}
      {!chatMode && (
        <header
          className="md:hidden"
          style={{
            position: 'fixed', top: 0, left: 0, right: 0,
            zIndex: 40, padding: '10px 12px',
            transform: headerHidden ? 'translateY(-110%)' : 'translateY(0)',
            transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
            willChange: 'transform',
            pointerEvents: headerHidden ? 'none' : undefined,
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.04))',
            backdropFilter: 'blur(20px) saturate(1.5)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 26,
            boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          }}>
            {/* Hamburger */}
            <button onClick={() => setMenuOpen(true)}
              style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, cursor: 'pointer' }}>
              <span style={{ width: 14, height: 1.5, borderRadius: 1, background: 'rgba(255,255,255,0.7)' }} />
              <span style={{ width: 10, height: 1.5, borderRadius: 1, background: 'rgba(255,255,255,0.7)' }} />
              <span style={{ width: 14, height: 1.5, borderRadius: 1, background: 'rgba(255,255,255,0.7)' }} />
            </button>

            {/* Logo */}
            <button onClick={() => navigate('/accueil')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <span style={{
                width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                background: 'radial-gradient(circle at 28% 28%, rgba(255,255,255,0.85), transparent 18%), linear-gradient(135deg, rgba(132,68,255,0.98), rgba(255,77,166,0.94))',
                boxShadow: '0 0 16px rgba(132,68,255,0.4)',
              }} />
              <span style={{ display: 'flex', alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.05rem', letterSpacing: '0.08em', lineHeight: 1, color: 'white' }}>L</span>
                <span style={{ display: 'inline-block', width: '2px', height: '11px', background: 'white', margin: '0 2px 1px', flexShrink: 0, alignSelf: 'center' }} />
                <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.05rem', letterSpacing: '0.08em', lineHeight: 1, color: 'white' }}>VE IN</span>
                <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontStyle: 'italic', fontWeight: 900, fontSize: '1rem', letterSpacing: '0.02em', color: 'white', marginLeft: '4px', lineHeight: 1, position: 'relative', top: '1px' }}>BLACK</span>
              </span>
            </button>

            {/* Right: avatar / connexion + notification bell */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {user ? (
                <>
                  {/* Notification bell — mobile */}
                  <div ref={notifBellRef} style={{ position: 'relative' }}>
                    <button onClick={handleOpenNotifs}
                      style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: notifOpen ? 'rgba(139,92,246,0.14)' : 'rgba(255,255,255,0.07)', border: `1px solid ${notifOpen ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.10)'}`, cursor: 'pointer', position: 'relative' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                      </svg>
                      {unreadNotifCount > 0 && (
                        <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 13, height: 13, borderRadius: 7, background: 'linear-gradient(135deg,#8b5cf6,#e05aaa)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 7, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                          {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                        </span>
                      )}
                    </button>
                    {notifOpen && (
                      <NotifDropdown notifications={notifications} onClose={() => setNotifOpen(false)} uid={uid} mobile />
                    )}
                  </div>
                  <button onClick={() => navigate('/profil')}
                    style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    {user.avatar ? <img src={user.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarLetter}
                  </button>
                </>
              ) : (
                <button onClick={() => navigate('/connexion')}
                  style={{ padding: '7px 14px', borderRadius: 999, background: 'linear-gradient(135deg, rgba(132,68,255,0.92), rgba(255,77,166,0.88))', border: 'none', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Connexion
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      {/* Agent banner — mobile only */}
      {isAgent && !chatMode && (
        <button onClick={() => navigate('/agent')}
          className="md:hidden w-full flex items-center justify-center gap-2 py-1.5 transition-all"
          style={{ background: 'rgba(200,169,110,0.07)', borderBottom: '1px solid rgba(200,169,110,0.12)', position: 'fixed', top: 70, left: 0, right: 0, zIndex: 39 }}>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.08em' }}>
            🔑 Interface Admin
          </span>
          {pendingCount > 0 && (
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(200,169,110,0.18)', color: 'var(--gold)' }}>
              {pendingCount}
            </span>
          )}
        </button>
      )}

      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <main className={chatMode ? 'flex flex-col' : ''} style={chatMode ? { flex: 1 } : {}}>
        <div style={{ maxWidth: chatMode ? undefined : 1320, margin: '0 auto', width: '100%' }}
          className={`${!hideNav && !chatMode ? 'pb-28 pt-20 md:pt-8 md:pb-16' : chatMode ? '' : 'pt-20 md:pt-8'}${chatMode ? ' flex-1 flex flex-col' : ''}`}>
          {children}
        </div>
      </main>

      {/* MOBILE: Bottom Nav — floating glass pill */}
      {!hideNav && <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40"
        style={{ padding: '0 12px 12px', pointerEvents: 'none' }}>
        <div style={{
          display: 'flex',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.04))',
          backdropFilter: 'blur(20px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 26,
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          overflow: 'hidden',
          pointerEvents: 'all',
        }}>
          {navItems.map((item) => {
            const active = location.pathname === item.path
            const isMsgItem = item.path === '/messagerie'
            return (
              <button key={item.path} onClick={() => navigate(item.path)}
                className={`flex-1 ${active ? 'nav-active-bounce' : ''}`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  padding: '12px 6px 10px',
                  background: active ? 'rgba(132,68,255,0.12)' : 'transparent',
                  border: 'none', cursor: 'pointer', position: 'relative',
                  transition: 'background 0.2s',
                }}>
                {active && (
                  <span style={{
                    position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                    width: 28, height: 2, borderRadius: 999,
                    background: 'linear-gradient(to right, var(--violet), var(--violet-end))',
                  }} />
                )}
                <div style={{ position: 'relative' }}>
                  <NavIcon id={item.path} active={active} />
                  {isMsgItem && unreadMsgCount > 0 && (
                    <span style={{ position: 'absolute', top: -5, right: -7, minWidth: 14, height: 14, borderRadius: 7, background: 'linear-gradient(135deg,#8444ff,#ff4da6)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                      {unreadMsgCount > 99 ? '99+' : unreadMsgCount}
                    </span>
                  )}
                </div>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, fontWeight: active ? 600 : 400, color: active ? '#fff' : 'rgba(255,255,255,0.30)' }}>
                  {item.label}
                </span>
              </button>
            )
          })}

          {/* Guest: connexion button */}
          {!user && (
            <button onClick={() => navigate('/connexion')}
              className="flex-1"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '12px 6px 10px', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--violet)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: 'var(--violet)' }}>Connexion</span>
            </button>
          )}
        </div>
      </nav>}
    </div>
  )
}

// ── Notification dropdown ─────────────────────────────────────────────────────
function NotifDropdown({ notifications, onClose, uid, mobile }) {
  const DM = "'DM Mono', monospace"
  const recent = notifications.slice(0, 8)

  function timeAgo(ts) {
    const diff = Date.now() - ts
    if (diff < 60000)   return 'À l\'instant'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    return `${Math.floor(diff / 86400000)}j`
  }

  return (
    <div style={{
      position: 'absolute',
      top: 'calc(100% + 10px)',
      right: 0,
      width: mobile ? 'min(320px, calc(100vw - 24px))' : 320,
      background: 'linear-gradient(180deg, rgba(14,16,30,0.98), rgba(8,10,20,0.98))',
      border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 14,
      boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.06) inset',
      backdropFilter: 'blur(24px)',
      zIndex: 999,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
        <span style={{ fontFamily: DM, fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
          Notifications
        </span>
        {notifications.length > 0 && (
          <button onClick={() => { if (uid) markAllRead(uid) }} style={{ fontFamily: DM, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(139,92,246,0.7)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Tout lire
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {recent.length === 0 ? (
          <div style={{ padding: '20px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
            <p style={{ fontFamily: DM, fontSize: 10, color: 'rgba(255,255,255,0.25)', margin: 0 }}>Aucune notification</p>
          </div>
        ) : (
          recent.map(n => {
            const cfg = NOTIF_CONFIG[n.type] || { icon: '🔔', color: 'rgba(255,255,255,0.5)' }
            return (
              <div key={n.id} style={{
                display: 'flex', gap: 12, padding: '12px 16px',
                borderTop: '1px solid rgba(255,255,255,0.04)',
                background: n.read ? 'transparent' : 'rgba(139,92,246,0.05)',
                cursor: 'default',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${cfg.color}12`,
                  border: `1px solid ${cfg.color}30`,
                  fontSize: 14,
                }}>
                  {cfg.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: DM, fontSize: 11, color: n.read ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.9)', margin: '0 0 3px', letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {n.title}
                  </p>
                  {n.body && (
                    <p style={{ fontFamily: DM, fontSize: 9, color: 'rgba(255,255,255,0.3)', margin: '0 0 4px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {n.body}
                    </p>
                  )}
                  <span style={{ fontFamily: DM, fontSize: 8, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.05em' }}>
                    {timeAgo(n.createdAt)}
                  </span>
                </div>
                {!n.read && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0, marginTop: 4 }} />
                )}
              </div>
            )
          })
        )}
      </div>

      {recent.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '10px 16px', textAlign: 'center' }}>
          <span style={{ fontFamily: DM, fontSize: 8, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>
            {notifications.length > 8 ? `+${notifications.length - 8} autres` : `${notifications.length} notification${notifications.length > 1 ? 's' : ''}`}
          </span>
        </div>
      )}
    </div>
  )
}
