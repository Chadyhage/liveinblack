import { spawnSync } from 'node:child_process'

const baseUrl = process.env.LIB_WEB_BASE_URL?.replace(/\/$/, '')
if (!baseUrl) {
  console.error('LIB_WEB_BASE_URL manquant')
  process.exit(1)
}

const contract = spawnSync(process.execPath, ['scripts/check-mobile-api-contract.mjs', '--json'], {
  cwd: process.cwd(),
  encoding: 'utf8',
})
if (contract.status !== 0) {
  process.stderr.write(contract.stderr || contract.stdout)
  process.exit(contract.status ?? 1)
}

const { clientResults } = JSON.parse(contract.stdout)
const dummyId = '507f1f77bcf86cd799439011'
const dummySlug = 'verification-api-mobile-inexistante'

function runtimePath(path) {
  let index = 0
  return path.replaceAll('[param]', () => {
    index += 1
    return index === 1 ? dummyId : dummySlug
  })
}

async function check(call) {
  const path = runtimePath(call.path)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(baseUrl + path, {
      method: call.method,
      redirect: 'manual',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'LiveInBlack-Mobile-Contract-Check/1.0',
      },
      body: ['GET', 'HEAD'].includes(call.method) ? undefined : '{}',
      signal: controller.signal,
    })
    const contentType = response.headers.get('content-type') ?? ''
    const body = (await response.text()).slice(0, 240)
    const invalid = response.status === 405 || response.status >= 500
    return { ...call, path, status: response.status, contentType, body, invalid }
  } catch (error) {
    return {
      ...call,
      path,
      status: 0,
      contentType: '',
      body: error instanceof Error ? error.message : 'network_error',
      invalid: true,
    }
  } finally {
    clearTimeout(timeout)
  }
}

const results = []
const concurrency = 8
for (let offset = 0; offset < clientResults.length; offset += concurrency) {
  results.push(...await Promise.all(clientResults.slice(offset, offset + concurrency).map(check)))
}

const counts = new Map()
for (const result of results) counts.set(result.status, (counts.get(result.status) ?? 0) + 1)
const failures = results.filter((result) => result.invalid)

console.log(`Surface API mobile : ${results.length - failures.length}/${results.length} réponses sans 405 ni 5xx.`)
console.log('Statuts : ' + [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([status, count]) => `${status || 'ERR'}=${count}`).join(', '))

if (process.env.VERBOSE === 'true') {
  for (const result of results.filter((item) => item.status >= 200 && item.status < 400)) {
    console.log(`[${result.status}] ${result.method} ${result.path}`)
  }
}

for (const result of failures) {
  console.error(`[${result.status || 'ERR'}] ${result.method} ${result.path} (${result.routeFile}) — ${result.body}`)
}

if (failures.length > 0) process.exitCode = 1
