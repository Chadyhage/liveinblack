#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const apply = process.argv.includes('--apply')
const targetsForSecret = ['production', 'development']
const defaultEvents = ['deployment.created', 'deployment.ready']

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
    error: result.error?.message,
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

function findArray(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  for (const key of ['webhooks', 'hooks', 'items', 'data']) {
    if (Array.isArray(value[key])) return value[key]
  }
  return []
}

function redactSecrets(text) {
  return text
    .replace(/"secret"\s*:\s*"[^"]+"/gi, '"secret":"[redacted]"')
    .replace(/secret\s*[:=]\s*[A-Za-z0-9._~+/=-]{12,}/gi, 'secret: [redacted]')
    .replace(/token\s*[:=]\s*[A-Za-z0-9._~+/=-]{12,}/gi, 'token: [redacted]')
}

function findSecret(value) {
  if (!value || typeof value !== 'object') return ''
  for (const key of ['secret', 'signingSecret', 'webhookSecret']) {
    if (typeof value[key] === 'string' && value[key].length > 10) return value[key]
  }
  for (const nested of Object.values(value)) {
    const found = findSecret(nested)
    if (found) return found
  }
  return ''
}

function parseEvents() {
  const raw = process.env.VERCEL_ACCOUNT_WEBHOOK_EVENTS || ''
  const events = raw.split(',').map((event) => event.trim()).filter(Boolean)
  return events.length > 0 ? events : defaultEvents
}

const linkedProject = readJson('.vercel/project.json')
if (!linkedProject?.orgId || !linkedProject?.projectId) {
  console.error('Projet Vercel non lie: .vercel/project.json est manquant ou incomplet.')
  process.exit(1)
}

const publicSiteUrl = getPublicSiteUrl()
const platformWebhookUrl = process.env.VERCEL_ACCOUNT_WEBHOOK_URL || (publicSiteUrl ? `${publicSiteUrl.replace(/\/$/, '')}/api/ops/vercel-events` : '')
const spendWebhookUrl = process.env.VERCEL_SPEND_WEBHOOK_URL || (publicSiteUrl ? `${publicSiteUrl.replace(/\/$/, '')}/api/ops/vercel-spend` : '')
const events = parseEvents()
const scope = ['--scope', linkedProject.orgId]

if (!platformWebhookUrl || !spendWebhookUrl) {
  console.error('PUBLIC_SITE_URL manquant: impossible de calculer les endpoints Vercel Ops.')
  process.exit(1)
}

const list = run('vercel', ['webhooks', 'ls', '--format', 'json', ...scope])
const currentWebhooks = list.ok ? findArray(parseJsonOutput(list.output)) : []
const existingPlatformWebhook = currentWebhooks.find((webhook) => webhook?.url === platformWebhookUrl)

if (!apply) {
  console.log('Dry-run: aucun webhook Vercel ne sera cree.')
  console.log(`Webhook plateforme: ${platformWebhookUrl}`)
  console.log(`Evenements plateforme: ${events.join(', ')}`)
  console.log(`Projet limite: ${linkedProject.projectId}`)
  console.log(existingPlatformWebhook ? 'Etat plateforme: deja present' : 'Etat plateforme: a creer')
  console.log('')
  console.log('Webhook Spend Management a configurer dans Vercel Billing:')
  console.log(`Endpoint: ${spendWebhookUrl}`)
  console.log('Secret a stocker dans: VERCEL_SPEND_WEBHOOK_SECRET')
  console.log('')
  console.log('Pour appliquer le webhook plateforme: npm run ops:vercel:webhooks:setup -- --apply')
  if (!list.ok) console.log(`Note: liste webhooks indisponible en dry-run: ${list.error || list.output || `exit ${list.code}`}`)
  process.exit(0)
}

if (!list.ok) {
  console.error(list.error || list.output || `exit ${list.code}`)
  process.exit(list.code)
}

if (existingPlatformWebhook) {
  console.log(`Webhook plateforme deja present: ${platformWebhookUrl}`)
  console.log('Aucun secret renvoye par Vercel pour un webhook existant. Garder VERCEL_ACCOUNT_WEBHOOK_SECRET deja stocke.')
  process.exit(0)
}

const createArgs = [
  'webhooks',
  'create',
  platformWebhookUrl,
  ...events.flatMap((event) => ['--event', event]),
  '--project',
  linkedProject.projectId,
  ...scope,
]
const created = run('vercel', createArgs)

if (!created.ok) {
  console.error(redactSecrets(created.output) || `exit ${created.code}`)
  process.exit(created.code)
}

console.log(redactSecrets(created.output))
const secret = findSecret(parseJsonOutput(created.output))
if (secret) {
  for (const target of targetsForSecret) {
    console.log(`-> Sync VERCEL_ACCOUNT_WEBHOOK_SECRET (${target})`)
    const added = run('vercel', ['env', 'add', 'VERCEL_ACCOUNT_WEBHOOK_SECRET', target, ...scope, '--yes', '--value', secret])
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
  console.log('Webhook plateforme cree et secret synchronise sans afficher le secret.')
} else {
  console.log('Webhook plateforme cree. Copier le secret affiche par Vercel dans VERCEL_ACCOUNT_WEBHOOK_SECRET si la CLI le fournit hors JSON.')
}

console.log('')
console.log('Reste a faire dans Vercel Billing pour Spend Management:')
console.log(`- endpoint: ${spendWebhookUrl}`)
console.log('- stocker le secret dans VERCEL_SPEND_WEBHOOK_SECRET')
