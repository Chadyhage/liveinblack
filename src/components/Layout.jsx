import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SideMenu from './SideMenu'
import { getUserId, getTotalUnreadCount } from '../utils/messaging'
import { getBalance } from '../utils/wallet'
import { getTotalPendingCount } from '../utils/accounts'

// ── Nav icons ──────────────────────────────────────────────────────────────────
function NavIcon({ id, active }) {
  const color = active ? 'var(--teal)' : 'rgba(255,255,255,0.28)'
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
  const [balance, setBalance] = useState(0)
  const activeRole = user?.role || null
  const isAgent    = activeRole === 'agent'
  const pendingCount = isAgent ? getTotalPendingCount() : 0

  useEffect(() => {
    const uid = getUserId(user)
    if (uid) setBalance(getBalance(uid))
  }, [user, location.pathname])

  const navItems = getNavItems(activeRole)
  const uid = getUserId(user)
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)

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

  function handleProtectedNav(path) {
    if (!user) {
      openAuthModal('Connecte-toi pour accéder à cet espace.', () => navigate(path))
      return
    }
    navigate(path)
  }

  const avatarLetter = user?.name?.[0]?.toUpperCase() || '?'

  return (
    <div className="min-h-screen flex">

      {/* ── DESKTOP: Left Sidebar ── */}
      <aside className="hidden md:flex flex-col w-56 min-h-screen sticky top-0 h-screen shrink-0"
        style={{
          background: 'rgba(4,4,10,0.62)',
          backdropFilter: 'blur(24px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          zIndex: 10,
          padding: '32px 0',
        }}>

        {/* Logo */}
        <button onClick={() => navigate('/accueil')}
          style={{ display: 'flex', alignItems: 'baseline', padding: '0 24px', marginBottom: 40 }}>
          <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.15rem', letterSpacing: '0.1em', lineHeight: 1, color: 'white' }}>L</span>
          <span style={{ display: 'inline-block', width: '2px', height: '13px', background: 'white', margin: '0 2px 1px', flexShrink: 0, alignSelf: 'center' }} />
          <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.15rem', letterSpacing: '0.1em', lineHeight: 1, color: 'white' }}>VE IN</span>
          <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontStyle: 'italic', fontWeight: 900, fontSize: '1.1rem', letterSpacing: '0.02em', lineHeight: 1, color: 'white', marginLeft: '4px', position: 'relative', top: '1px' }}>BLACK</span>
        </button>

        {/* Nav items */}
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map((item) => {
            const active = location.pathname === item.path
            const isMsgItem = item.path === '/messagerie'
            return (
              <button key={item.path} onClick={() => navigate(item.path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 24px',
                  background: active ? 'rgba(78,232,200,0.06)' : 'transparent',
                  borderLeft: active ? '1px solid var(--teal)' : '1px solid transparent',
                  borderRight: 'none', borderTop: 'none', borderBottom: 'none',
                  transition: 'all 0.2s', cursor: 'pointer', textAlign: 'left',
                }}>
                <div style={{ position: 'relative' }}>
                  <NavIcon id={item.path} active={active} />
                  {isMsgItem && unreadMsgCount > 0 && (
                    <span style={{ position: 'absolute', top: -5, right: -7, minWidth: 14, height: 14, borderRadius: 7, background: '#e05aaa', color: '#fff', fontFamily: 'DM Mono, monospace', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: '1.5px solid #04040b' }}>
                      {unreadMsgCount > 99 ? '99+' : unreadMsgCount}
                    </span>
                  )}
                </div>
                <span style={{
                  fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: active ? 'var(--teal)' : 'rgba(255,255,255,0.35)',
                  transition: 'color 0.2s',
                }}>
                  {item.label}
                </span>
              </button>
            )
          })}

          {isAgent && (
            <button onClick={() => navigate('/agent')}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 24px',
                background: 'transparent', border: 'none',
                borderLeft: '1px solid rgba(200,169,110,0.35)',
                cursor: 'pointer', marginTop: 4,
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
              </svg>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)' }}>Admin</span>
              {pendingCount > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 9, fontFamily: 'DM Mono, monospace', padding: '2px 6px', borderRadius: 2, background: 'rgba(200,169,110,0.15)', border: '1px solid rgba(200,169,110,0.35)', color: 'var(--gold)' }}>{pendingCount}</span>
              )}
            </button>
          )}
        </nav>

        <div style={{ height: 1, margin: '16px 24px', background: 'rgba(255,255,255,0.06)' }} />

        {/* Bottom area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {user ? (
            <>
              <button onClick={() => navigate('/portefeuille')}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
                </svg>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.15em', color: 'var(--gold)' }}>
                  {balance.toFixed(0)} €
                </span>
              </button>
              <button onClick={() => navigate('/profil')}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', fontFamily: 'DM Mono, monospace', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                  {user.avatar ? <img src={user.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarLetter}
                </span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name || 'Profil'}
                </span>
              </button>
            </>
          ) : (
            <button onClick={() => navigate('/connexion')}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', background: 'transparent', border: 'none', borderLeft: '1px solid rgba(78,232,200,0.25)', cursor: 'pointer' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--teal)' }}>Se connecter</span>
            </button>
          )}
          <button onClick={() => setMenuOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 16 }}>
              <span style={{ width: 16, height: 1, background: 'rgba(255,255,255,0.25)' }} />
              <span style={{ width: 10, height: 1, background: 'rgba(255,255,255,0.25)' }} />
              <span style={{ width: 16, height: 1, background: 'rgba(255,255,255,0.25)' }} />
            </span>
            <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>Plus</span>
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">

        {/* MOBILE: Top Bar — hidden in chatMode, hide/reveal on scroll */}
        <header
          className="md:hidden sticky top-0 z-40"
          style={{
            background: 'transparent',
            display: chatMode ? 'none' : undefined,
            transform: headerHidden ? 'translateY(-100%)' : 'translateY(0)',
            transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
            willChange: 'transform',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
            <button onClick={() => setMenuOpen(true)}
              style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 36, height: 36, alignItems: 'flex-start', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <span style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.4)' }} />
              <span style={{ width: 14, height: 1, background: 'rgba(255,255,255,0.4)' }} />
              <span style={{ width: 20, height: 1, background: 'rgba(255,255,255,0.4)' }} />
            </button>

            <button onClick={() => navigate('/accueil')} style={{ display: 'flex', alignItems: 'baseline', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', letterSpacing: '0.1em', lineHeight: 1, color: 'white' }}>L</span>
              <span style={{ display: 'inline-block', width: '2px', height: '13px', background: 'white', margin: '0 2px 1px', flexShrink: 0, alignSelf: 'center' }} />
              <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', letterSpacing: '0.1em', lineHeight: 1, color: 'white' }}>VE IN</span>
              <span style={{ fontFamily: 'Playfair Display, Georgia, serif', fontStyle: 'italic', fontWeight: 900, fontSize: '1.15rem', letterSpacing: '0.02em', color: 'white', marginLeft: '5px', lineHeight: 1, position: 'relative', top: '1px' }}>BLACK</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {user ? (
                <>
                  <button onClick={() => navigate('/portefeuille')}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'right' }}>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 8, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(200,169,110,0.5)', lineHeight: 1, marginBottom: 2 }}>solde</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: 'var(--gold)', lineHeight: 1 }}>{balance.toFixed(0)} €</div>
                  </button>
                  <button onClick={() => navigate('/profil')}
                    style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', cursor: 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    {user.avatar ? <img src={user.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : avatarLetter}
                  </button>
                </>
              ) : (
                <button onClick={() => navigate('/connexion')}
                  style={{ padding: '7px 14px', borderRadius: 4, background: 'rgba(78,232,200,0.08)', border: '1px solid rgba(78,232,200,0.3)', color: 'var(--teal)', fontFamily: 'DM Mono, monospace', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  Connexion
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Agent banner — hidden in chatMode */}
        {isAgent && !chatMode && (
          <button onClick={() => navigate('/agent')}
            className="md:hidden w-full flex items-center justify-center gap-2 py-1.5 transition-all"
            style={{ background: 'linear-gradient(to right, rgba(212,175,55,0.07), rgba(212,175,55,0.12), rgba(212,175,55,0.07))', borderBottom: '1px solid rgba(212,175,55,0.15)' }}>
            <span className="text-xs font-bold tracking-wider"
              style={{ background: 'linear-gradient(135deg, #d4af37, #f0e080)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              🔑 INTERFACE ADMIN
            </span>
            {pendingCount > 0 && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                style={{ background: 'linear-gradient(135deg, #d4af37, #f0e080)', color: '#000' }}>
                {pendingCount}
              </span>
            )}
          </button>
        )}

        <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

        <main className={`flex-1${chatMode ? ' flex flex-col' : ''}`}>
          <div className={`md:max-w-3xl md:mx-auto md:px-6 md:pb-0${!hideNav && !chatMode ? ' pb-20' : ''}${chatMode ? ' flex-1 flex flex-col' : ''}`}>
            {children}
          </div>
        </main>

        {/* MOBILE: Bottom Nav */}
        {!hideNav && <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40"
          style={{
            background: 'rgba(4,5,12,0.78)',
            backdropFilter: 'blur(24px) saturate(1.6)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
            borderTop: '1px solid rgba(255,255,255,0.07)',
          }}>
          <div className="flex">
            {navItems.map((item) => {
              const active = location.pathname === item.path
              const isMsgItem = item.path === '/messagerie'
              return (
                <button key={item.path} onClick={() => navigate(item.path)}
                  className={`flex-1 pt-3 pb-4 flex flex-col items-center gap-1.5 transition-all relative ${active ? 'nav-active-bounce' : ''}`}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  {active && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-px"
                      style={{ background: 'linear-gradient(to right, transparent, var(--teal), transparent)' }} />
                  )}
                  <div style={{ position: 'relative' }}>
                    <NavIcon id={item.path} active={active} />
                    {isMsgItem && unreadMsgCount > 0 && (
                      <span style={{ position: 'absolute', top: -5, right: -7, minWidth: 14, height: 14, borderRadius: 7, background: '#e05aaa', color: '#fff', fontFamily: 'DM Mono, monospace', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', border: '1.5px solid rgba(4,5,12,0.9)' }}>
                        {unreadMsgCount > 99 ? '99+' : unreadMsgCount}
                      </span>
                    )}
                  </div>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 7, letterSpacing: '0.18em', textTransform: 'uppercase', color: active ? 'var(--teal)' : 'rgba(255,255,255,0.22)' }}>
                    {item.label}
                  </span>
                </button>
              )
            })}

            {/* Guest: show connexion button in bottom nav */}
            {!user && (
              <button onClick={() => navigate('/connexion')}
                className="flex-1 pt-3 pb-4 flex flex-col items-center gap-1.5 transition-all"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 7, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--teal)' }}>Connexion</span>
              </button>
            )}
          </div>
        </nav>}
      </div>
    </div>
  )
}
