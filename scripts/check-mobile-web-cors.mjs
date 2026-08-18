const baseUrl = process.env.LIB_WEB_BASE_URL?.replace(/\/$/, '')
const origins = (process.env.LIB_MOBILE_WEB_ORIGINS || process.env.LIB_MOBILE_WEB_ORIGIN || 'http://localhost:8095,http://127.0.0.1:8095')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (!baseUrl) {
  console.error('LIB_WEB_BASE_URL manquant')
  process.exit(1)
}

function expectHeader(response, key, expected) {
  const actual = response.headers.get(key)
  if (actual !== expected) {
    return `${key}: attendu ${expected}, reçu ${actual || 'absent'}`
  }
  return null
}

async function readBody(response) {
  try {
    return (await response.text()).slice(0, 240)
  } catch {
    return ''
  }
}

async function checkPreflight(origin, path) {
  const response = await fetch(baseUrl + path, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type',
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(12_000),
  })
  const failures = [
    response.status === 204 ? null : `statut attendu 204, reçu ${response.status}`,
    expectHeader(response, 'access-control-allow-origin', origin),
    expectHeader(response, 'access-control-allow-credentials', 'true'),
  ].filter(Boolean)
  return { origin, kind: 'preflight', path, status: response.status, failures, body: await readBody(response) }
}

async function checkGet(origin, path) {
  const response = await fetch(baseUrl + path, {
    headers: { Origin: origin, accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(12_000),
  })
  const failures = [
    response.status >= 200 && response.status < 500 ? null : `statut inattendu ${response.status}`,
    expectHeader(response, 'access-control-allow-origin', origin),
    expectHeader(response, 'access-control-allow-credentials', 'true'),
  ].filter(Boolean)
  return { origin, kind: 'get', path, status: response.status, failures, body: await readBody(response) }
}

const checks = (
  await Promise.all(
    origins.map(async (origin) => [
      await checkPreflight(origin, '/api/auth/csrf'),
      await checkPreflight(origin, '/api/events'),
      await checkGet(origin, '/api/auth/csrf'),
      await checkGet(origin, '/api/events?page=1&pageSize=12'),
    ])
  )
).flat()

const failures = checks.flatMap((check) => check.failures.map((failure) => ({ ...check, failure })))
const passedChecks = checks.filter((check) => check.failures.length === 0).length

console.log(`Expo Web CORS (${origins.join(', ')}) : ${failures.length === 0 ? 'OK' : 'ÉCHEC'} (${passedChecks}/${checks.length} contrôles).`)
for (const check of checks) console.log(`[${check.status || 'ERR'}] ${check.origin} ${check.kind.toUpperCase()} ${check.path}`)
for (const failure of failures) {
  console.error(`Échec ${failure.origin} ${failure.kind.toUpperCase()} ${failure.path} — ${failure.failure} — ${failure.body}`)
}

if (failures.length > 0) process.exitCode = 1
