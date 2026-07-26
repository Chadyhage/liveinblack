'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { MessageCircle, Ticket, User, LayoutDashboard, LogOut } from 'lucide-react'
import { Avatar, Button } from '@/app/components/ui'

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
  user: { id: string; name?: string | null; email?: string | null; image?: string | null; activeRole?: string | null }
}) {
  const [messagesOpen, setMessagesOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [conversations, setConversations] = useState<ConversationPreview[] | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!messagesOpen && !accountOpen) return
    function handleClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setMessagesOpen(false)
        setAccountOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMessagesOpen(false)
        setAccountOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [messagesOpen, accountOpen])

  const totalUnread = (conversations ?? []).reduce((sum, c) => sum + c.unreadCount, 0)
  const initial = (user.name?.trim()?.[0] || user.email?.trim()?.[0] || '?').toUpperCase()
  const dashboard = user.activeRole ? DASHBOARD_BY_ROLE[user.activeRole] : undefined

  return (
    <div ref={rootRef} style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Button
          variant="ghost"
          onClick={() => {
            setMessagesOpen((v) => !v)
            setAccountOpen(false)
          }}
          aria-label="Messages"
          aria-expanded={messagesOpen}
          style={{
            width: 36,
            height: 36,
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
              {conversations === null && <p style={{ padding: 16, fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>Chargement…</p>}
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

      <div style={{ position: 'relative' }}>
        <Button
          variant="ghost"
          onClick={() => {
            setAccountOpen((v) => !v)
            setMessagesOpen(false)
          }}
          aria-label="Mon compte"
          aria-expanded={accountOpen}
          style={{
            width: 36,
            height: 36,
            padding: 0,
            borderRadius: '50%',
            border: '1px solid var(--border-strong)',
            background: user.image ? 'transparent' : 'var(--teal-solid)',
            color: '#04120e',
            overflow: 'hidden',
            fontSize: 14,
            fontWeight: 800,
          }}
        >
          {user.image ? (
            <Image src={user.image} alt="" width={36} height={36} style={{ objectFit: 'cover' }} />
          ) : (
            initial
          )}
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
            <MenuLink href="/profile?panel=billets" onClick={() => setAccountOpen(false)} icon={<Ticket size={15} />} label="Mes billets" />
            {dashboard && (
              <MenuLink href={dashboard.href} onClick={() => setAccountOpen(false)} icon={<LayoutDashboard size={15} />} label={dashboard.label} />
            )}
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
