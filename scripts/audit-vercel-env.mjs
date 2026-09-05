#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()

const requiredProductionKeys = [
  'MONGODB_URI',
  'AUTH_SECRET',
  'RESEND_API_KEY',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'CLOUDINARY_PRIVATE_UPLOAD_PRESET',
  'CLOUDINARY_PUBLIC_UPLOAD_PRESET',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'VAPID_SUBJECT',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'FEDAPAY_SECRET_KEY',
  'FEDAPAY_WEBHOOK_SECRET',
  'PUBLIC_SITE_URL',
  'EXPECTED_PUBLIC_SITE_HOST',
  'CRON_SECRET',
]

const optionalProductionKeys = [
  'EDGE_CONFIG',
  'VERCEL_EDGE_CONFIG_READ_TOKEN',
  'VERCEL_API_TOKEN',
  'VERCEL_TEAM_ID',
  'VERCEL_EDGE_CONFIG_ID',
  'SUPER_ADMIN_EMAILS',
  'NEXT_PUBLIC_GA_MEASUREMENT_ID',
  'GOOGLE_SITE_VERIFICATION',
  'BING_SITE_VERIFICATION',
  'YANDEX_SITE_VERIFICATION',
  'PINTEREST_SITE_VERIFICATION',
  'DRAIN_SECRET',
  'VERCEL_DRAIN_URL',
  'ERROR_WEBHOOK_URL',
  'VERCEL_SPEND_WEBHOOK_SECRET',
  'VERCEL_SPEND_AUTO_MAINTENANCE',
  'VERCEL_SPEND_WEBHOOK_URL',
  'VERCEL_ACCOUNT_WEBHOOK_SECRET',
  'VERCEL_ACCOUNT_WEBHOOK_URL',
  'VERCEL_ACCOUNT_WEBHOOK_EVENTS',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
]

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
  } catch {
    return null
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
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
      // Fall back to line candidates below.
    }
  }

  const candidates = output
    .split('\n')
    .map((line) => line.trim())
    .flatMap((line) => {
      const objectStart = line.indexOf('{')
      const arrayStart = line.indexOf('[')
      const starts = [objectStart, arrayStart].filter((index) => index >= 0)
      if (starts.length === 0) return []
      return [line.slice(Math.min(...starts))]
    })

  for (const candidate of candidates.reverse()) {
    try {
      return JSON.parse(candidate)
    } catch {
      // Keep looking.
    }
  }

  return null
}

function getArray(value, keys) {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

const linkedProject = readJson('.vercel/project.json')
if (!linkedProject?.orgId || !linkedProject?.projectId) {
  console.error('Projet Vercel non lie: .vercel/project.json est manquant ou incomplet.')
  process.exit(1)
}

const result = run('vercel', ['api', `/v9/projects/${linkedProject.projectId}/env`, '--scope', linkedProject.orgId, '--raw'])
if (!result.ok) {
  console.error('Impossible de lire les variables Vercel live.')
  console.error(result.output || `exit ${result.code}`)
  process.exit(result.code)
}

const parsed = parseJsonOutput(result.output)
const envs = getArray(parsed, ['envs', 'env'])
const productionNames = new Set()

for (const env of envs) {
  const key = env.key || env.name
  const target = env.target || env.targets || env.environment || env.environments
  const targets = Array.isArray(target) ? target : [target].filter(Boolean)
  if (key && (targets.length === 0 || targets.includes('production'))) {
    productionNames.add(key)
  }
}

const missingRequired = requiredProductionKeys.filter((key) => !productionNames.has(key))
const missingOptional = optionalProductionKeys.filter((key) => !productionNames.has(key))

console.log(`Vercel env production: ${productionNames.size} variable(s) visible(s)`)
console.log(`Obligatoires manquantes: ${missingRequired.length}/${requiredProductionKeys.length}`)
console.log(`Optionnelles manquantes: ${missingOptional.length}/${optionalProductionKeys.length}`)
console.log('')

for (const key of requiredProductionKeys) {
  console.log(`${productionNames.has(key) ? 'OK ' : 'NON'} ${key}`)
}

if (missingOptional.length > 0) {
  console.log('')
  console.log(`Optionnelles absentes: ${missingOptional.join(', ')}`)
}

if (missingRequired.length > 0) {
  console.log('')
  console.log('Action: renseigner ces variables dans Vercel ou lancer le dry-run de sync depuis .env.local:')
  console.log('npm run ops:vercel:env:sync')
  process.exit(1)
}
