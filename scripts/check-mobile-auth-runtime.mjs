const baseUrl = process.env.LIB_WEB_BASE_URL?.replace(/\/$/, '')
const email = process.env.LIB_QA_EMAIL
const password = process.env.LIB_QA_PASSWORD
const expectedRole = process.env.LIB_QA_ROLE || 'client'

if (!baseUrl || !email || !password) {
  console.error('LIB_WEB_BASE_URL, LIB_QA_EMAIL et LIB_QA_PASSWORD sont requis')
  process.exit(1)
}

function cookiePairs(headers) {
  const values = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers.get('set-cookie')].filter(Boolean)
  return values.flatMap((value) => value.split(/,(?=[^;,]+=)/)).map((value) => value.trim().split(';')[0])
}

function findCookie(headers, names) {
  return cookiePairs(headers).find((pair) => names.some((name) => pair.startsWith(name + '='))) ?? ''
}

async function authenticate() {
  const csrfResponse = await fetch(baseUrl + '/api/auth/csrf', { redirect: 'manual' })
  if (!csrfResponse.ok) throw new Error(`csrf_http_${csrfResponse.status}`)
  const csrf = await csrfResponse.json()
  const csrfCookie = findCookie(csrfResponse.headers, ['authjs.csrf-token', '__Host-authjs.csrf-token'])
  if (!csrf.csrfToken || !csrfCookie) throw new Error('csrf_incomplete')

  const response = await fetch(baseUrl + '/api/auth/callback/credentials', {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: csrfCookie,
    },
    body: new URLSearchParams({ email, password, csrfToken: csrf.csrfToken, json: 'true' }),
  })
  const sessionCookie = findCookie(response.headers, [
    'authjs.session-token',
    '__Secure-authjs.session-token',
    '__Host-authjs.session-token',
  ])
  if (!sessionCookie) throw new Error('invalid_credentials_or_missing_session_cookie')
  return sessionCookie
}

const commonChecks = [
  '/api/auth/session',
  '/api/profil',
  '/api/notifications?limit=10',
  '/api/conversations',
  '/api/friends',
  '/api/friends/requests',
  '/api/messages/starred',
  '/api/my-staffed-events',
  '/api/organizers/followed',
  '/api/profil/evenements-interesses',
  '/api/profile/recommendation-inputs',
  '/api/seat-holds',
  '/api/tickets/invitations',
  '/api/tickets/invitations/outgoing',
  '/api/tickets/mine',
  '/api/users/blocked',
  '/api/users/report',
]

const roleChecks = {
  client: [
    '/api/applications/organisateur',
    '/api/applications/prestataire',
  ],
  organisateur: [
    '/api/organizer-events',
    '/api/organizers/me',
    '/api/organizers/me/payout-momos',
    '/api/organizers/me/payouts',
  ],
  prestataire: [
    '/api/providers/me',
    '/api/providers/me/reviews',
    '/api/subscriptions',
  ],
}

let cookie
try {
  cookie = await authenticate()
} catch (error) {
  console.error(`Authentification mobile échouée : ${error instanceof Error ? error.message : 'unknown'}`)
  process.exit(1)
}

const checks = [...commonChecks, ...(roleChecks[expectedRole] ?? [])]
const results = []
for (const path of checks) {
  try {
    const response = await fetch(baseUrl + path, {
      headers: { accept: 'application/json', cookie },
      redirect: 'manual',
      signal: AbortSignal.timeout(12_000),
    })
    const fullBody = await response.text()
    results.push({ path, status: response.status, body: fullBody.slice(0, 240), fullBody })
  } catch (error) {
    results.push({ path, status: 0, body: error instanceof Error ? error.message : 'network_error' })
  }
}

const session = results.find((result) => result.path === '/api/auth/session')
let actualRole = null
try {
  actualRole = JSON.parse(session?.fullBody || '{}')?.user?.activeRole ?? null
} catch {}

const failures = results.filter((result) => result.status < 200 || result.status >= 300)
if (actualRole !== expectedRole) failures.unshift({ path: '/api/auth/session#activeRole', status: 0, body: `attendu=${expectedRole}, reçu=${actualRole}` })

let deletion = null
if (process.env.LIB_QA_DELETE === 'true') {
  try {
    const response = await fetch(baseUrl + '/api/profil/supprimer-compte', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ currentPassword: password }),
      signal: AbortSignal.timeout(12_000),
    })
    deletion = { status: response.status, body: (await response.text()).slice(0, 240) }
  } catch (error) {
    deletion = { status: 0, body: error instanceof Error ? error.message : 'network_error' }
  }
  if (deletion.status < 200 || deletion.status >= 300) {
    failures.push({ path: '/api/profil/supprimer-compte', ...deletion })
  }
}

console.log(`Session mobile ${expectedRole} : ${failures.length === 0 ? 'OK' : 'ÉCHEC'} (${results.length - failures.filter((item) => !item.path.includes('#')).length}/${results.length} lectures privées).`)
for (const result of results) console.log(`[${result.status || 'ERR'}] GET ${result.path}`)
if (deletion) console.log(`[${deletion.status || 'ERR'}] DELETE QA via POST /api/profil/supprimer-compte`)
for (const failure of failures) console.error(`Échec ${failure.path} — ${failure.status || 'ERR'} — ${failure.body}`)

if (failures.length > 0) process.exitCode = 1
