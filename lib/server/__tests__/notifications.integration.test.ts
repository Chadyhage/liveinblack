// Tests d'INTÉGRATION (vraie base MongoDB) pour le système de notifications
// in-app (voir lib/models/Notification.ts / lib/server/notifications.ts) —
// couvre create/list/markRead/markAllRead, le plafond 50/utilisateur, et
// l'anti-spam par conversation de upsertMessageNotification.
import { describe, it, expect } from 'vitest'
import { createNotification, upsertMessageNotification, listNotifications, unreadCount, markRead, markAllRead } from '../notifications'
import Notification from '../../models/Notification'
import User from '../../models/User'
import { RUN_INTEGRATION, seedUser as seedUserDocument, setupMongoIntegrationSuite } from './integrationTestHelpers'

const describeIntegration = describe.skipIf(!RUN_INTEGRATION)

setupMongoIntegrationSuite([Notification, User])

async function seedUser() {
  const user = await seedUserDocument()
  return String(user._id)
}

describeIntegration('notifications', () => {
  it('crée puis liste une notification, non lue par défaut', async () => {
    const userId = await seedUser()
    await createNotification({ userId, type: 'application_status', title: 'Dossier approuvé', link: '/my-application' })

    const list = await listNotifications(userId)
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('Dossier approuvé')
    expect(list[0].read).toBe(false)
    expect(await unreadCount(userId)).toBe(1)
  })

  it('markRead marque une seule notification, markAllRead les marque toutes', async () => {
    const userId = await seedUser()
    await createNotification({ userId, type: 'application_status', title: 'A' })
    await createNotification({ userId, type: 'application_status', title: 'B' })
    const [first] = await listNotifications(userId)

    await markRead(userId, first.id)
    expect(await unreadCount(userId)).toBe(1)

    await markAllRead(userId)
    expect(await unreadCount(userId)).toBe(0)
  })

  it("markRead ne touche pas une notification d'un autre utilisateur", async () => {
    const userId = await seedUser()
    const otherId = await seedUser()
    await createNotification({ userId, type: 'application_status', title: 'A' })
    const [notif] = await listNotifications(userId)

    await markRead(otherId, notif.id)
    expect(await unreadCount(userId)).toBe(1)
  })

  it('plafonne à 50 notifications par utilisateur, purge les plus anciennes', async () => {
    const userId = await seedUser()
    for (let i = 0; i < 55; i++) {
      await createNotification({ userId, type: 'application_status', title: `N${i}` })
    }
    const total = await Notification.countDocuments({ userId })
    expect(total).toBe(50)
    // Les plus RÉCENTES survivent : N54 (la toute dernière créée) doit rester.
    const list = await listNotifications(userId, { limit: 50 })
    expect(list[0].title).toBe('N54')
    expect(list.some((n) => n.title === 'N0')).toBe(false)
  })

  it('upsertMessageNotification : une seule notification par conversation, rafraîchie à chaque appel', async () => {
    const userId = await seedUser()
    await upsertMessageNotification(userId, 'conv-1', 'Salut !', '/messages?conversationId=conv-1')
    await upsertMessageNotification(userId, 'conv-1', 'Deuxième message', '/messages?conversationId=conv-1')

    const total = await Notification.countDocuments({ userId, type: 'new_message' })
    expect(total).toBe(1)
    const [notif] = await listNotifications(userId)
    expect(notif.body).toBe('Deuxième message')
  })

  it('upsertMessageNotification : conversations différentes → notifications distinctes', async () => {
    const userId = await seedUser()
    await upsertMessageNotification(userId, 'conv-1', 'A', '/messages?conversationId=conv-1')
    await upsertMessageNotification(userId, 'conv-2', 'B', '/messages?conversationId=conv-2')

    const total = await Notification.countDocuments({ userId, type: 'new_message' })
    expect(total).toBe(2)
  })

  it('un message déjà lu redevient non-lu si un nouveau message arrive dans la même conversation', async () => {
    const userId = await seedUser()
    await upsertMessageNotification(userId, 'conv-1', 'A', '/messages?conversationId=conv-1')
    const [notif] = await listNotifications(userId)
    await markRead(userId, notif.id)
    expect(await unreadCount(userId)).toBe(0)

    await upsertMessageNotification(userId, 'conv-1', 'B', '/messages?conversationId=conv-1')
    expect(await unreadCount(userId)).toBe(1)
  })
})
