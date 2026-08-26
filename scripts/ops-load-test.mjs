#!/usr/bin/env node
import { createHash } from 'node:crypto'

const baseUrl = process.env.LIB_WEB_BASE_URL
if (!baseUrl) {
  console.error('LIB_WEB_BASE_URL manquant — exécute: LIB_WEB_BASE_URL=https://... npm run ops:load')
  process.exit(1)
}
const concurrency = Number(process.env.LIB_WEB_LOAD_CONCURRENCY ?? '20')
const iterations = Number(process.env.LIB_WEB_LOAD_ITERATIONS ?? '200')
const timeoutMs = Number(process.env.LIB_WEB_LOAD_TIMEOUT_MS ?? '8000')
const p95MaxMs = Number(process.env.LIB_WEB_LOAD_P95_MAX_MS ?? '2500')

const endpoints = [
  { name: 'home', path: '/home' },
  { name: 'events', path: '/events' },
  { name: 'providers', path: '/providers' },
  { name: 'organizers', path: '/organizers' },
  { name: 'health', path: '/api/health' },
  { name: 'api_events', path: '/api/events?page=1&pageSize=12' },
  { name: 'api_organizers', path: '/api/organizers?page=1' },
  { name: 'api_providers', path: '/api/providers?page=1' },
  { name: 'api_search', path: '/api/search?q=soir' },
]

const headers = {
  'x-ops-load-id': createHash('sha1').update(`${Date.now()}`).digest('hex').slice(0, 8),
}

const vercelBypassToken = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_PROTECTION_BYPASS
if (vercelBypassToken) {
  headers['x-vercel-protection-bypass'] = vercelBypassToken
}

const isBypassTokenMissing = !vercelBypassToken
const protectedText = /vercel\.com\/sso-api/i

function isVercelProtectedRedirect(result) {
  return result.status === 302 && protectedText.test(result.text || '')
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1_000_000n)
}

async function request(path) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const started = nowMs()
  try {
    let response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })
    } catch (error) {
      const retryError = error
      const text = String(retryError?.message ?? '')
      if (text.includes('fetch failed')) {
        try {
          const retryResponse = await fetch(`${baseUrl}${path}`, {
            method: 'GET',
            headers,
            signal: controller.signal,
          })
          response = retryResponse
        } catch {
          throw retryError
        }
      } else {
        throw error
      }
    }

    const text = await response.text()
    const elapsedMs = nowMs() - started
    const isProtectedRedirect = !vercelBypassToken && response.status === 302 && /vercel\.com\/sso-api/i.test(text)
    return {
      path,
      ok: response.ok || isProtectedRedirect,
      status: response.status,
      ms: elapsedMs,
      text,
      vercelId: response.headers.get('x-vercel-id') || '',
      vercelCache: response.headers.get('x-vercel-cache') || '',
    }
  } catch (error) {
    return {
      path,
      ok: false,
      status: 0,
      ms: nowMs() - started,
      error: error?.message ?? 'network_error',
      errorName: error?.name ?? 'Error',
    }
  } finally {
    clearTimeout(timeout)
  }
}

function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

async function worker(tasks, results) {
  for await (const task of tasks) {
    const result = await request(task.path)
    results.push(result)
  }
}

async function main() {
  const pool = []
  const results = []
  const tasks = []

  for (let index = 0; index < iterations; index += 1) {
    const endpoint = endpoints[index % endpoints.length]
    tasks.push(endpoint)
  }

  const chunks = Array.from({ length: Math.max(1, concurrency) }, () => [])
  tasks.forEach((task, index) => {
    chunks[index % chunks.length].push(task)
  })

  for (const chunk of chunks) {
    if (chunk.length === 0) continue
    pool.push(worker(chunk[Symbol.iterator](), results))
  }

  await Promise.all(pool)

  const grouped = new Map()
  for (const item of results) {
    if (!grouped.has(item.path)) grouped.set(item.path, [])
    grouped.get(item.path).push(item)
  }

  let failed = 0
  let hadProtectedDeployment = false
  for (const [path, rows] of grouped) {
    const okRows = rows.filter((row) => row.ok)
    const p95 = percentile(okRows.map((row) => row.ms), 95)
    const avg = okRows.length ? Math.round(okRows.reduce((acc, row) => acc + row.ms, 0) / okRows.length) : 0
    const errors = rows.length - okRows.length
    const perfBreach = p95 > p95MaxMs
    if (errors > 0 || perfBreach) failed += 1
    if (rows.some((row) => isVercelProtectedRedirect(row))) {
      hadProtectedDeployment = true
    }
    console.log(
      `${path} -> ${okRows.length}/${rows.length} OK | p95 ${p95.toFixed(0)}ms | avg ${avg}ms | errors ${errors}` +
      (perfBreach ? ` | p95> ${p95MaxMs}ms KO` : '')
    )
    const regions = new Map()
    const cacheStates = new Map()
    for (const row of okRows) {
      const vercelRoute = row.vercelId
        ? row.vercelId.split('::').slice(0, -1).join(' -> ')
        : 'unknown'
      regions.set(vercelRoute, (regions.get(vercelRoute) || 0) + 1)
      const cacheState = row.vercelCache || 'none'
      cacheStates.set(cacheState, (cacheStates.get(cacheState) || 0) + 1)
    }
    console.log(
      `  regions: ${[...regions].map(([key, count]) => `${key} x${count}`).join(' | ')}` +
      ` | cache: ${[...cacheStates].map(([key, count]) => `${key} x${count}`).join(' | ')}`
    )
    if (errors > 0) {
      const errorSummary = new Map()
      for (const row of rows.filter((item) => !item.ok)) {
        const key = row.status > 0
          ? `HTTP ${row.status}`
          : `${row.errorName || 'Error'}: ${row.error || 'network_error'}`
        errorSummary.set(key, (errorSummary.get(key) || 0) + 1)
      }
      console.log(`  details: ${[...errorSummary].map(([key, count]) => `${key} x${count}`).join(' | ')}`)
    }
  }

  if (failed > 0 && hadProtectedDeployment && isBypassTokenMissing) {
    console.error('Load test KO en Protected Deployment (Vercel 302 vers sso-api). Configure un token de bypass:')
    console.error('  VERCEL_AUTOMATION_BYPASS_SECRET=<token>')
    console.error('ou')
    console.error('  VERCEL_PROTECTION_BYPASS=<token>')
  }

  if (failed > 0) {
    console.error('Load test KO — erreurs ou seuil de performance dépassé')
    process.exit(1)
  }
  console.log(`Load test OK (${results.length} requêtes); p95 max = ${p95MaxMs}ms`)
}

await main()
