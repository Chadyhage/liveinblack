#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const apply = process.argv.includes('--apply')
const slug = process.env.VERCEL_EDGE_CONFIG_SLUG || 'liveinblack-ops'

const items = [
  { operation: 'upsert', key: 'maintenance_mode', value: false },
  { operation: 'upsert', key: 'checkout_enabled', value: true },
  { operation: 'upsert', key: 'ticket_resale_enabled', value: true },
  { operation: 'upsert', key: 'search_min_query_length', value: 2 },
  { operation: 'upsert', key: 'public_cache_ttl_seconds', value: 45 },
]

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
  } catch {
    return null
  }
}

function run(args) {
  const result = spawnSync('vercel', args, {
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

const linkedProject = readJson('.vercel/project.json')
if (!linkedProject?.orgId) {
  console.error('Projet Vercel non lie: .vercel/project.json est manquant ou incomplet.')
  process.exit(1)
}

const scope = ['--scope', linkedProject.orgId]
const patch = JSON.stringify({ items })

if (!apply) {
  console.log('Dry-run: aucune Edge Config Vercel ne sera creee ou modifiee.')
  console.log('Pour appliquer: npm run ops:vercel:edge-config:setup -- --apply')
  console.log(`Slug: ${slug}`)
  console.log(patch)
  process.exit(0)
}

const get = run(['edge-config', 'get', slug, ...scope, '--format', 'json'])
if (!get.ok) {
  console.log(`-> Creation Edge Config: ${slug}`)
  const add = run(['edge-config', 'add', slug, ...scope])
  if (!add.ok && !/already exists|existe deja|Conflict/i.test(add.output)) {
    console.error(add.output || `exit ${add.code}`)
    process.exit(add.code)
  }
}

console.log(`-> Patch Edge Config: ${slug}`)
const update = run(['edge-config', 'update', slug, ...scope, '--patch', patch, '--format', 'json'])
if (!update.ok) {
  console.error(update.output || `exit ${update.code}`)
  process.exit(update.code)
}

console.log(update.output)
console.log('Edge Config operationnelle. La lier au projet Vercel pour injecter EDGE_CONFIG, puis relancer: npm run audit:vercel-live')
