import { afterEach, describe, expect, it } from 'vitest'
import { GET } from '../route'

const originalServerKey = process.env.VAPID_PUBLIC_KEY
const originalBundledKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

afterEach(() => {
  if (originalServerKey === undefined) delete process.env.VAPID_PUBLIC_KEY
  else process.env.VAPID_PUBLIC_KEY = originalServerKey
  if (originalBundledKey === undefined) delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  else process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = originalBundledKey
})

describe('GET /api/push/public-key', () => {
  it('renvoie uniquement la clé publique VAPID du serveur', async () => {
    const publicKey = `B${'a'.repeat(86)}`
    process.env.VAPID_PUBLIC_KEY = publicKey
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ publicKey })
    expect(response.headers.get('cache-control')).toContain('max-age=3600')
  })

  it('accepte la clé publique injectée au build comme solution de repli', async () => {
    const publicKey = `B${'c'.repeat(86)}`
    delete process.env.VAPID_PUBLIC_KEY
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = publicKey

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ publicKey })
  })

  it('échoue proprement sans exposer de configuration invalide', async () => {
    process.env.VAPID_PUBLIC_KEY = 'invalide'
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

    const response = await GET()

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'push_not_configured' })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
