#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const args = new Set(process.argv.slice(2))
const includeFullLaunch = args.has('--full')
const includeProdSeo = includeFullLaunch || args.has('--prod') || process.env.CHECK_PROD_SEO === 'true'
const includeLiveSeo = includeFullLaunch || args.has('--live') || process.env.CHECK_LIVE_SEO === 'true'
const includeBuild = includeFullLaunch || args.has('--build') || process.env.CHECK_BUILD === 'true'

const checks = [
  { name: 'Audit croissance local', command: 'npm', args: ['run', 'audit:growth'], required: true },
  { name: 'Configuration SEO production', command: 'npm', args: ['run', 'check:seo:prod'], required: includeProdSeo },
  { name: 'SEO live post-déploiement', command: 'npm', args: ['run', 'check:seo:live'], required: includeLiveSeo },
  { name: 'Build production', command: 'npm', args: ['run', 'build'], required: includeBuild },
]

const skipped = []

function run(check) {
  if (!check.required) {
    skipped.push(check.name)
    console.log(`\n=== ${check.name} ===\nIgnoré — active avec --full, --prod/--live/--build ou CHECK_PROD_SEO=true, CHECK_LIVE_SEO=true, CHECK_BUILD=true selon le besoin.`)
    return 0
  }

  console.log(`\n=== ${check.name} ===`)
  const result = spawnSync(check.command, check.args, { stdio: 'inherit' })
  return result.status ?? 1
}

for (const check of checks) {
  const code = run(check)
  if (code !== 0) {
    console.error(`\nCheck croissance lancement KO — étape échouée : ${check.name}`)
    process.exit(code)
  }
}

if (skipped.length > 0) {
  console.log(`\nChecks optionnels non lancés : ${skipped.join(', ')}.`)
  console.log('Pour un lancement production complet : npm run check:growth:launch:full')
}

console.log(includeFullLaunch
  ? '\nCheck croissance lancement OK — parcours complet production/live/build validé.'
  : '\nCheck croissance lancement OK — socle local validé.'
)
