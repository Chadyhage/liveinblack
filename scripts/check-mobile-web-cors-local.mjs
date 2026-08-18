import { spawn } from 'node:child_process'
import { createServer } from 'node:http'

const origins = (process.env.LIB_MOBILE_WEB_ORIGINS || 'http://localhost:8095,http://127.0.0.1:8095')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolve(address.port))
    })
  })
}

const port = Number(process.env.LIB_WEB_LOCAL_PORT || (await getFreePort()))
const baseUrl = `http://127.0.0.1:${port}`
const logs = []
let child

function rememberLog(chunk) {
  const text = chunk.toString()
  logs.push(...text.split('\n').filter(Boolean))
  if (logs.length > 80) logs.splice(0, logs.length - 80)
}

function stopServer() {
  if (!child || child.killed) return
  child.kill('SIGTERM')
}

process.on('SIGINT', () => {
  stopServer()
  process.exit(130)
})
process.on('SIGTERM', () => {
  stopServer()
  process.exit(143)
})

function expectHeader(response, key, expected) {
  const actual = response.headers.get(key)
  return actual === expected ? null : `${key}: attendu ${expected}, reçu ${actual || 'absent'}`
}

async function preflight(origin, path) {
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
  return { origin, path, status: response.status, failures }
}

async function waitForProxy() {
  const deadline = Date.now() + 60_000
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const result = await preflight(origins[0], '/api/events')
      if (result.status === 204) return
      lastError = new Error(`status ${result.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw lastError || new Error('next_dev_timeout')
}

child = spawn('npx', ['next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.stdout.on('data', rememberLog)
child.stderr.on('data', rememberLog)

try {
  await waitForProxy()
  const checks = (
    await Promise.all(
      origins.map(async (origin) => [
        await preflight(origin, '/api/auth/csrf'),
        await preflight(origin, '/api/auth/session'),
        await preflight(origin, '/api/events'),
      ])
    )
  ).flat()
  const failures = checks.flatMap((check) => check.failures.map((failure) => ({ ...check, failure })))
  const passedChecks = checks.filter((check) => check.failures.length === 0).length

  console.log(`Expo Web CORS local (${baseUrl}) : ${failures.length === 0 ? 'OK' : 'ÉCHEC'} (${passedChecks}/${checks.length} préflights).`)
  for (const check of checks) console.log(`[${check.status || 'ERR'}] ${check.origin} OPTIONS ${check.path}`)
  for (const failure of failures) console.error(`Échec ${failure.origin} OPTIONS ${failure.path} — ${failure.failure}`)
  if (failures.length > 0) process.exitCode = 1
} catch (error) {
  console.error(`Expo Web CORS local : ÉCHEC (${error.message})`)
  if (logs.length > 0) console.error(logs.slice(-30).join('\n'))
  process.exitCode = 1
} finally {
  stopServer()
}
