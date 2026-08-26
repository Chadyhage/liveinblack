#!/usr/bin/env node

const REQUIRED = [
  {
    key: 'PUBLIC_SITE_URL',
    label: 'URL canonique publique',
    validate: (value) => {
      try {
        const url = new URL(value)
        if (url.protocol !== 'https:') return 'doit utiliser https://'
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return 'ne doit pas pointer vers localhost'
        if (url.pathname !== '/' || url.search || url.hash) return 'doit contenir uniquement le domaine, sans chemin ni paramètres'
        return null
      } catch {
        return 'URL invalide'
      }
    },
  },
  {
    key: 'NEXT_PUBLIC_GA_MEASUREMENT_ID',
    label: 'Google Analytics 4',
    validate: (value) => (/^G-[A-Z0-9]{4,}$/.test(value) ? null : 'doit ressembler à un Measurement ID GA4, ex. G-XXXXXXXXXX'),
  },
  {
    key: 'GOOGLE_SITE_VERIFICATION',
    label: 'Google Search Console',
    validate: (value) => (value.length >= 16 ? null : 'jeton trop court ou incomplet'),
  },
  {
    key: 'BING_SITE_VERIFICATION',
    label: 'Bing Webmaster Tools',
    validate: (value) => (value.length >= 16 ? null : 'jeton trop court ou incomplet'),
  },
]

const PLACEHOLDER_PATTERNS = [
  /^$/,
  /^(todo|tbd|changeme|change-me|placeholder|example|test|demo)$/i,
  /xxxx/i,
]

const failures = []
const ok = []

for (const item of REQUIRED) {
  const value = (process.env[item.key] || '').trim()
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))) {
    failures.push(`${item.key}: ${item.label} absent ou valeur placeholder`)
    continue
  }

  const validationError = item.validate(value)
  if (validationError) {
    failures.push(`${item.key}: ${validationError}`)
    continue
  }

  ok.push(`${item.key}: configuré`)
}

if (failures.length > 0) {
  console.error(`Check SEO production KO — ${failures.length} problème(s)`)
  for (const failure of failures) console.error(`- ${failure}`)
  console.error('\nÀ faire avant la mise en production SEO : renseigner ces variables dans Vercel Production, puis redéployer.')
  process.exit(1)
}

for (const line of ok) console.log(line)
console.log('Check SEO production OK — Search Console, Bing, GA4 et URL canonique sont prêts côté environnement.')
