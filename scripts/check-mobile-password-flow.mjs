const baseUrl = process.env.LIB_WEB_BASE_URL?.replace(/\/$/, '')
const email = process.env.LIB_QA_EMAIL
const oldPassword = process.env.LIB_QA_PASSWORD
const changedPassword = process.env.LIB_QA_CHANGED_PASSWORD
const resetPassword = process.env.LIB_QA_RESET_PASSWORD
const resetToken = process.env.LIB_QA_RESET_TOKEN

if (!baseUrl || !email || !oldPassword || !changedPassword || !resetPassword) {
  console.error('Configuration QA du cycle mot de passe incomplète')
  process.exit(1)
}

function cookiePairs(headers) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean)
  return values.flatMap((value) => value.split(/,(?=[^;,]+=)/)).map((value) => value.trim().split(';')[0])
}

function findCookie(headers, names) {
  return cookiePairs(headers).find((pair) => names.some((name) => pair.startsWith(name + '='))) ?? ''
}

async function authenticate(password) {
  const csrfResponse = await fetch(baseUrl + '/api/auth/csrf')
  const csrf = await csrfResponse.json()
  const csrfCookie = findCookie(csrfResponse.headers, ['authjs.csrf-token', '__Host-authjs.csrf-token'])
  const response = await fetch(baseUrl + '/api/auth/callback/credentials', {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: csrfCookie },
    body: new URLSearchParams({ email, password, csrfToken: csrf.csrfToken, json: 'true' }),
  })
  return findCookie(response.headers, ['authjs.session-token', '__Secure-authjs.session-token', '__Host-authjs.session-token'])
}

async function post(path, body, cookie, expected = 200) {
  const response = await fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  const text = await response.text()
  if (response.status !== expected) throw new Error(`POST ${path} -> ${response.status}: ${text.slice(0, 200)}`)
  return text
}

if (!resetToken) {
  const oldCookie = await authenticate(oldPassword)
  if (!oldCookie) throw new Error('initial_login_failed')
  await post('/api/profil/mot-de-passe', { currentPassword: oldPassword, newPassword: changedPassword }, oldCookie)
  if (await authenticate(oldPassword)) throw new Error('old_password_still_accepted')
  if (!(await authenticate(changedPassword))) throw new Error('changed_password_rejected')
  await post('/api/auth/request-password-reset', { email }, null)
  console.log('Cycle mot de passe phase 1 : OK (ancien refusé, nouveau accepté, e-mail de reset demandé).')
} else {
  await post('/api/auth/reset-password', { email, token: resetToken, password: resetPassword }, null)
  if (await authenticate(changedPassword)) throw new Error('pre_reset_password_still_accepted')
  const resetCookie = await authenticate(resetPassword)
  if (!resetCookie) throw new Error('reset_password_rejected')
  await post('/api/profil/supprimer-compte', { currentPassword: resetPassword }, resetCookie)
  if (await authenticate(resetPassword)) throw new Error('deleted_account_still_authenticates')
  console.log('Cycle mot de passe phase 2 : OK (reset accepté, ancien refusé, compte QA supprimé).')
}
