'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BellRing } from 'lucide-react'
import { Button, Card, EmptyState } from '@/app/components/ui'
import { isPushSupported, getPushPermissionState, subscribeToPush } from '@/lib/client/push'

export interface NotificationItemView {
  id: string
  type: string
  title: string
  body: string
  link: string | null
  read: boolean
  createdAt: string
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

// Remplace le dropdown de cloche d'AccountMenu.tsx — même logique
// (marquer lu, tout marquer lu, clic → navigation vers le lien exact,
// activation push), en page pleine plutôt qu'en popover d'en-tête.
export default function NotificationsClient({ initialNotifications }: { initialNotifications: NotificationItemView[] }) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationItemView[]>(initialNotifications)
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported' | null>(null)
  const [pushSubscribing, setPushSubscribing] = useState(false)

  useEffect(() => {
    getPushPermissionState().then((state) => setPushPermission(isPushSupported() ? state : 'unsupported'))
  }, [])

  async function handleEnablePush() {
    setPushSubscribing(true)
    try {
      const result = await subscribeToPush()
      setPushPermission(result.ok ? 'granted' : await getPushPermissionState())
    } finally {
      setPushSubscribing(false)
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  async function markAllRead() {
    setNotifications((list) => list.map((n) => ({ ...n, read: true })))
    await fetch('/api/notifications/read-all', { method: 'POST' }).catch(() => {})
  }

  async function handleClick(n: NotificationItemView) {
    if (!n.read) {
      setNotifications((list) => list.map((item) => (item.id === n.id ? { ...item, read: true } : item)))
      fetch(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {})
    }
    if (n.link) router.push(n.link)
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {unreadCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <Button variant="secondary" onClick={markAllRead} style={{ fontSize: 13 }}>
            Tout marquer lu
          </Button>
        </div>
      )}

      {pushPermission === 'default' && (
        <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Recevoir les alertes urgentes même hors de l&apos;app</span>
          <Button
            variant="secondary"
            onClick={handleEnablePush}
            disabled={pushSubscribing}
            loading={pushSubscribing}
            loadingText="…"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700 }}
          >
            <BellRing size={14} />
            Activer les notifications push
          </Button>
        </Card>
      )}

      {notifications.length === 0 ? (
        <EmptyState title="Aucune notification" description="Tu seras prévenu ici dès qu'il se passe quelque chose te concernant." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notifications.map((n) => (
            <Card
              key={n.id}
              onClick={() => handleClick(n)}
              style={{
                cursor: 'pointer',
                background: n.read ? 'var(--surface)' : 'rgba(184, 243, 74,0.06)',
                border: n.read ? '1px solid var(--border)' : '1px solid rgba(184, 243, 74,0.28)',
                padding: '14px 16px',
              }}
            >
              <p style={{ margin: 0, fontSize: 14, fontWeight: n.read ? 600 : 800, color: 'var(--text)' }}>{n.title}</p>
              {n.body && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>{n.body}</p>}
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{timeAgo(n.createdAt)}</span>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
