import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SideMenu from './SideMenu'
import AnimatedLogo from './AnimatedLogo'
import AnimatedHamburger from './AnimatedHamburger'
import { getUserId, getTotalUnreadCount, getLastRead, getConversationById, getUserById, getInitials, userShowsPhoto } from '../utils/messaging'
import { getTotalPendingCount } from '../utils/accounts'
import { getNotifications, getUnreadCount, markAllRead, markRead, NOTIF_CONFIG, upsertMessageNotification, createNotification } from '../utils/notifications'
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
  if (id === '/mes-soirees') return <svg {...props}><path d="M22 10V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v4a2 2 0 0 1 0 4v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4a2 2 0 0 1 0-4z"/><path d="M9 5v14" strokeDasharray="2 3"/></svg>
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

  const uid = getUserId(user)
  // Affectations staff (mini-POS) : un membre invité (souvent « client ») doit voir
  // une entrée « Mes soirées » et pouvoir accéder au scanner. Alimenté par le
  // listener staff_assignments plus bas ; init depuis le cache pour un rendu immédiat.
  const [staffEvents, setStaffEvents] = useState(() => {
    try { return uid ? Object.values(JSON.parse(localStorage.getItem(`lib_my_staff_${uid}`) || '{}')).filter(Boolean) : [] } catch { return [] }
  })
  const baseNavItems = getNavItems(activeRole)
  const navItems = (uid && staffEvents.length > 0 && !baseNavItems.some(i => i.path === '/mes-soirees'))
    ? [...baseNavItems, { path: '/mes-soirees', icon: '🎫', label: 'Mes soirées' }]
    : baseNavItems
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

  // Écouteur des affectations staff (staff_assignments where uid==moi) : maintient
  // le cache lib_my_staff (lu par la garde du scanner + la nav), pilote l'entrée
  // « Mes soirées », et génère la notification d'invitation CÔTÉ MEMBRE (l'organisateur
  // n'a pas le droit d'écrire dans le doc notifications de l'invité — règles Firestore).
  useEffect(() => {
    if (!uid) { setStaffEvents([]); return }
    // Réinitialise depuis le cache DU nouvel uid dès qu'il change (évite qu'un compte
    // hérite transitoirement des « Mes soirées » du précédent avant la réponse du listener).
    try { setStaffEvents(Object.values(JSON.parse(localStorage.getItem(`lib_my_staff_${uid}`) || '{}')).filter(Boolean)) } catch { setStaffEvents([]) }
    let unsub = () => {}
    import('../utils/eventOrders').then(({ listenMyStaffAssignments }) => {
      unsub = listenMyStaffAssignments(uid, (list) => {
        setStaffEvents(list)
        try {
          const seenKey = `lib_my_staff_seen_${uid}`
          const seen = JSON.parse(localStorage.getItem(seenKey) || '{}')
          const nowKeys = {}
          // Présence seule (true) : un changement de rôle ne re-notifie pas (anti-spam) ;
          // le rôle appliqué reste correct partout (staffEvents/scanner sont réactifs).
          list.forEach(a => { nowKeys[String(a.eventId)] = true })
          const RECENT_MS = 48 * 60 * 60 * 1000 // ne notifier que les affectations récentes
          // Dédup CROSS-DEVICE : getNotifications(uid) est synchronisé via le doc
          // notifications/{uid} (listener plus haut), donc on ne redéclenche pas une
          // invitation déjà reçue sur un autre appareil (le cache `seen` est par-appareil).
          const existing = getNotifications(uid)
          const alreadyInvited = (k) => existing.some(n => n.type === 'staff_invited' && String(n.data?.eventId) === String(k))
          // Nouvelles affectations → notif d'invitation (self-write autorisé)
          list.forEach(a => {
            const k = String(a.eventId)
            if (seen[k] || alreadyInvited(k)) return
            const addedAtMs = a.addedAt ? new Date(a.addedAt).getTime() : 0
            if (addedAtMs && Date.now() - addedAtMs < RECENT_MS) {
              const body = a.role === 'scan'
                ? `Tu contrôles les entrées de « ${a.eventName || 'un événement'} ». Va dans « Mes soirées » pour accéder au scan.`
                : `Tu es serveur pour « ${a.eventName || 'un événement'} ». Va dans « Mes soirées » pour prendre les commandes.`
              createNotification(uid, 'staff_invited', 'Tu fais partie de l\'équipe 🎉', body, { eventId: k, role: a.role })
            }
          })
          // Affectations disparues → notif de retrait (dédup identique)
          const alreadyRemoved = (k) => existing.some(n => n.type === 'staff_removed' && String(n.data?.eventId) === String(k))
          Object.keys(seen).forEach(k => {
            if (!nowKeys[k] && !alreadyRemoved(k)) createNotification(uid, 'staff_removed', 'Équipe de la soirée', 'Tu ne fais plus partie de l\'équipe d\'une soirée.', { eventId: k })
          })
          localStorage.setItem(seenKey, JSON.stringify(nowKeys))
        } catch {}
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
        const n = new Notification(title, { body, icon: '/logo192.png', badge: '/logo192.png', tag: 'liveinblack-msg', silent: true })
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
            <span data-navlogo><AnimatedLogo size={30} textScale={0.46} onClick={() => navigate('/accueil')} /></span>

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
        <div key={chatMode ? undefined : location.pathname} style={{ maxWidth: chatMode ? undefined : 1320, margin: '0 auto', width: '100%' }}
          className={`${chatMode ? '' : 'lib-page '}${!hideNav && !chatMode ? 'pb-28 pt-20 md:pt-8 md:pb-16' : chatMode ? '' : 'pt-20 md:pt-8'}${chatMode ? ' flex-1 flex flex-col' : ''}`}>
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
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(false)

  // Regroupe les notifications identiques (même type + même titre) pour éviter
  // une liste interminable : « Charbel s'est retiré… » ×12 → une seule ligne
  // avec un compteur. On garde la plus récente comme représentante du groupe.
  const grouped = useMemo(() => {
    const map = new Map()
    for (const n of notifications) {
      const key = `${n.type}|${n.title}`
      const g = map.get(key)
      if (g) {
        g.count += 1
        if (!n.read) g.read = false
        if (n.createdAt > g.createdAt) { g.createdAt = n.createdAt; g.body = n.body }
      } else {
        map.set(key, { ...n, count: 1 })
      }
    }
    return [...map.values()].sort((a, b) => b.createdAt - a.createdAt)
  }, [notifications])

  const recent = showAll ? grouped : grouped.slice(0, 6)

  // Destination de clic selon le type de notification
  function routeFor(n) {
    if (n.type === 'message') return '/messagerie'
    if (n.type === 'new_order') return '/mes-evenements'
    if (n.type === 'staff_invited' || n.type === 'staff_removed') return '/mes-soirees'
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
      width: mobile ? 'min(330px, calc(100vw - 24px))' : 340,
      maxHeight: 'calc(100vh - 110px)',
      display: 'flex', flexDirection: 'column',
      background: '#101014',
      border: '1px solid rgba(255,255,255,0.04)',
      borderRadius: 20,
      boxShadow: '0 30px 60px -15px rgba(0,0,0,0.8)',
      backdropFilter: 'blur(24px)',
      zIndex: 999,
      padding: 10,
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
      <div style={{ flex: 1, minHeight: 0, maxHeight: 'min(46vh, 300px)', overflowY: 'auto', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                <NotifIcon n={n} uid={uid} accent={accent} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, color: n.read ? 'rgba(255,255,255,0.55)' : 'rgba(228,228,231,1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {n.title}
                      </span>
                      {n.count > 1 && (
                        <span style={{ flexShrink: 0, fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 800, color: accent, background: `${accent}22`, border: `1px solid ${accent}44`, borderRadius: 999, padding: '1px 7px', lineHeight: 1.5 }}>
                          ×{n.count}
                        </span>
                      )}
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

      {!showAll && grouped.length > recent.length && (
        <button onClick={() => setShowAll(true)}
          className="mt-2 flex w-full items-center justify-center rounded-xl border border-white/[0.02] bg-[#16161c] py-2.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400 transition-all duration-200 hover:bg-[#1c1c24] hover:text-zinc-200 active:scale-[0.99]"
          style={{ fontFamily: 'Inter, sans-serif' }}>
          Voir les {grouped.length - recent.length} autres
        </button>
      )}
      {showAll && grouped.length > 6 && (
        <button onClick={() => setShowAll(false)}
          className="mt-2 flex w-full items-center justify-center rounded-xl border border-white/[0.02] bg-[#16161c] py-2.5 text-[11px] font-bold uppercase tracking-wider text-zinc-400 transition-all duration-200 hover:bg-[#1c1c24] hover:text-zinc-200 active:scale-[0.99]"
          style={{ fontFamily: 'Inter, sans-serif' }}>
          Réduire
        </button>
      )}
    </div>
  )
}

// Icône de notification « intelligente » : pour les messages/mentions, on
// affiche l'AVATAR réel de l'expéditeur (ou du groupe) — comme WhatsApp —
// avec un mini-badge selon le contenu (photo, événement, sondage, vocal…).
// Les autres types (commande, dossier…) gardent leur picto dédié.
function NotifIcon({ n, uid, accent }) {
  const isMsg = (n.type === 'message' || n.type === 'mention') && n.data?.convId

  if (isMsg) {
    // Résoudre l'expéditeur / le groupe depuis la conversation
    let avatar = null
    let name = n.title || '?'
    let isGroup = false
    try {
      const conv = getConversationById(n.data.convId)
      if (conv?.type === 'group') {
        isGroup = true
        name = conv.name || name
        avatar = conv.avatar || null
      } else if (conv) {
        const otherId = (conv.participants || []).find(id => id !== uid)
        const u = otherId ? getUserById(otherId) : null
        if (u) {
          name = u.name || name
          avatar = (u.avatar && userShowsPhoto(u)) ? u.avatar : null
        }
      }
    } catch {}
    // Couleur d'initiales : même palette/hachage que l'avatar de la messagerie
    const colors = ['#c8a96e', '#8b5cf6', '#e05aaa', '#3b82f6', '#4ee8c8', '#f59e0b']
    const color = colors[(name.charCodeAt(name.length - 1) || 0) % colors.length]

    // Mini-badge par type de contenu (déduit de l'aperçu du message)
    const body = n.body || ''
    const bp = { width: 9, height: 9, viewBox: '0 0 24 24', fill: 'none', stroke: '#fff', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' }
    let badge = <svg {...bp}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
    let badgeBg = '#8b5cf6'
    if (/📷|Photo/i.test(body)) { badge = <svg {...bp}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="3"/></svg>; badgeBg = '#4ee8c8' }
    else if (/🎟|Événement/i.test(body)) { badge = <svg {...bp}><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z"/></svg>; badgeBg = '#c8a96e' }
    else if (/📊|Sondage/i.test(body)) { badge = <svg {...bp}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; badgeBg = '#e05aaa' }
    else if (/🎤|🎵|[Vv]ocal|[Aa]udio/.test(body)) { badge = <svg {...bp}><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="22"/></svg>; badgeBg = '#3b82f6' }
    else if (n.type === 'mention') { badge = <svg {...bp}><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>; badgeBg = '#4ee8c8' }

    return (
      <div style={{ position: 'relative', flexShrink: 0, width: 40, height: 40 }}>
        {avatar ? (
          <img src={avatar} alt={name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 13 }}>
            {isGroup
              ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              : getInitials(name)}
          </div>
        )}
        {/* Mini-badge de type de contenu */}
        <span style={{ position: 'absolute', bottom: -2, right: -2, width: 17, height: 17, borderRadius: '50%', background: badgeBg, border: '2px solid #101014', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {badge}
        </span>
      </div>
    )
  }

  // Types non-message : picto dédié dans une pastille carrée arrondie
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] transition-all"
      style={{ background: '#1a1a22', border: '1px solid rgba(255,255,255,0.03)', color: accent }}>
      <NotifGlyph type={n.type} />
    </div>
  )
}

// Icône SVG par type de notification (remplace les emojis NOTIF_CONFIG).
function NotifGlyph({ type }) {
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (type === 'message') return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
  if (type === 'new_order') return <svg {...p}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
  if (type && type.startsWith('application_')) return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="16" y1="11" x2="22" y2="11" /></svg>
  if (type === 'mention') return <svg {...p}><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
  if (type === 'staff_invited' || type === 'staff_removed') return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
}
