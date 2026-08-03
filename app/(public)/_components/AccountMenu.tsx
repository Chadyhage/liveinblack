'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { MessageCircle, Ticket, User, LayoutDashboard, LogOut, Check, Bell, ChevronDown } from 'lucide-react'
import { Avatar, Button, Skeleton } from '@/app/components/ui'

// Remplace les boutons Connexion/Créer un compte de PublicNav dès qu'une
// session existe — avant ce composant, un utilisateur connecté voyait
// toujours les boutons d'auth sur /home (aucun composant ne vérifiait la
// session côté nav). Aperçu messages + menu compte, façon Instagram/Twitter
// (dropdown, pas de navigation complète pour un simple coup d'œil).

export interface ConversationPreview {
  id: string
  type: 'direct' | 'group'
  name: string | null
  avatar: string | null
  members: { userId: string; name: string }[]
  lastMessage: string
  lastMessageAt: string | null
  unreadCount: number
}

interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  link: string | null
  read: boolean
  createdAt: string
}

const DASHBOARD_BY_ROLE: Record<string, { href: string; label: string }> = {
  organisateur: { href: '/organizer-studio', label: 'Espace organisateur' },
  prestataire: { href: '/offer-services', label: 'Espace prestataire' },
  agent: { href: '/agent', label: "Espace agent" },
}

// Les conversations directes n'ont pas de `name`/`avatar` au niveau
// conversation (réservé aux groupes) — le nom affiché vient toujours de
// l'autre membre, même logique que MessagesClient.tsx (`members.find`).
function conversationDisplay(conv: ConversationPreview, currentUserId: string): { name: string; avatar: string | null } {
  if (conv.type === 'group') return { name: conv.name || 'Groupe', avatar: conv.avatar }
  const other = conv.members.find((m) => m.userId !== currentUserId)
  return { name: other?.name || 'Conversation', avatar: null }
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  return `${Math.floor(h / 24)} j`
}

