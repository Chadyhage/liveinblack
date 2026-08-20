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
    <main className="lb-dashboard-page">
      <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 0.9fr)', gap: 24, alignItems: 'start' }}>
      <header style={{ marginBottom: 24 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#b8f34a', fontSize: 13, fontWeight: 750, letterSpacing: '.08em', textTransform: 'uppercase' }}>
          <BellRing size={17} aria-hidden="true" /> Centre d’alertes
        </span>
        <h1 style={{ margin: 0, color: '#f5f5f7', fontSize: 'clamp(34px,5vw,48px)', fontWeight: 720, letterSpacing: '-.045em' }}>Notifications</h1>
        <p style={{ margin: '10px 0 0', color: 'rgba(245,245,247,.62)', fontSize: 15, lineHeight: 1.55 }}>Retrouve les informations importantes concernant ton compte et ton activité.</p>
      </header>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignSelf: 'start', paddingTop: 6 }}>
        {unreadCount > 0 ? (
          <Button variant="secondary" onClick={markAllRead} style={{ fontSize: 13 }}>
            Tout marquer lu
          </Button>
        ) : null}
      </div>
      </div>

      {pushPermission === 'default' && (
        <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>Recevoir les alertes urgentes même hors de l&apos;app</span>
          <Button
            variant="secondary"
            onClick={handleEnablePush}
            disabled={pushSubscribing}
            loading={pushSubscribing}
            loadingText="…"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700 }}
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
            <Button
              key={n.id}
              variant="ghost"
              fullWidth
              onClick={() => handleClick(n)}
              style={{
                minHeight: 76,
                display: 'block',
                background: n.read ? 'var(--surface)' : 'rgba(184, 243, 74,0.06)',
                border: n.read ? '1px solid var(--border)' : '1px solid rgba(184, 243, 74,0.28)',
                borderRadius: 18,
                padding: '15px 17px',
                textAlign: 'left',
              }}
            >
              <span style={{ display: 'block', fontSize: 15, fontWeight: n.read ? 620 : 760, color: 'var(--text)' }}>{n.title}</span>
              {n.body && <span style={{ display: 'block', marginTop: 5, fontSize: 14, fontWeight: 500, color: 'var(--text-muted)', lineHeight: 1.45 }}>{n.body}</span>}
              <span style={{ display: 'block', marginTop: 7, fontSize: 13, fontWeight: 550, color: 'var(--text-faint)' }}>{timeAgo(n.createdAt)}</span>
            </Button>
          ))}
        </div>
      )}
    </main>
  )
}
