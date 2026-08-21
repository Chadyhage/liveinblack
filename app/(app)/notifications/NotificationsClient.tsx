'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BellRing } from 'lucide-react'
import { Button, EmptyState } from '@/app/components/ui'
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

  const showPushCta = pushPermission === 'default'
  const readCount = notifications.length - unreadCount

  const shellStyle = `
    .lb-notifications-page {
      display: grid;
      grid-template-columns: minmax(0, minmax(780px, 1.55fr)) minmax(320px, 0.7fr);
      gap: 12px;
      width: 100%;
      min-height: 100%;
      min-width: 0;
      align-content: start;
      align-items: start;
    }

    .lb-notifications-actions {
      display: flex;
      flex: 0 1 auto;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      flex-wrap: wrap;
    }

    .lb-notifications-list {
      width: 100%;
      display: grid;
      gap: 10px;
      min-width: 0;
    }

    .lb-notifications-main {
      width: 100%;
      display: grid;
      gap: 14px;
      min-width: 0;
      align-content: start;
    }

    .lb-notifications-header {
      min-width: 0;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 18px;
      padding: 4px 0 6px;
      flex-wrap: wrap;
    }

    .lb-notifications-copy {
      min-width: 0;
      flex: 1 1 820px;
    }

    .lb-notifications-side {
      width: 100%;
      min-width: 0;
      display: grid;
      gap: 12px;
      align-content: start;
      position: sticky;
      top: 10px;
    }

    .lb-notifications-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .lb-notifications-stat,
    .lb-notifications-push {
      border-radius: 16px;
      padding: 18px 18px 16px;
    }

    .lb-notifications-stat {
      border: 1px solid rgba(255,255,255,.1);
      background: rgba(24,24,28,.72);
    }

    .lb-notifications-push {
      border: 1px solid rgba(184,243,74,.2);
      background: rgba(184,243,74,.05);
    }

    @media (max-width: 1120px) {
      .lb-notifications-page {
        grid-template-columns: minmax(0, 1fr) !important;
      }

      .lb-notifications-page > aside {
        position: static !important;
      }

      .lb-notifications-side {
        position: static !important;
      }
    }

    @media (max-width: 860px) {
      .lb-notifications-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
      }
    }

    @media (max-width: 720px) {
      .lb-notifications-grid {
        grid-template-columns: minmax(0, 1fr) !important;
      }
    }

    @media (max-width: 760px) {
      .lb-notifications-page {
        gap: 14px !important;
      }

      .lb-notifications-header { align-items: stretch !important; }

      .lb-notifications-actions {
        width: 100%;
        justify-content: stretch !important;
      }

      .lb-notifications-actions > * {
        flex: 1 1 100%;
        min-width: 0 !important;
      }
    }
  `

  return (
    <main className="lb-dashboard-page lb-notifications-page">
      <style>{shellStyle}</style>
      <section className="lb-notifications-main">
        <header className="lb-notifications-header">
          <div className="lb-notifications-copy">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#b8f34a', fontSize: 13, fontWeight: 750, letterSpacing: '.08em', textTransform: 'uppercase' }}>
              <BellRing size={17} aria-hidden="true" /> Centre d’alertes
            </span>
            <h1 style={{ margin: 0, color: '#f5f5f7', fontSize: 'clamp(34px,4.4vw,56px)', fontWeight: 720, letterSpacing: '-.045em' }}>Notifications</h1>
            <p style={{ margin: '10px 0 0', maxWidth: 'none', color: 'rgba(245,245,247,.62)', fontSize: 15, lineHeight: 1.55 }}>Retrouve les informations importantes concernant ton compte et ton activité.</p>
          </div>

          <div className="lb-notifications-actions">
            {showPushCta ? (
              <Button
                variant="ghost"
                onClick={handleEnablePush}
                disabled={pushSubscribing}
                loading={pushSubscribing}
                loadingText="…"
                style={{ minWidth: 220 }}
              >
                Activer les notifications push
              </Button>
            ) : null}
            {unreadCount > 0 ? (
              <Button variant="secondary" onClick={markAllRead} style={{ minWidth: 190 }}>
                Tout marquer lu
              </Button>
            ) : null}
          </div>
        </header>

        <div className="lb-notifications-list">
          {notifications.length === 0 ? (
            <EmptyState title="Aucune notification" description="Tu seras prévenu ici dès qu'il se passe quelque chose te concernant." />
          ) : (
            notifications.map((n) => (
              <Button
                key={n.id}
                variant="ghost"
                fullWidth
                onClick={() => handleClick(n)}
                style={{
                  minHeight: 116,
                  display: 'grid',
                  alignContent: 'center',
                  width: '100%',
                  background: n.read ? 'var(--surface)' : 'rgba(184, 243, 74,0.06)',
                  border: n.read ? '1px solid var(--border)' : '1px solid rgba(184, 243, 74,0.28)',
                  borderRadius: 16,
                  padding: '22px 24px',
                  textAlign: 'left',
                }}
              >
                <span style={{ display: 'block', fontSize: 15, fontWeight: n.read ? 620 : 760, color: 'var(--text)' }}>{n.title}</span>
                {n.body ? <span style={{ display: 'block', marginTop: 5, fontSize: 14, fontWeight: 500, color: 'var(--text-muted)', lineHeight: 1.45 }}>{n.body}</span> : null}
                <span style={{ display: 'block', marginTop: 7, fontSize: 13, fontWeight: 550, color: 'var(--text-faint)' }}>{timeAgo(n.createdAt)}</span>
              </Button>
            ))
          )}
        </div>
      </section>

      <aside
        className="lb-notifications-side"
      >
        <div className="lb-notifications-grid">
          <div className="lb-notifications-stat">
            <span style={{ display: 'block', color: '#f5f5f7', fontSize: 28, fontWeight: 760 }}>{unreadCount}</span>
            <span style={{ display: 'block', marginTop: 4, color: 'rgba(245,245,247,.6)', fontSize: 12 }}>Non lues</span>
          </div>
          <div className="lb-notifications-stat">
            <span style={{ display: 'block', color: '#f5f5f7', fontSize: 28, fontWeight: 760 }}>{readCount}</span>
            <span style={{ display: 'block', marginTop: 4, color: 'rgba(245,245,247,.6)', fontSize: 12 }}>Lues</span>
          </div>
          <div className="lb-notifications-stat">
            <span style={{ display: 'block', color: '#f5f5f7', fontSize: 28, fontWeight: 760 }}>{notifications.length}</span>
            <span style={{ display: 'block', marginTop: 4, color: 'rgba(245,245,247,.6)', fontSize: 12 }}>Total</span>
          </div>
        </div>

        {showPushCta ? (
          <div className="lb-notifications-push">
            <p style={{ margin: 0, color: '#f5f5f7', fontSize: 15, fontWeight: 700 }}>Alertes instantanées</p>
            <p style={{ margin: '8px 0 0', color: 'rgba(245,245,247,.64)', fontSize: 13.5, lineHeight: 1.5 }}>Active les notifications push pour recevoir les nouveautés importantes sans repasser par la page.</p>
            <Button
              variant="secondary"
              onClick={handleEnablePush}
              disabled={pushSubscribing}
              loading={pushSubscribing}
              loadingText="…"
              fullWidth
              style={{ marginTop: 14 }}
            >
              Activer les notifications push
            </Button>
          </div>
        ) : null}
      </aside>
    </main>
  )
}