export default function AccountMenu({
  user,
}: {
  user: { id: string; name?: string | null; email?: string | null; image?: string | null; activeRole?: string | null; roles?: string[] | null }
}) {
  const router = useRouter()
  const { update } = useSession()
  const [messagesOpen, setMessagesOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [switchingRole, setSwitchingRole] = useState(false)
  const [conversations, setConversations] = useState<ConversationPreview[] | null>(null)
  const [notifications, setNotifications] = useState<NotificationItem[] | null>(null)
  const [notifUnread, setNotifUnread] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  // Un compte peut porter plusieurs rôles à la fois (voir lib/models/User.ts)
  // — bascule activeRole côté serveur (POST /api/account/active-role, seule
  // source de vérité) puis rafraîchit le JWT côté client via `update()` avant
  // de naviguer, sans quoi la page de destination verrait encore l'ancien
  // activeRole tant que le token n'est pas rafraîchi. `router.refresh()` est
  // nécessaire en plus de `push()` : app/(app)/layout.tsx (server component,
  // lit `session.user.activeRole` pour la sidebar) est partagé entre toutes
  // les routes `(app)` et n'est PAS ré-exécuté par une simple navigation
  // client — sans refresh(), la sidebar affichait encore l'ancien rôle après
  // le switch alors que la page de destination, elle, était la bonne.
  async function handleDashboardClick(role: string, href: string) {
    setAccountOpen(false)
    if (role === user.activeRole) {
      router.push(href)
      return
    }
    setSwitchingRole(true)
    try {
      const res = await fetch('/api/account/active-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (res.ok) {
        await update({ activeRole: role })
        router.push(href)
        router.refresh()
      }
    } finally {
      setSwitchingRole(false)
    }
  }

  useEffect(() => {
    if (!messagesOpen || conversations !== null) return
    let cancelled = false
    async function load() {
      const res = await fetch('/api/conversations').then((r) => r.json()).catch(() => null)
      if (cancelled) return
      if (res?.ok) setConversations(res.conversations.slice(0, 5))
      else setConversations([])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [messagesOpen, conversations])

  // Le compteur non-lu se rafraîchit en fond (poll léger, 30s — même esprit
  // que le poll 15s des badges de AgentShell.tsx) indépendamment du dropdown,
  // sans quoi la cloche resterait vide tant qu'on ne l'a pas ouverte une fois.
  useEffect(() => {
    let cancelled = false
    async function poll() {
      const res = await fetch('/api/notifications').then((r) => r.json()).catch(() => null)
      if (cancelled || !res?.ok) return
      setNotifUnread(res.unreadCount)
    }
    poll()
    const id = setInterval(poll, 30000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (!notifOpen) return
    let cancelled = false
    async function load() {
      const res = await fetch('/api/notifications').then((r) => r.json()).catch(() => null)
      if (cancelled) return
      if (res?.ok) {
        setNotifications(res.notifications)
        setNotifUnread(res.unreadCount)
      } else {
        setNotifications([])
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [notifOpen])

  useEffect(() => {
    if (!messagesOpen && !accountOpen && !notifOpen) return
    function handleClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMessagesOpen(false)
        setAccountOpen(false)
        setNotifOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMessagesOpen(false)
        setAccountOpen(false)
        setNotifOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [messagesOpen, accountOpen, notifOpen])

  async function handleNotificationClick(n: NotificationItem) {
    setNotifOpen(false)
    if (!n.read) {
      setNotifUnread((c) => Math.max(0, c - 1))
      fetch(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {})
    }
    if (n.link) router.push(n.link)
  }

  const totalUnread = (conversations ?? []).reduce((sum, c) => sum + c.unreadCount, 0)
  const dashboards = (user.roles ?? [])
    .map((role) => (DASHBOARD_BY_ROLE[role] ? { role, ...DASHBOARD_BY_ROLE[role] } : null))
    .filter((d): d is { role: string; href: string; label: string } => d !== null)

  return (
    <div ref={rootRef} style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
      <style>{`
        @media (max-width: 640px) { .lb-acct-name { display: none !important } }
        /* Sous 480px, le header n'a pas la place pour logo + recherche +
           messages + notifications + avatar + burger sans déborder — ces
           deux raccourcis restent accessibles via /messages (icône déjà
           dans lb-mobile-menu) et la cloche via le dropdown compte, donc
           les masquer ici ne retire aucun accès, juste la place qu'ils
           prenaient dans le header. */
        @media (max-width: 480px) { .lb-acct-quick { display: none !important } }
        .lb-menu-row { transition: background 0.15s ease; }
        .lb-menu-row:hover, .lb-menu-row:focus-visible { background: var(--surface); }
      `}</style>
      <div className="lb-acct-quick" style={{ position: 'relative' }}>
        <Button
          variant="ghost"
          onClick={() => {
            setMessagesOpen((v) => !v)
            setAccountOpen(false)
            setNotifOpen(false)
          }}
          aria-label="Messages"
          aria-expanded={messagesOpen}
          style={{
            width: 36,
            height: 36,
            minWidth: 36,
            minHeight: 36,
            padding: 0,
            borderRadius: 10,
            border: '1px solid var(--border-strong)',
            background: 'var(--surface)',
            color: 'var(--text)',
            position: 'relative',
          }}
        >
          <MessageCircle size={17} />
          {totalUnread > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                borderRadius: 999,
                background: 'var(--pink)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </Button>

        {messagesOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              width: 320,
              maxWidth: '90vw',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              boxShadow: '0 20px 48px rgba(0,0,0,.5)',
              overflow: 'hidden',
              zIndex: 60,
            }}
          >
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 11.5, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Messages
            </div>
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {conversations === null && <div aria-label="Chargement des conversations" style={{ padding: 16, display: 'grid', gap: 9 }}><Skeleton height={12} /><Skeleton width="72%" height={10} /><Skeleton width="86%" height={10} /></div>}
              {conversations !== null && conversations.length === 0 && (
                <p style={{ padding: 16, fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>Aucune conversation pour l&apos;instant.</p>
              )}
              {conversations?.map((c) => {
                const { name, avatar } = conversationDisplay(c, user.id)
                return (
                  <Link
                    key={c.id}
                    href={`/messages?conversationId=${encodeURIComponent(c.id)}`}
                    onClick={() => setMessagesOpen(false)}
                    className="lb-menu-row"
                    style={{ display: 'flex', gap: 10, padding: '10px 14px', textDecoration: 'none', color: 'inherit', alignItems: 'center' }}
                  >
                    <Avatar src={avatar} name={name} size="md" />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: c.unreadCount > 0 ? 800 : 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.lastMessage || '—'}</p>
                    </div>
                    <span style={{ fontSize: 10.5, color: 'var(--text-faint)', flexShrink: 0 }}>{timeAgo(c.lastMessageAt)}</span>
                  </Link>
                )
              })}
            </div>
            <Link
              href="/messages"
              onClick={() => setMessagesOpen(false)}
              style={{ display: 'block', textAlign: 'center', padding: '11px 14px', fontSize: 12.5, fontWeight: 800, color: 'var(--teal)', textDecoration: 'none', borderTop: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '.03em' }}
            >
              Voir tout
            </Link>
          </div>
        )}
      </div>

      <div className="lb-acct-quick" style={{ position: 'relative' }}>
        <Button
          variant="ghost"
          onClick={() => {
            setNotifOpen((v) => !v)
            setMessagesOpen(false)
            setAccountOpen(false)
          }}
          aria-label="Notifications"
          aria-expanded={notifOpen}
          style={{
            width: 36,
            height: 36,
            minWidth: 36,
            minHeight: 36,
            padding: 0,
            borderRadius: 10,
            border: '1px solid var(--border-strong)',
            background: 'var(--surface)',
            color: 'var(--text)',
            position: 'relative',
          }}
        >
          <Bell size={17} />
          {notifUnread > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                borderRadius: 999,
                background: 'var(--pink)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              {notifUnread > 9 ? '9+' : notifUnread}
            </span>
          )}
        </Button>

        {notifOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              width: 320,
              maxWidth: '90vw',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              boxShadow: '0 20px 48px rgba(0,0,0,.5)',
              overflow: 'hidden',
              zIndex: 60,
            }}
          >
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notifications</span>
              {notifUnread > 0 && (
                <button
                  onClick={() => {
                    setNotifUnread(0)
                    setNotifications((list) => list?.map((n) => ({ ...n, read: true })) ?? null)
                    fetch('/api/notifications/read-all', { method: 'POST' }).catch(() => {})
                  }}
                  style={{ minHeight: 44, background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 12.5, cursor: 'pointer', padding: '8px 0 8px 12px' }}
                >
                  Tout marquer lu
                </button>
              )}
            </div>
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {notifications === null && <div aria-label="Chargement des notifications" style={{ padding: 16, display: 'grid', gap: 9 }}><Skeleton height={12} /><Skeleton width="72%" height={10} /><Skeleton width="86%" height={10} /></div>}
              {notifications !== null && notifications.length === 0 && (
                <p style={{ padding: 16, fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>Aucune notification pour l&apos;instant.</p>
              )}
              {notifications?.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className="lb-menu-row"
                  style={{
                    minHeight: 56,
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 14px',
                    background: n.read ? 'transparent' : 'rgba(184, 243, 74,0.06)',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  <p style={{ margin: 0, fontSize: 13, fontWeight: n.read ? 600 : 800, color: 'var(--text)' }}>{n.title}</p>
                  {n.body && (
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.body}</p>
                  )}
                  <span style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{timeAgo(n.createdAt)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <Button
          variant="ghost"
          onClick={() => {
            setAccountOpen((v) => !v)
            setMessagesOpen(false)
            setNotifOpen(false)
          }}
          aria-label={user.name ? `Mon compte — ${user.name}` : 'Mon compte'}
          aria-expanded={accountOpen}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: 'auto',
            height: 36,
            minWidth: 36,
            minHeight: 36,
            padding: '0 10px 0 3px',
            borderRadius: 999,
            border: '1px solid var(--border-strong)',
            background: 'var(--surface)',
            color: 'var(--text)',
          }}
        >
          <Avatar src={user.image} name={user.name || user.email || '?'} size="sm" style={{ width: 30, height: 30 }} />
          {user.name && (
            <span className="lb-acct-name" style={{ fontSize: 13, fontWeight: 700, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name.split(' ')[0]}
            </span>
          )}
          <ChevronDown size={14} strokeWidth={2.4} aria-hidden="true" style={{ flexShrink: 0, opacity: 0.7, transform: accountOpen ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }} />
        </Button>

        {accountOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              width: 220,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              boxShadow: '0 20px 48px rgba(0,0,0,.5)',
              overflow: 'hidden',
              zIndex: 60,
              padding: 6,
            }}
          >
            {user.name && (
              <p style={{ margin: 0, padding: '10px 12px 8px', fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name}
              </p>
            )}
            <MenuLink href="/profile" onClick={() => setAccountOpen(false)} icon={<User size={15} />} label="Mon profil" />
            <MenuLink href="/profile/billets" onClick={() => setAccountOpen(false)} icon={<Ticket size={15} />} label="Mes billets" />
            {dashboards.length > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px' }} />}
            {dashboards.map((d) => (
              <Button
                key={d.role}
                variant="ghost"
                disabled={switchingRole}
                onClick={() => handleDashboardClick(d.role, d.href)}
                aria-label={d.role === user.activeRole ? `${d.label} (actif)` : d.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  color: 'var(--text)',
                  fontSize: 13,
                  fontWeight: 600,
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                }}
              >
                <LayoutDashboard size={15} />
                <span style={{ flex: 1 }}>{d.label}</span>
                {d.role === user.activeRole && <Check size={14} color="var(--teal)" />}
              </Button>
            ))}
            <Button
              variant="ghost"
              onClick={() => signOut({ callbackUrl: '/home' })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                color: 'var(--pink)',
                fontSize: 13,
                fontWeight: 700,
                justifyContent: 'flex-start',
                textAlign: 'left',
              }}
            >
              <LogOut size={15} /> Déconnexion
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function MenuLink({ href, onClick, icon, label }: { href: string; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '10px 12px',
        borderRadius: 8,
        color: 'var(--text)',
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      {icon} {label}
    </Link>
  )
}
