#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

function normalizeUrl(value) {
  const url = String(value ?? '').trim().replace(/\/+$/, '')
  if (!url) return ''
  if (/^https?:\/\//.test(url)) return url
  if (/^[a-z0-9.-]+$/i.test(url)) return `https://${url}`
  return url
}

const deploymentUrl = normalizeUrl(
  process.env.LIB_WEB_BASE_URL || process.env.VERCEL_DEPLOYMENT_URL || process.env.VERCEL_URL || process.argv[2]
)
const since = process.env.VERCEL_LOGS_SINCE || '1h'

if (!deploymentUrl) {
  console.error('URL de deploiement manquante.')
  console.error('Exemple: LIB_WEB_BASE_URL=https://ton-domaine.com npm run ops:vercel:logs')
  process.exit(1)
}

const result = spawnSync('vercel', ['logs', deploymentUrl, '--level', 'error', '--since', since, '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
})

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

if (result.status !== 0) {
  console.error('Scan logs Vercel impossible.')
  if (output) console.error(output)
  process.exit(result.status ?? 1)
}

const lines = output.split('\n').map((line) => line.trim()).filter(Boolean)
const errorLines = lines.filter((line) => {
  try {
    const parsed = JSON.parse(line)
    return parsed.level === 'error' || /error|failed|exception|timeout/i.test(parsed.message ?? parsed.text ?? '')
  } catch {
    return /error|failed|exception|timeout/i.test(line)
  }
})

if (errorLines.length === 0) {
  console.log(`Logs Vercel OK: aucune erreur detectee sur ${deploymentUrl} depuis ${since}.`)
  process.exit(0)
}

console.error(`Logs Vercel KO: ${errorLines.length} ligne(s) d'erreur detectee(s) sur ${deploymentUrl} depuis ${since}.`)
for (const line of errorLines.slice(0, 20)) {
  console.error(line)
}

if (errorLines.length > 20) {
  console.error(`... ${errorLines.length - 20} erreur(s) supplementaire(s) masquees.`)
}

process.exit(1)

