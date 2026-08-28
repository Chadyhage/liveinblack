'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowUpRight,
  BellRing,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  CreditCard,
  FileCheck2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { Button, EmptyState } from '@/app/components/ui'
import { isPushSupported, getPushPermissionState, subscribeToPush } from '@/lib/client/push'
import styles from './NotificationsClient.module.css'

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

function notificationIcon(type: string): ReactNode {
  const normalizedType = type.toLowerCase()

  if (normalizedType.includes('account') || normalizedType.includes('security') || normalizedType.includes('login')) {
    return <ShieldCheck size={19} aria-hidden="true" />
  }
  if (normalizedType.includes('billing') || normalizedType.includes('payment') || normalizedType.includes('finance')) {
    return <CreditCard size={19} aria-hidden="true" />
  }
  if (normalizedType.includes('event')) return <CalendarDays size={19} aria-hidden="true" />
  if (normalizedType.includes('application') || normalizedType.includes('candidate') || normalizedType.includes('user')) {
    return <UsersRound size={19} aria-hidden="true" />
  }
  if (normalizedType.includes('file') || normalizedType.includes('verification')) {
    return <FileCheck2 size={19} aria-hidden="true" />
  }
  if (normalizedType.includes('message')) return <MessageCircle size={19} aria-hidden="true" />
  return <Sparkles size={19} aria-hidden="true" />
}

function notificationLabel(type: string): string {
  const normalizedType = type.toLowerCase()

  if (normalizedType.includes('account') || normalizedType.includes('security') || normalizedType.includes('login')) {
    return 'Sécurité'
  }
  if (normalizedType.includes('billing') || normalizedType.includes('payment') || normalizedType.includes('finance')) {
    return 'Facturation'
  }
  if (normalizedType.includes('event')) return 'Événement'
  if (normalizedType.includes('application') || normalizedType.includes('candidate') || normalizedType.includes('user')) {
    return 'Candidature'
  }
  if (normalizedType.includes('file') || normalizedType.includes('verification')) {
    return 'Vérification'
  }
  if (normalizedType.includes('message')) return 'Message'
  return 'Info'
}

export default function NotificationsClient({ initialNotifications }: { initialNotifications: NotificationItemView[] }) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationItemView[]>(initialNotifications)
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported' | null>(null)
  const [pushSubscribing, setPushSubscribing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

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

  const unreadCount = notifications.filter((notification) => !notification.read).length
  const readCount = notifications.length - unreadCount
  const showPushCta = pushPermission === 'default'

  async function markAllRead() {
    setNotifications((list) => list.map((notification) => ({ ...notification, read: true })))
    await fetch('/api/notifications/read-all', { method: 'POST' }).catch(() => {})
  }

  async function handleClick(notification: NotificationItemView) {
    if (!notification.read) {
      setNotifications((list) => list.map((item) => (
        item.id === notification.id ? { ...item, read: true } : item
      )))
      fetch(`/api/notifications/${notification.id}/read`, { method: 'POST' }).catch(() => {})
    }
    setExpandedId((current) => current === notification.id ? null : notification.id)
  }

  function openNotification(notification: NotificationItemView) {
    if (notification.link) router.push(notification.link)
  }

  return (
    <main className={`lb-dashboard-page lb-notifications-page ${styles.page}`}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div className={styles.heading}>
            <span className={styles.headingIcon} aria-hidden="true"><BellRing size={20} /></span>
            <div>
              <h1>Notifications</h1>
              <p>Les informations importantes liées à ton compte et à ton activité.</p>
            </div>
          </div>

          <div className={styles.headerAside}>
            {unreadCount > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<CheckCheck size={17} aria-hidden="true" />}
                onClick={markAllRead}
                style={{ minWidth: 156 }}
              >
                Tout marquer lu
              </Button>
            ) : null}

            <section className={styles.statsGrid} aria-label="Résumé des notifications">
              <article className={styles.statCard}>
                <span className={styles.statLabel}>Non lues</span>
                <strong className={styles.statValue}>{unreadCount}</strong>
                <span className={styles.statHint}>
                  {unreadCount > 0 ? `${unreadCount} notification${unreadCount > 1 ? 's' : ''} à traiter` : 'Tout est à jour'}
                </span>
              </article>
              <article className={styles.statCard}>
                <span className={styles.statLabel}>Lues</span>
                <strong className={styles.statValue}>{readCount}</strong>
                <span className={styles.statHint}>Déjà consultées dans ton espace</span>
              </article>
              <article className={styles.statCard}>
                <span className={styles.statLabel}>Total</span>
                <strong className={styles.statValue}>{notifications.length}</strong>
                <span className={styles.statHint}>Dernières alertes reçues</span>
              </article>
            </section>
          </div>
        </header>

        {showPushCta ? (
          <section className={styles.pushCard} aria-label="Notifications push">
            <span className={styles.pushIcon} aria-hidden="true"><BellRing size={18} /></span>
            <div className={styles.pushCopy}>
              <strong>Reçois les alertes importantes immédiatement</strong>
              <span>Même lorsque cette page n’est pas ouverte.</span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleEnablePush}
              disabled={pushSubscribing}
              loading={pushSubscribing}
              loadingText="Activation…"
            >
              Activer les alertes
            </Button>
          </section>
        ) : null}

        <section className={styles.inbox} aria-labelledby="notifications-list-title">
          <div className={styles.inboxHeader}>
            <div>
              <h2 id="notifications-list-title">Activité récente</h2>
              <p>Les alertes les plus récentes apparaissent en premier.</p>
            </div>
            <span className={styles.totalBadge}>{notifications.length} au total</span>
          </div>

          {notifications.length === 0 ? (
            <div className={styles.emptyState}>
              <EmptyState title="Aucune notification" description="Tu seras prévenu ici dès qu'il se passe quelque chose te concernant." />
            </div>
          ) : (
            <div className={styles.list}>
              {notifications.map((notification) => {
                const expanded = expandedId === notification.id
                return (
                  <article key={notification.id} className={`${styles.notificationShell} ${notification.read ? '' : styles.unread}`}>
                    <Button
                      variant="ghost"
                      fullWidth
                      onClick={() => handleClick(notification)}
                      aria-expanded={expanded}
                      aria-label={`${notification.read ? '' : 'Non lue : '}${notification.title}`}
                      className={styles.notification}
                    >
                      <span className={styles.notificationIcon}>{notificationIcon(notification.type)}</span>
                      <span className={styles.notificationContent}>
                        <span className={styles.notificationTopRow}>
                          <span className={styles.notificationBadge}>{notificationLabel(notification.type)}</span>
                          <span className={styles.notificationMeta}><time dateTime={notification.createdAt}>{timeAgo(notification.createdAt)}</time></span>
                        </span>
                        <span className={styles.notificationTitle}>
                          {!notification.read ? <span className={styles.unreadDot} aria-hidden="true" /> : null}
                          {notification.title}
                        </span>
                      </span>
                      <ChevronDown className={styles.expandIcon} size={18} aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }} />
                    </Button>
                    {expanded ? (
                      <div className={styles.notificationDetail}>
                        {notification.body ? <p>{notification.body}</p> : <p>Aucun détail supplémentaire.</p>}
                        {notification.link ? (
                          <Button variant="secondary" size="sm" icon={<ArrowUpRight size={16} aria-hidden="true" />} onClick={() => openNotification(notification)}>
                            Ouvrir
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
