import fs from 'node:fs'
import path from 'node:path'

const mobileRoot = path.resolve(process.cwd(), '../LIB_Mobile')
const easPath = path.join(mobileRoot, 'eas.json')
const config = JSON.parse(fs.readFileSync(easPath, 'utf8'))
const productionUrl = config?.build?.production?.env?.EXPO_PUBLIC_API_BASE_URL

const failures = []
if (productionUrl !== 'https://liveinblack.com') {
  failures.push(`Le profil EAS production pointe vers ${productionUrl || 'aucune URL'} au lieu de https://liveinblack.com.`)
}
if (typeof productionUrl === 'string' && (/localhost|127\.0\.0\.1/.test(productionUrl) || /-dev\.|vercel\.app/.test(productionUrl))) {
  failures.push('Le profil EAS production utilise un domaine local, de développement ou de preview.')
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure)
  process.exit(1)
}

console.log(`Configuration APK production : OK (${productionUrl}).`)
