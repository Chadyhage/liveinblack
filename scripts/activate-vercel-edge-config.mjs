#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const apply = process.argv.includes('--apply')
const slug = process.env.VERCEL_EDGE_CONFIG_SLUG || 'liveinblack-ops'
const tokenLabel = process.env.VERCEL_EDGE_CONFIG_TOKEN_LABEL || 'liveinblack-runtime'
const previewBranch = process.env.VERCEL_PREVIEW_GIT_BRANCH || ''
const targets = [
  { environment: 'production' },
  ...(previewBranch ? [{ environment: 'preview', branch: previewBranch }] : []),
  { environment: 'development' },
]

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
  } catch {
    return null
  }
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

function getTokenValue(parsed, output) {
  const candidates = [
    parsed?.token,
    parsed?.value,
    parsed?.readToken,
    parsed?.connection?.token,
    parsed?.edgeConfigToken?.token,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 20) return candidate
  }

  const match = output.match(/(?:token|read token)[^A-Za-z0-9_-]*([A-Za-z0-9_-]{20,})/i)
  return match?.[1] || ''
}

function redactConnection(connection) {
  return connection.replace(/token=[^&]+/i, 'token=[redacted]')
}

const linkedProject = readJson('.vercel/project.json')
if (!linkedProject?.orgId) {
  console.error('Projet Vercel non lie: .vercel/project.json est manquant ou incomplet.')
  process.exit(1)
}

if (!apply) {
  console.log('Dry-run: aucune variable Vercel ne sera modifiee.')
  console.log(`Edge Config cible: ${slug}`)
  console.log(`Token lecture cible: ${tokenLabel}`)
  console.log('Variables a ajouter si --apply: EDGE_CONFIG -> production, development')
  console.log('Preview: definir VERCEL_PREVIEW_GIT_BRANCH=nom-de-branche pour ajouter aussi une branche Preview precise')
  console.log('Pour appliquer: npm run ops:vercel:edge-config:activate -- --apply')
  process.exit(0)
}

const scope = ['--scope', linkedProject.orgId]
const metadata = run('vercel', ['edge-config', 'get', slug, ...scope, '--format', 'json'])
if (!metadata.ok) {
  console.error(metadata.output || `exit ${metadata.code}`)
  process.exit(metadata.code)
}

const parsedMetadata = parseJsonOutput(metadata.output)
const edgeConfigId = parsedMetadata?.id || parsedMetadata?.edgeConfigId
if (!edgeConfigId) {
  console.error('Impossible de trouver l’identifiant Edge Config dans la reponse Vercel.')
  process.exit(1)
}

console.log(`-> Creation token lecture Edge Config: ${tokenLabel}`)
const tokenResult = run('vercel', ['edge-config', 'tokens', slug, '--add', tokenLabel, ...scope, '--format', 'json', '--yes'])
if (!tokenResult.ok) {
  console.error(tokenResult.output || `exit ${tokenResult.code}`)
  process.exit(tokenResult.code)
}

const readToken = getTokenValue(parseJsonOutput(tokenResult.output), tokenResult.output)
if (!readToken) {
  console.error('Token cree, mais sa valeur n’a pas pu etre extraite automatiquement. Refaire depuis le dashboard Edge Config.')
  process.exit(1)
}

const connection = `https://edge-config.vercel.com/${edgeConfigId}?token=${readToken}`

for (const target of targets) {
  const args = ['env', 'add', 'EDGE_CONFIG', target.environment]
  if (target.branch) args.push(target.branch)
  args.push('--scope', linkedProject.orgId, '--yes', '--value', connection)

  console.log(`-> Activation EDGE_CONFIG (${target.environment}${target.branch ? `:${target.branch}` : ''})`)
  const added = run('vercel', args)
  if (!added.ok) {
    const alreadyExists = /already exists|existe deja|conflict/i.test(added.output)
    if (alreadyExists) {
      console.log(`   deja presente (${target.environment}${target.branch ? `:${target.branch}` : ''})`)
      continue
    }
    console.error(added.output || `exit ${added.code}`)
    process.exit(added.code)
  }
}

console.log(`EDGE_CONFIG activee: ${redactConnection(connection)}`)
if (!previewBranch) console.log('Preview ignoree: definir VERCEL_PREVIEW_GIT_BRANCH pour une branche preview precise.')
console.log('Relancer ensuite: npm run audit:vercel-env && npm run audit:vercel-live')
