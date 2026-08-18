import { spawnSync } from 'node:child_process'
import path from 'node:path'

const baseUrl = process.env.LIB_WEB_BASE_URL?.replace(/\/$/, '')
const mobileRoot = path.resolve(process.cwd(), '../LIB_Mobile')
const strictQa = process.env.STRICT_QA === 'true'
const skipExpoExports = process.env.SKIP_EXPO_EXPORTS === 'true'
const skipExpoWebSmoke = process.env.SKIP_EXPO_WEB_SMOKE === 'true'

function run(name, command, args, options = {}) {
  console.log(`\n=== ${name} ===`)
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
    stdio: 'inherit',
    shell: false,
  })
  return { name, code: result.status ?? 1, required: options.required !== false }
}

const checks = [
  run('mobile-ui-system', 'npm', ['run', 'check:ui-system'], { cwd: mobileRoot }),
  run('mobile-typescript', 'npx', ['tsc', '--noEmit'], { cwd: mobileRoot }),
  run('mobile-config', 'npm', ['run', 'check:mobile-config']),
  run('mobile-feature-coverage', 'npm', ['run', 'check:mobile-feature-coverage']),
  run('mobile-api-contract', 'npm', ['run', 'check:mobile-api']),
]

if (skipExpoExports) {
  console.warn('\nExports Expo ignorés : SKIP_EXPO_EXPORTS=true.')
} else {
  checks.push(run('mobile-export-web', 'npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist-web-test'], { cwd: mobileRoot }))
  if (skipExpoWebSmoke) {
    console.warn('\nSmoke Expo Web ignoré : SKIP_EXPO_WEB_SMOKE=true.')
  } else {
    checks.push(run('mobile-web-smoke', 'npm', ['run', 'check:mobile-web-smoke']))
  }
  checks.push(run('mobile-export-android', 'npx', ['expo', 'export', '--platform', 'android', '--output-dir', 'dist-android-test'], { cwd: mobileRoot }))
}

if (baseUrl) {
  checks.push(run('mobile-api-runtime', 'npm', ['run', 'check:mobile-api:runtime']))
  checks.push(run('mobile-web-cors', 'npm', ['run', 'check:mobile-web-cors']))
} else {
  console.warn('\nLIB_WEB_BASE_URL absent : checks runtime et CORS distants ignorés.')
}

const qaChecks = [
  ['mobile-auth', 'check:mobile-auth', Boolean(process.env.LIB_QA_EMAIL && process.env.LIB_QA_PASSWORD)],
  ['mobile-client-flow', 'check:mobile-client-flow', Boolean(process.env.LIB_QA_EMAIL_A && process.env.LIB_QA_PASSWORD_A && process.env.LIB_QA_EMAIL_B && process.env.LIB_QA_PASSWORD_B)],
  ['mobile-password-flow', 'check:mobile-password-flow', Boolean(process.env.LIB_QA_EMAIL && process.env.LIB_QA_PASSWORD && process.env.LIB_QA_CHANGED_PASSWORD && process.env.LIB_QA_RESET_PASSWORD && process.env.LIB_QA_RESET_TOKEN)],
]

for (const [name, script, configured] of qaChecks) {
  if (configured) {
    checks.push(run(name, 'npm', ['run', script], { required: strictQa }))
  } else {
    console.warn(`\n${name} ignoré : variables QA manquantes${strictQa ? ' (STRICT_QA=true le rend obligatoire)' : ''}.`)
    if (strictQa) checks.push({ name, code: 1, required: true })
  }
}

const failures = checks.filter((check) => check.required && check.code !== 0)
if (failures.length > 0) {
  console.error('\nReadiness mobile ÉCHEC : ' + failures.map((failure) => failure.name).join(', '))
  process.exit(1)
}

console.log('\nReadiness mobile OK pour les contrôles configurés.')
