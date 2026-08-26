import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import NotificationsClient, { type NotificationItemView } from '../NotificationsClient'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

const BASE_NOTIFICATIONS: NotificationItemView[] = [
  {
    id: 'notif-1',
    type: 'account',
    title: 'Nouvelle connexion à ton compte',
    body: 'Connexion détectée sur un nouvel appareil.',
    link: '/profile',
    read: false,
    createdAt: '2026-08-20T08:50:13.000Z',
  },
  {
    id: 'notif-2',
    type: 'billing',
    title: 'Paiement validé',
    body: 'Ton règlement a bien été enregistré.',
    link: '/profile/parametres',
    read: true,
    createdAt: '2026-08-19T10:27:58.000Z',
  },
]

describe('NotificationsClient', () => {
  it('rend la structure desktop et les compteurs à partir des notifications initiales', () => {
    const html = renderToStaticMarkup(<NotificationsClient initialNotifications={BASE_NOTIFICATIONS} />)

    expect(html).toContain('lb-notifications-page')
    expect(html).toContain('Notifications')
    expect(html).toContain('Les informations importantes liées à ton compte et à ton activité.')
    expect(html).toContain('Tout marquer lu')
    expect(html.toLowerCase()).toContain('non lue')
    expect(html).toContain('lue')
    expect(html).toContain('au total')
    expect(html).toContain('Activité récente')
    expect(html).toContain('>1<')
    expect(html).toContain('>2<')
  })

  it('affiche l’état vide quand aucune notification n’est disponible', () => {
    const html = renderToStaticMarkup(<NotificationsClient initialNotifications={[]} />)

    expect(html).toContain('Aucune notification')
    expect(html).not.toContain('Tout marquer lu')
  })
})
