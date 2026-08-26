import { expect, test } from 'playwright/test'

const securityHeaderPages = ['/home', '/events', '/login', '/api/health']

test.describe('security headers and API contracts', () => {
  test('CSP allows configured analytics hosts while keeping core hardening directives', async ({ request }) => {
    for (const path of securityHeaderPages) {
      const response = await request.get(path)
      expect(response.ok()).toBeTruthy()

      const csp = response.headers()['content-security-policy']
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain('https://www.googletagmanager.com')
      expect(csp).toContain('https://va.vercel-scripts.com')
      expect(csp).toContain('https://vitals.vercel-insights.com')
    }
  })

  test('health reports app and database readiness without requiring auth', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)

    const payload = await response.json()
    expect(payload).toMatchObject({
      ok: true,
      checks: {
        app: 'ok',
        mongo: 'ok',
      },
    })
    expect(payload).toHaveProperty('timestamp')
  })

  test('public directory APIs respond with normalized payloads', async ({ request }) => {
    const cases = [
      { path: '/api/events', key: 'events' },
      { path: '/api/providers', key: 'providers' },
      { path: '/api/organizers', key: 'organizers' },
      { path: '/api/search?q=', keys: ['events', 'providers', 'organizers'] },
    ] as const

    for (const apiCase of cases) {
      const response = await request.get(apiCase.path)
      expect(response.status()).toBe(200)
      const payload = await response.json()
      expect(payload.ok).toBe(true)
      if ('key' in apiCase) expect(Array.isArray(payload[apiCase.key])).toBe(true)
      else for (const key of apiCase.keys) expect(Array.isArray(payload[key])).toBe(true)
    }
  })

  test('authenticated APIs reject anonymous users with the expected status', async ({ request }) => {
    const unauthorized = ['/api/conversations', '/api/notifications', '/api/tickets/mine']
    for (const path of unauthorized) {
      const response = await request.get(path)
      expect(response.status()).toBe(401)
      await expect(response.json()).resolves.toMatchObject({ error: 'auth_required' })
    }

    const agentResponse = await request.get('/api/agent/dashboard')
    expect(agentResponse.status()).toBe(403)
    await expect(agentResponse.json()).resolves.toMatchObject({ error: 'forbidden' })
  })
})
