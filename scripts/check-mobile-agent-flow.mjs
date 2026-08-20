const baseUrl = process.env.LIB_WEB_BASE_URL?.replace(/\/$/, '')
const email = process.env.LIB_QA_EMAIL || 'agent@liveinblack.dev'
const password = process.env.LIB_QA_PASSWORD

if (!baseUrl || !password) {
  console.error('LIB_WEB_BASE_URL et LIB_QA_PASSWORD sont requis')
  process.exit(1)
}

function cookiePairs(headers) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean)
  return values.flatMap((value) => value.split(/,(?=[^;,]+=)/)).map((value) => value.trim().split(';')[0])
}

function findCookie(headers, names) {
  return cookiePairs(headers).find((pair) => names.some((name) => pair.startsWith(name + '='))) ?? ''
}

async function authenticate() {
  const csrfResponse = await fetch(baseUrl + '/api/auth/csrf')
  const csrf = await csrfResponse.json()
  const csrfCookie = findCookie(csrfResponse.headers, ['authjs.csrf-token', '__Host-authjs.csrf-token'])
  const response = await fetch(baseUrl + '/api/auth/callback/credentials', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: csrfCookie },
    body: new URLSearchParams({ email, password, csrfToken: csrf.csrfToken, json: 'true' }),
  })
  const sessionCookie = findCookie(response.headers, ['authjs.session-token', '__Secure-authjs.session-token', '__Host-authjs.session-token'])
  if (!sessionCookie) throw new Error('auth_failed')
  return sessionCookie
}

const cookie = await authenticate()
const sessionResponse = await fetch(baseUrl + '/api/auth/session', { headers: { cookie } })
const session = await sessionResponse.json()
if (!session?.user?.roles?.includes('agent')) throw new Error('qa_account_is_not_agent')

const routes = [
  '/api/agent/dashboard',
  '/api/agent/applications',
  '/api/agent/boosts',
  '/api/agent/deletion-requests',
  '/api/agent/events',
  '/api/agent/homepage-config',
  '/api/agent/payments/alerts',
  '/api/agent/payments/payouts',
  '/api/agent/payments/refunds',
  '/api/agent/reports',
  '/api/agent/reviews',
  '/api/agent/users',
]

for (const route of routes) {
  const response = await fetch(baseUrl + route, { headers: { accept: 'application/json', cookie }, signal: AbortSignal.timeout(15_000) })
  const text = await response.text()
  if (response.status < 200 || response.status >= 300) throw new Error(`GET ${route} -> ${response.status}: ${text.slice(0, 200)}`)
  console.log(`PASS GET ${route} -> ${response.status}`)
}

console.log(`Parcours agent mobile lecture : OK (${routes.length}/${routes.length} routes).`)
