import { expect, test, type Page } from 'playwright/test'
import { loginSeededUser } from './helpers/auth'

test.skip(process.env.LIB_RUN_SEEDED_E2E !== '1', 'Seeded E2E requires npm run seed:e2e and LIB_RUN_SEEDED_E2E=1')


async function login(page: Page, email: string) {
  await loginSeededUser(page, email)
}

async function api<T>(page: Page, path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ path, init }) => {
      const response = await fetch(path, init)
      return { status: response.status, body: await response.json() }
    },
    { path, init }
  )
}

test.describe.serial('seeded notifications and push', () => {
  test('client can read notifications and mark them as read', async ({ page }) => {
    await login(page, 'client@liveinblack.dev')

    await page.goto('/notifications', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible()

    const initial = await api<{ ok: boolean; unreadCount: number; notifications: Array<{ id: string; title: string; read: boolean }> }>(
      page,
      '/api/notifications?limit=50'
    )
    expect(initial.status).toBe(200)
    const notification = initial.body.notifications.find((item) => item.title === 'Notification E2E')
    expect(notification).toBeTruthy()
    expect(notification?.read).toBe(false)
    expect(initial.body.unreadCount).toBeGreaterThan(0)

    const marked = await api<{ ok: boolean }>(page, `/api/notifications/${notification!.id}/read`, { method: 'POST' })
    expect(marked).toMatchObject({ status: 200, body: { ok: true } })

    const afterOne = await api<{ ok: boolean; notifications: Array<{ id: string; read: boolean }> }>(page, '/api/notifications?limit=50')
    expect(afterOne.body.notifications.find((item) => item.id === notification!.id)?.read).toBe(true)

    const markedAll = await api<{ ok: boolean }>(page, '/api/notifications/read-all', { method: 'POST' })
    expect(markedAll).toMatchObject({ status: 200, body: { ok: true } })

    const afterAll = await api<{ ok: boolean; unreadCount: number }>(page, '/api/notifications?limit=50')
    expect(afterAll).toMatchObject({ status: 200, body: { ok: true, unreadCount: 0 } })
  })

  test('client can register and remove a web push subscription', async ({ page }) => {
    await login(page, 'client@liveinblack.dev')

    const key = await api<{ publicKey: string }>(page, '/api/push/public-key')
    expect(key.status).toBe(200)
    expect(key.body.publicKey.length).toBeGreaterThanOrEqual(80)

    const endpoint = `https://push.example.test/e2e/${Date.now()}`
    const subscribed = await api<{ ok: boolean }>(page, '/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, keys: { p256dh: 'p256dh-e2e-key', auth: 'auth-e2e-secret' } }),
    })
    expect(subscribed).toMatchObject({ status: 200, body: { ok: true } })

    const unsubscribed = await api<{ ok: boolean }>(page, '/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    })
    expect(unsubscribed).toMatchObject({ status: 200, body: { ok: true } })
  })
})
