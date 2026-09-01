#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

function normalizeUrl(url) {
  if (!url) return ''
  const trimmed = String(url).trim()
  if (!trimmed) return ''
  return trimmed.replace(/\/+$/, '')
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })

  if (result.error) {
    return {
      ok: false,
      code: 1,
      output: result.error.message,
    }
  }

  return {
    ok: result.status === 0,
    code: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  }
}

const providedUrl = process.env.LIB_WEB_BASE_URL
let baseUrl = providedUrl

if (!baseUrl) {
  const explicitUrl = process.env.VERCEL_DEPLOYMENT_URL || process.env.VERCEL_URL
  if (explicitUrl) {
    baseUrl = normalizeUrl(explicitUrl)
  }
}

if (!baseUrl) {
  console.log('-> Déploiement Vercel Production en cours...')
  const deployment = run('vercel', ['--prod', '--yes', '--json'])

  if (!deployment.ok) {
    console.error('Échec du déploiement Vercel.')
    console.error(deployment.output.trim())
    if (/ENOTFOUND api\.vercel\.com/i.test(deployment.output)) {
      console.error("Impossible de joindre l'API Vercel depuis cet environnement (DNS/API inaccessible).")
      console.error('Relance avec un réseau autorisé ou définis LIB_WEB_BASE_URL / VERCEL_DEPLOYMENT_URL avant de relancer.')
    }
    process.exit(deployment.code)
  }

  try {
    const lines = deployment.output.split('\n').filter(Boolean)
    const maybeJson = lines.filter((line) => line.trim().startsWith('{') || line.trim().startsWith('[')).pop()
    if (maybeJson) {
      const parsed = JSON.parse(maybeJson)
      baseUrl = normalizeUrl(parsed.url || parsed.deployments?.[0]?.url || '')
      if (!baseUrl && typeof parsed === 'string' && /^https?:\/\//.test(parsed)) baseUrl = parsed
    }
  } catch {
    baseUrl = ''
  }

  if (!baseUrl) {
    const fallback = deployment.output.match(/https:\/\/[^"\s]+/g)?.find((value) => value.includes('.vercel.app') || value.includes('.now.sh'))
    baseUrl = normalizeUrl(fallback)
  }

  if (!baseUrl) {
    if (/ENOTFOUND api\.vercel\.com/i.test(deployment.output)) {
      console.error("Impossible de joindre l'API Vercel depuis cet environnement (DNS/API inaccessible).")
      console.error('Déploiement non vérifiable ici. Relance depuis un poste réseau classique avec:')
      console.error('  VERCEL_DEPLOYMENT_URL=<url du déploiement>')
      console.error('  npm run ops:deploy:prod')
      process.exit(1)
    }
    console.error("URL de déploiement non détectée dans la sortie Vercel.")
    console.error(deployment.output.trim())
    process.exit(1)
  }
}

baseUrl = normalizeUrl(baseUrl)
if (!baseUrl || !/^https?:\/\/.+/.test(baseUrl)) {
  console.error(`URL de déploiement invalide: ${baseUrl || '(vide)'}`)
  process.exit(1)
}

console.log(`-> Déploiement ciblé: ${baseUrl}`)

const smoke = run(process.platform === 'win32' ? 'cmd' : 'sh', [
  process.platform === 'win32' ? '/c' : '-lc',
  `LIB_WEB_BASE_URL=${baseUrl} npm run ops:smoke`,
], {
  LIB_WEB_BASE_URL: baseUrl,
  VERCEL_AUTOMATION_BYPASS_SECRET: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '',
  VERCEL_PROTECTION_BYPASS: process.env.VERCEL_PROTECTION_BYPASS ?? '',
})

if (!smoke.ok) {
  console.error('Smoke Vercel KO.')
  console.error(smoke.output.trim())
  process.exit(smoke.code)
}

const load = run(process.platform === 'win32' ? 'cmd' : 'sh', [
  process.platform === 'win32' ? '/c' : '-lc',
  `LIB_WEB_BASE_URL=${baseUrl} npm run ops:load`,
], {
  LIB_WEB_BASE_URL: baseUrl,
  VERCEL_AUTOMATION_BYPASS_SECRET: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '',
  VERCEL_PROTECTION_BYPASS: process.env.VERCEL_PROTECTION_BYPASS ?? '',
})

if (!load.ok) {
  console.error('Load test Vercel KO.')
  console.error(load.output.trim())
  process.exit(load.code)
}

const logs = run(process.platform === 'win32' ? 'cmd' : 'sh', [
  process.platform === 'win32' ? '/c' : '-lc',
  `LIB_WEB_BASE_URL=${baseUrl} npm run ops:vercel:logs`,
], {
  LIB_WEB_BASE_URL: baseUrl,
  VERCEL_LOGS_SINCE: process.env.VERCEL_LOGS_SINCE ?? '1h',
})

if (!logs.ok) {
  console.error('Scan logs Vercel KO.')
  console.error(logs.output.trim())
  process.exit(logs.code)
}

console.log(`✅ Déploiement + validations + logs OK (${baseUrl})`)
