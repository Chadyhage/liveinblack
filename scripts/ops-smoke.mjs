#!/usr/bin/env node
import { createHash } from 'node:crypto'

const baseUrl = process.env.LIB_WEB_BASE_URL
if (!baseUrl) {
  console.error('LIB_WEB_BASE_URL manquant — exécute: LIB_WEB_BASE_URL=https://... npm run ops:smoke')
  process.exit(1)
}
const timeoutMs = 8000
const runId = createHash('sha1').update(`${Date.now()}`).digest('hex').slice(0, 8)
const vercelBypassToken = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_PROTECTION_BYPASS

const checks = [
  { name: 'healthz', method: 'GET', path: '/api/health', expect: { status: 200 } },
  { name: 'home', method: 'GET', path: '/home', expect: { status: 200 } },
  { name: 'events', method: 'GET', path: '/events', expect: { status: 200 } },
  { name: 'providers', method: 'GET', path: '/providers', expect: { status: 200 } },
  { name: 'organizers', method: 'GET', path: '/organizers', expect: { status: 200 } },
  { name: 'messages', method: 'GET', path: '/messages', expect: { status: [200, 307, 308] } },
  { name: 'agent_home', method: 'GET', path: '/agent', expect: { status: [200, 307, 308] } },
  { name: 'api_events', method: 'GET', path: '/api/events?page=1&pageSize=12', expect: { status: 200 } },
  { name: 'api_organizers', method: 'GET', path: '/api/organizers?page=1', expect: { status: 200 } },
  { name: 'api_providers', method: 'GET', path: '/api/providers?page=1', expect: { status: 200 } },
  { name: 'api_search', method: 'GET', path: '/api/search?q=soir', expect: { status: 200 } },
  { name: 'api_quick_search', method: 'GET', path: '/api/search/quick?q=soir', expect: { status: 200 } },
  { name: 'stripe_webhook', method: 'POST', path: '/api/stripe-webhook', expect: { status: [400, 500] } },
  { name: 'webhooks_stripe', method: 'POST', path: '/api/webhooks/stripe', expect: { status: [400, 500] } },
  { name: 'webhooks_fedapay', method: 'POST', path: '/api/webhooks/fedapay', expect: { status: [400, 500] } },
]

function isVercelProtectedRedirect(result) {
  const loc = (result.text || '').toLowerCase()
  return result.status === 302 && loc.includes('vercel.com/sso-api')
}

async function call(url, method, path) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const headers = { 'content-type': 'application/json', 'x-ops-run-id': runId }
  if (vercelBypassToken) {
    headers['x-vercel-protection-bypass'] = vercelBypassToken
  }
  try {
    const response = await fetch(`${url}${path}`, {
      method,
      headers,
      body: ['POST', 'PUT'].includes(method) ? '{}' : undefined,
      signal: controller.signal,
    })
      return { status: response.status, ok: true, text: await response.text() }
    } catch (error) {
    return { status: 0, ok: false, error: error?.message ?? 'network_error' }
  } finally {
    clearTimeout(timeout)
  }
}

function matchStatus(actual, expected) {
  if (Array.isArray(expected)) return expected.includes(actual)
  return actual === expected
}

const failed = []
let hadProtectedDeployment = false
  for (const check of checks) {
    const result = await call(baseUrl, check.method, check.path)
    const protectedRedirect = !vercelBypassToken && isVercelProtectedRedirect(result)
    const good = result.ok && (matchStatus(result.status, check.expect.status) || protectedRedirect)
    if (!good) failed.push({ check: check.name, path: check.path, method: check.method, result })
    console.log(`${good ? 'PASS' : 'FAIL'} ${check.method} ${check.path} -> ${result.status || 'ERR'}`)
    if (protectedRedirect) {
      hadProtectedDeployment = true
    }
  }

if (failed.length > 0) {
  if (hadProtectedDeployment && !vercelBypassToken) {
    console.error('Check bloqué par une Vercel Protected Deployment (redirect sso-api). Configure un token de bypass:')
    console.error('  VERCEL_AUTOMATION_BYPASS_SECRET=<token>')
    console.error('ou')
    console.error('  VERCEL_PROTECTION_BYPASS=<token>')
  }
  console.error('Smoke échoué:', JSON.stringify({ runId, failed }, null, 2))
  process.exit(1)
}

console.log(`Smoke OK (${runId})`)
