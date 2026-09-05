#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const apply = process.argv.includes('--apply')
const targetsForSecret = ['production', 'development']

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
  } catch {
    return null
  }
}

function readEnvValue(relativePath, key) {
  const absolute = path.join(root, relativePath)
  if (!fs.existsSync(absolute)) return ''

  for (const rawLine of fs.readFileSync(absolute, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index <= 0 || line.slice(0, index).trim() !== key) continue
    let value = line.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    return value
  }

  return ''
}

function getPublicSiteUrl() {
  return process.env.PUBLIC_SITE_URL || readEnvValue('.env.local', 'PUBLIC_SITE_URL') || readEnvValue('.env.example', 'PUBLIC_SITE_URL')
}

function run(command, args, input) {
  const result = spawnSync(command, args, {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  })

  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
    code: result.status ?? 1,
  }
}

function parseJsonOutput(output) {
  const firstObject = output.indexOf('{')
  const firstArray = output.indexOf('[')
  const lastObject = output.lastIndexOf('}')
  const lastArray = output.lastIndexOf(']')
  const starts = [firstObject, firstArray].filter((index) => index >= 0)
  const start = starts.length > 0 ? Math.min(...starts) : -1
  const end = start === firstArray && lastArray > firstArray ? lastArray : lastObject
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(output.slice(start, end + 1))
    } catch {
      return null
    }
  }
  return null
}

function redactSecrets(text) {
  return text
    .replace(/"secret"\s*:\s*"[^"]+"/gi, '"secret":"[redacted]"')
    .replace(/"token"\s*:\s*"[^"]+"/gi, '"token":"[redacted]"')
    .replace(/"signature"\s*:\s*"[^"]+"/gi, '"signature":"[redacted]"')
}

function findSecret(value) {
  if (!value || typeof value !== 'object') return ''
  const object = value
  for (const key of ['secret', 'drainSecret', 'signingSecret']) {
    if (typeof object[key] === 'string' && object[key].length > 10) return object[key]
  }
  for (const nested of Object.values(object)) {
    const found = findSecret(nested)
    if (found) return found
  }
  return ''
}

const publicSiteUrl = getPublicSiteUrl()
const defaultDrainUrl = publicSiteUrl ? `${publicSiteUrl.replace(/\/$/, '')}/api/ops/vercel-drain` : ''
const drainUrl = process.env.VERCEL_DRAIN_URL || process.env.ERROR_WEBHOOK_URL || defaultDrainUrl

const linkedProject = readJson('.vercel/project.json')
if (!linkedProject?.orgId) {
  console.error('Projet Vercel non lie: .vercel/project.json est manquant ou incomplet.')
  process.exit(1)
}

const body = {
  url: drainUrl,
  type: 'json',
  sources: ['lambda', 'edge', 'static'],
  environments: ['production'],
}

if (!apply || !drainUrl) {
  console.log('Dry-run: aucun drain Vercel ne sera cree.')
  console.log('Pour appliquer: VERCEL_DRAIN_URL=https://ton-collecteur.example.com/logs npm run ops:vercel:drain:setup -- --apply')
  if (defaultDrainUrl) console.log(`Endpoint interne prepare: VERCEL_DRAIN_URL=${defaultDrainUrl}`)
  console.log('Sources: lambda, edge, static')
  console.log('Environnement: production')
  if (!drainUrl) console.log('VERCEL_DRAIN_URL manquant: impossible de creer un drain sans endpoint externe fiable.')
  process.exit(drainUrl ? 0 : 1)
}

const result = run(
  'vercel',
  ['api', '/v1/drains', '--scope', linkedProject.orgId, '-X', 'POST', '--input', '-'],
  `${JSON.stringify(body)}\n`
)

if (!result.ok) {
  console.error(result.output || `exit ${result.code}`)
  process.exit(result.code)
}

console.log(redactSecrets(result.output))
const returnedSecret = findSecret(parseJsonOutput(result.output))
if (returnedSecret) {
  for (const target of targetsForSecret) {
    console.log(`-> Sync DRAIN_SECRET (${target})`)
    const added = run('vercel', ['env', 'add', 'DRAIN_SECRET', target, '--scope', linkedProject.orgId, '--yes', '--value', returnedSecret])
    if (!added.ok) {
      const alreadyExists = /already exists|existe deja|conflict/i.test(added.output)
      if (alreadyExists) {
        console.log(`   deja presente (${target})`)
        continue
      }
      console.error(redactSecrets(added.output) || `exit ${added.code}`)
      process.exit(added.code)
    }
  }
  console.log('Drain Vercel cree et DRAIN_SECRET synchronise sans afficher le secret.')
} else {
  console.log('Drain Vercel cree. Stocker le secret de signature dans DRAIN_SECRET si Vercel en fournit un.')
}
