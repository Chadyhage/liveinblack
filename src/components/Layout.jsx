import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SideMenu from './SideMenu'
import AnimatedLogo from './AnimatedLogo'
import AnimatedHamburger from './AnimatedHamburger'
import { getUserId, getTotalUnreadCount, getLastRead } from '../utils/messaging'
import { getTotalPendingCount } from '../utils/accounts'
import { getNotifications, getUnreadCount, markAllRead, markRead, NOTIF_CONFIG, upsertMessageNotification } from '../utils/notifications'
import { playNotifSound } from '../utils/notifSound'
import { IconBell } from './icons'

// ── Nav icons ──────────────────────────────────────────────────────────────────
function NavIcon({ id, active, activeColor = 'var(--violet)' }) {
  const color = active ? activeColor : 'rgba(255,255,255,0.28)'
  const s = active ? 1.6 : 1.3
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
  // Compteurs précédents pour déclencher le son global UNE fois à la hausse
  // (null au premier passage → pas de bip au chargement initial).
  const prevMsgCountRef = useRef(null)
  const prevNotifCountRef = useRef(null)
  // pathname courant lu dans les listeners sans les re-souscrire à chaque nav
  const pathnameRef = useRef(location.pathname)
  useEffect(() => { pathnameRef.current = location.pathname }, [location.pathname])

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

  // Demande l'autorisation des notifications navigateur tôt et globalement
  // (et non plus seulement sur la page Messages), de façon discrète après un
  // court délai. Sans autorisation, le son + la cloche in-app marchent quand
  // même — seule la bannière hors-onglet est concernée.
  useEffect(() => {
    if (!uid) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'default') return
    const t = setTimeout(() => { try { Notification.requestPermission().catch(() => {}) } catch {} }, 4000)
    return () => clearTimeout(t)
  }, [uid])

  useEffect(() => {
    if (!uid) return
    // reset des compteurs au changement de compte pour ne pas biper sur la bascule
    prevMsgCountRef.current = null
    const tick = () => {
      const c = getTotalUnreadCount(uid)
      if (prevMsgCountRef.current != null && c > prevMsgCountRef.current) playNotifSound()
      prevMsgCountRef.current = c
      setUnreadMsgCount(c)
    }
    tick()
    const interval = setInterval(tick, 3000)
    return () => clearInterval(interval)
  }, [uid])

  // Poll notifications — joue le son global quand le nombre de non-lues monte
  useEffect(() => {
    if (!uid) return
    prevNotifCountRef.current = null
    const refresh = () => {
      const notifs = getNotifications(uid)
      setNotifications(notifs)
      const c = getUnreadCount(uid)
      if (prevNotifCountRef.current != null && c > prevNotifCountRef.current) playNotifSound()
      prevNotifCountRef.current = c
      setUnreadNotifCount(c)
    }
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [uid])

  // Écouteur Firestore TEMPS RÉEL des notifications (cloche à jour sur n'importe
  // quelle page, sans attendre le prochain poll) — ventes, dossiers, messages.
  useEffect(() => {
    if (!uid) return
    let unsub = () => {}
    import('../utils/firestore-sync').then(({ listenDoc }) => {
      unsub = listenDoc(`notifications/${uid}`, (data) => {
        if (!data) return
        const items = (data.items || []).slice(0, 50)
        try { localStorage.setItem(`lib_notifications_${uid}`, JSON.stringify(items)) } catch {}
        setNotifications(items)
        const c = items.filter(n => !n.read).length
        if (prevNotifCountRef.current != null && c > prevNotifCountRef.current) playNotifSound()
        prevNotifCountRef.current = c
        setUnreadNotifCount(c)
      })
    }).catch(() => {})
    return () => { try { unsub() } catch {} }
  }, [uid])

  // Écouteur GLOBAL des conversations (temps réel partout) : détecte les
  // nouveaux messages reçus quelle que soit la page → son + cloche + push +
  // pastille Messages. Sur la page Messagerie (visible), c'est MessagingPage
  // qui gère (avec sa finesse "conversation active"), donc on s'efface pour
  // éviter le double déclenchement.
  useEffect(() => {
    if (!uid) return
    const unsubs = []
    const lastSeen = {}      // convId -> updatedAt déjà vu
    const mountTime = Date.now() // fenêtre de grâce : pas d'alerte sur le snapshot initial

    function pushBrowserNotif(title, body) {
      try {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
        const n = new Notification(title, { body, icon: '/logo192.png', badge: '/logo192.png', tag: 'liveinblack-msg' })
        n.onclick = () => { window.focus(); n.close() }
      } catch {}
    }

    import('../utils/firestore-sync').then(({ listenDirectConversations, listenGroupConversations, mergeById }) => {
      const handle = (convs) => {
        // Fusionne dans localStorage pour que la pastille Messages soit juste partout
        try {
          const local = JSON.parse(localStorage.getItem('lib_conversations') || '[]')
          localStorage.setItem('lib_conversations', JSON.stringify(mergeById(local, convs)))
        } catch {}
        setUnreadMsgCount(getTotalUnreadCount(uid))

        convs.forEach(c => {
          const prev = lastSeen[c.id]
          const isNewer = !prev || c.updatedAt > prev
          if (isNewer) lastSeen[c.id] = c.updatedAt
          // Fenêtre de grâce après montage : on enregistre sans alerter (snapshot initial)
          if (Date.now() - mountTime < 4000) return
          if (!isNewer || !c.lastMessage) return
          if (!c.lastSenderId || c.lastSenderId === uid) return // pas mes propres messages
          // Si l'utilisateur est sur la Messagerie et visible → MessagingPage gère
          const onMessages = pathnameRef.current.startsWith('/messagerie') && document.visibilityState === 'visible'
          if (onMessages) return
          const lastRead = getLastRead(c.id)
          if (lastRead && c.updatedAt <= lastRead) return // déjà lu
          const senderName = c.type === 'group'
            ? (c.name || 'Groupe')
            : (c.names ? (Object.entries(c.names).find(([id]) => id !== uid)?.[1] || 'Message') : 'Message')
          playNotifSound()
          upsertMessageNotification(uid, c.id, senderName, c.lastMessage)
          pushBrowserNotif(senderName, c.lastMessage)
        })
      }
      unsubs.push(listenDirectConversations(uid, handle))
      unsubs.push(listenGroupConversations(uid, handle))
    }).catch(() => {})

    return () => { unsubs.forEach(u => { try { u() } catch {} }) }
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
            <div style={{ flexShrink: 0, marginRight: 8 }}>
              <span data-navlogo><AnimatedLogo size={40} textScale={0.45} onClick={() => navigate('/accueil')} /></span>
            </div>

            {/* Nav pills — centered */}
            <nav style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              {navItems.map((item) => {
                const active = location.pathname === item.path
                const isMsgItem = item.path === '/messagerie'
                return (
                  <button key={item.path} onClick={() => navigate(item.path)}
                    className={`group relative flex items-center gap-1.5 rounded-xl border transition-all duration-300 ${active ? 'border-fuchsia-500/35 bg-fuchsia-500/[0.1] shadow-[0_0_22px_rgba(217,70,239,0.2)]' : 'border-transparent hover:bg-white/[0.05]'}`}
                    style={{ padding: '7px 12px', cursor: 'pointer' }}>
                    {/* Équerres émeraude (apparaissent au survol, fixes si actif) */}
                    <span className={`pointer-events-none absolute top-1.5 left-2 h-2 w-2 rounded-tl-sm border-t-2 border-l-2 border-emerald-400 transition-all duration-300 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                    <span className={`pointer-events-none absolute bottom-1.5 right-2 h-2 w-2 rounded-br-sm border-b-2 border-r-2 border-emerald-400 transition-all duration-300 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                    <div className="relative transition-transform duration-300 group-hover:scale-110">
                      <NavIcon id={item.path} active={active} activeColor="#e879f9" />
                      {isMsgItem && unreadMsgCount > 0 && (
                        <span style={{ position: 'absolute', top: -5, right: -7, minWidth: 14, height: 14, borderRadius: 7, background: 'linear-gradient(135deg,#8b5cf6,#d946ef)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                          {unreadMsgCount > 99 ? '99+' : unreadMsgCount}
                        </span>
                      )}
                    </div>
                    <span className={`uppercase transition-colors duration-300 ${active ? 'text-fuchsia-400' : 'text-white/45 group-hover:text-white'}`}
                      style={{ fontFamily: "'Syne', sans-serif", fontSize: 12.5, fontWeight: active ? 800 : 600, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                      {item.label}
                    </span>
                    {/* Trait laser (pousse depuis le centre au survol, large si actif) */}
                    <span className={`pointer-events-none absolute bottom-[3px] left-1/2 h-[1.5px] -translate-x-1/2 rounded-full transition-all duration-300 ${active ? 'w-[55%] opacity-100' : 'w-0 opacity-0 group-hover:w-[65%] group-hover:opacity-100'}`}
                      style={{ background: 'linear-gradient(90deg, rgba(52,211,153,0.4), #34d399, rgba(52,211,153,0.4))', boxShadow: '0 0 10px rgba(52,211,153,0.7)' }} />
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
                    <NotifBell open={notifOpen} unread={unreadNotifCount} onClick={handleOpenNotifs} size={34} />
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
              <AnimatedHamburger size={34} active={menuOpen} onClick={() => setMenuOpen(o => !o)} />
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
            <AnimatedHamburger size={32} active={menuOpen} onClick={() => setMenuOpen(o => !o)} />

            {/* Logo */}
            <span data-navlogo><AnimatedLogo size={24} onClick={() => navigate('/accueil')} /></span>

            {/* Right: avatar / connexion + notification bell */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {user ? (
                <>
                  {/* Notification bell — mobile */}
                  <div ref={notifBellRef} style={{ position: 'relative' }}>
                    <NotifBell open={notifOpen} unread={unreadNotifCount} onClick={handleOpenNotifs} size={32} />
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

      {/* Footer global — masqué en chatMode et sur les vues hideNav (paiement, ticket scanné) */}
      {!chatMode && !hideNav && (
        <footer style={{
          marginTop: 'auto',
          padding: '32px 24px 28px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          textAlign: 'center',
          fontFamily: "'DM Mono', monospace",
        }}
        className="md:pl-[260px] pb-28 md:pb-8">
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            {/* Logo discret */}
            <div style={{ marginBottom: 16, opacity: 0.55 }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.7)' }}>L|VE IN</span>
              <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic', fontSize: 14, color: '#c8a96e', marginLeft: 6 }}>BLACK</span>
            </div>

            {/* Liens légaux */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
              gap: '6px 14px', marginBottom: 16,
            }}>
              {[
                { label: 'Mentions légales', path: '/mentions-legales' },
                { label: 'Confidentialité', path: '/confidentialite' },
                { label: 'Cookies', path: '/cookies' },
                { label: 'CGU', path: '/cgu' },
                { label: 'Contact', path: 'mailto:hagechady@liveinblack.com', external: true },
              ].map((link) =>
                link.external ? (
                  <a key={link.path} href={link.path}
                    style={{
                      fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.32)', textDecoration: 'none',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#c8a96e'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.32)'}>
                    {link.label}
                  </a>
                ) : (
                  <button key={link.path} onClick={() => navigate(link.path)}
                    style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      fontFamily: "'DM Mono', monospace", fontSize: 9,
                      letterSpacing: '0.2em', textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.32)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#c8a96e'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.32)'}>
                    {link.label}
                  </button>
                )
              )}
            </div>

            <p style={{ fontSize: 9, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.20)', margin: 0 }}>
              © {new Date().getFullYear()} LIVEINBLACK · Tous droits réservés
            </p>
          </div>
        </footer>
      )}

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
                className={`group flex-1 relative flex flex-col items-center gap-1 cursor-pointer rounded-2xl border transition-all duration-300 ${active ? 'border-fuchsia-500/35 bg-fuchsia-500/[0.07] shadow-[0_4px_20px_rgba(139,92,246,0.15)]' : 'border-transparent hover:bg-white/[0.04]'}`}
                style={{ padding: navItems.length >= 5 ? '11px 2px 9px' : '11px 4px 9px', margin: navItems.length >= 5 ? '4px 1px' : '4px 3px', minWidth: 0 }}>
                {/* Équerres émeraude (coins) — glissent à l'apparition au survol, fixes si actif */}
                <span className={`pointer-events-none absolute top-1.5 left-2 h-2 w-2 rounded-tl-sm border-t-2 border-l-2 border-emerald-400 transition-all duration-300 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                <span className={`pointer-events-none absolute bottom-1.5 right-2 h-2 w-2 rounded-br-sm border-b-2 border-r-2 border-emerald-400 transition-all duration-300 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                <div className="relative transition-transform duration-300 group-hover:scale-110 group-active:scale-95" style={active ? { transform: 'scale(1.06)' } : undefined}>
                  <NavIcon id={item.path} active={active} activeColor="#e879f9" />
                  {isMsgItem && unreadMsgCount > 0 && (
                    <span style={{ position: 'absolute', top: -5, right: -7, minWidth: 14, height: 14, borderRadius: 7, background: 'linear-gradient(135deg,#8b5cf6,#d946ef)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                      {unreadMsgCount > 99 ? '99+' : unreadMsgCount}
                    </span>
                  )}
                </div>
                <span className={`uppercase transition-colors duration-300 ${active ? 'text-fuchsia-400' : 'text-white/30 group-hover:text-white'}`}
                  style={{
                    fontFamily: "'Syne', sans-serif", fontWeight: active ? 800 : 600, letterSpacing: '0.02em',
                    fontSize: navItems.length >= 5 ? 8 : 9,
                    maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                  {item.label}
                </span>
                {/* Trait laser — pousse depuis le centre au survol, large si actif */}
                <span className={`pointer-events-none absolute bottom-[3px] left-1/2 h-[1.5px] -translate-x-1/2 rounded-full transition-all duration-300 ${active ? 'w-[60%] opacity-100' : 'w-0 opacity-0 group-hover:w-[70%] group-hover:opacity-100'}`}
                  style={{ background: 'linear-gradient(90deg, rgba(52,211,153,0.4), #34d399, rgba(52,211,153,0.4))', boxShadow: '0 0 10px rgba(52,211,153,0.7)' }} />
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
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, color: 'var(--violet)' }}>Se connecter</span>
            </button>
          )}
        </div>
      </nav>}
    </div>
  )
}

// ── Cloche de notification animée (Refonte LIB) ───────────────────────────────
// Laser fuchsia qui sillonne le haut + tintement de la cloche au survol.
function NotifBell({ open, unread, onClick, size = 34 }) {
  return (
    <button onClick={onClick} aria-label="Notifications"
      className="group relative flex items-center justify-center overflow-hidden rounded-xl border bg-[#121216] transition-all duration-300 hover:border-fuchsia-500/40 hover:text-fuchsia-400 hover:shadow-[0_0_20px_rgba(217,70,239,0.15)] active:scale-95"
      style={{ width: size, height: size, flexShrink: 0, borderColor: open ? 'rgba(217,70,239,0.45)' : 'rgba(255,255,255,0.08)', color: open ? '#e879f9' : 'rgba(255,255,255,0.55)' }}>
      <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-fuchsia-500 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:animate-laser-sweep" />
      <svg className="group-hover:animate-bell-ring" width={Math.round(size * 0.47)} height={Math.round(size * 0.47)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute" style={{ top: size * 0.22, right: size * 0.22, width: 7, height: 7, borderRadius: '50%', background: '#d946ef', boxShadow: '0 0 8px rgba(217,70,239,0.9)' }} />
      )}
    </button>
  )
}

// ── Notification dropdown ─────────────────────────────────────────────────────
function NotifDropdown({ notifications, onClose, uid, mobile }) {
  const DM = "'DM Mono', monospace"
  const navigate = useNavigate()
  const recent = notifications.slice(0, 8)

  // Destination de clic selon le type de notification
  function routeFor(n) {
    if (n.type === 'message') return '/messagerie'
    if (n.type === 'new_order') return '/mes-evenements'
    if (n.type?.startsWith('application_')) return '/mon-dossier'
    return null
  }
  function handleClickNotif(n) {
    if (uid) markRead(uid, n.id)
    const dest = routeFor(n)
    onClose?.()
    if (dest) navigate(dest)
  }

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
      top: 'calc(100% + 12px)',
      right: 0,
      width: mobile ? 'min(340px, calc(100vw - 24px))' : 340,
      background: '#101014',
      border: '1px solid rgba(255,255,255,0.04)',
      borderRadius: 24,
      boxShadow: '0 30px 60px -15px rgba(0,0,0,0.8)',
      backdropFilter: 'blur(24px)',
      zIndex: 999,
      padding: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.32)' }}>
          Notifications
        </span>
        {notifications.length > 0 && (
          <button onClick={() => { if (uid) markAllRead(uid) }} style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, color: 'rgba(217,70,239,0.8)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Tout lire
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ maxHeight: 340, overflowY: 'auto', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {recent.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <IconBell size={26} color="rgba(255,255,255,0.18)" />
            </div>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.28)', margin: 0 }}>Aucune notification</p>
          </div>
        ) : (
          recent.map(n => {
            const cfg = NOTIF_CONFIG[n.type] || { color: 'rgba(255,255,255,0.5)' }
            const accent = cfg.color || 'rgba(255,255,255,0.5)'
            const clickable = routeFor(n) != null
            return (
              <div key={n.id}
                onClick={clickable ? () => handleClickNotif(n) : undefined}
                className="group flex items-start gap-3 rounded-xl p-2.5 transition-all duration-200 hover:bg-white/[0.025]"
                style={{ cursor: clickable ? 'pointer' : 'default' }}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] transition-all"
                  style={{ background: '#1a1a22', border: '1px solid rgba(255,255,255,0.03)', color: accent }}>
                  <NotifGlyph type={n.type} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, color: n.read ? 'rgba(255,255,255,0.55)' : 'rgba(228,228,231,1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {n.title}
                      </span>
                      {!n.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }} />}
                    </div>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>{timeAgo(n.createdAt)}</span>
                  </div>
                  {n.body && (
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {n.body}
                    </p>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {notifications.length > recent.length && (
        <button onClick={() => { onClose?.(); navigate('/profil') }}
          className="mt-2 flex w-full items-center justify-center rounded-xl border border-white/[0.02] bg-[#16161c] py-2.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400 transition-all duration-200 hover:bg-[#1c1c24] hover:text-zinc-200 active:scale-[0.99]"
          style={{ fontFamily: 'Inter, sans-serif' }}>
          +{notifications.length - recent.length} notifications de plus
        </button>
      )}
    </div>
  )
}

// Icône SVG par type de notification (remplace les emojis NOTIF_CONFIG).
function NotifGlyph({ type }) {
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (type === 'message') return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
  if (type === 'new_order') return <svg {...p}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
  if (type && type.startsWith('application_')) return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="16" y1="11" x2="22" y2="11" /></svg>
  return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
}
