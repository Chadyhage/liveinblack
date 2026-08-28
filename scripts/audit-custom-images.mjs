#!/usr/bin/env node
import { access, readFile, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'

const requiredAssets = [
  '/images/live-in-black/about-nightlife-planning.png',
  '/images/live-in-black/about-tab-client-ticket-friends.png',
  '/images/live-in-black/about-tab-organizer-sales-tablet.png',
  '/images/live-in-black/about-tab-provider-side-stage.png',
  '/images/live-in-black/account-secure-ticket-wallet.png',
  '/images/live-in-black/ambient-afro-percussion-haze.png',
  '/images/live-in-black/ambient-house-disco-grid.png',
  '/images/live-in-black/ambient-lofi-vinyl-lounge.png',
  '/images/live-in-black/ambient-nuit-rooftop-moon.png',
  '/images/live-in-black/ambient-techno-laser-tunnel.png',
  '/images/live-in-black/auth-client-login-entrance.png',
  '/images/live-in-black/auth-client-ticket-entry.png',
  '/images/live-in-black/auth-confirm-email-devices.png',
  '/images/live-in-black/auth-organizer-backstage-ops.png',
  '/images/live-in-black/auth-provider-av-dj-team.png',
  '/images/live-in-black/auth-reset-secure-email.png',
  '/images/live-in-black/auth-verify-email-lounge.png',
  '/images/live-in-black/blog-editorial-benin-nightlife.png',
  '/images/live-in-black/contact-support-lounge.png',
  '/images/live-in-black/dashboard-client-ticket-wallet.png',
  '/images/live-in-black/dashboard-organizer-ops-map.png',
  '/images/live-in-black/dashboard-provider-workspace.png',
  '/images/live-in-black/directory-events-vip-entry.png',
  '/images/live-in-black/directory-organizers-guestlist.png',
  '/images/live-in-black/directory-providers-production.png',
  '/images/live-in-black/home-card-event-live-band.png',
  '/images/live-in-black/home-card-event-palms.png',
  '/images/live-in-black/home-card-event-rooftop-dj.png',
  '/images/live-in-black/home-card-provider-crew.png',
  '/images/live-in-black/home-card-provider-dj-booth.png',
  '/images/live-in-black/home-card-provider-photo-gear.png',
  '/images/live-in-black/home-hero-cotonou-nightlife.png',
  '/images/live-in-black/home-hero-live-entry.png',
  '/images/live-in-black/home-hero-rooftop-arrival.png',
  '/images/live-in-black/home-split-organizer-control.png',
  '/images/live-in-black/home-split-provider-crew.png',
  '/images/live-in-black/home-step-discover-cotonou.png',
  '/images/live-in-black/home-step-qr-entry.png',
  '/images/live-in-black/home-step-reserve-mobile.png',
  '/images/live-in-black/legal-privacy-secure-docs.png',
  '/images/live-in-black/placeholder-event-dancefloor.png',
  '/images/live-in-black/placeholder-organizer-rooftop.png',
  '/images/live-in-black/placeholder-provider-equipment.png',
  '/images/live-in-black/route-blog-editorial-desk.png',
  '/images/live-in-black/route-boost-active-spotlight.png',
  '/images/live-in-black/route-cookies-consent-glass.png',
  '/images/live-in-black/route-events-scanner-gates.png',
  '/images/live-in-black/route-home-night-boulevard.png',
  '/images/live-in-black/route-legal-notice-signature.png',
  '/images/live-in-black/route-organizers-vip-table.png',
  '/images/live-in-black/route-payment-success-confetti.png',
  '/images/live-in-black/route-privacy-secure-vault.png',
  '/images/live-in-black/route-providers-equipment-corridor.png',
  '/images/live-in-black/route-terms-contract-table.png',
  '/images/live-in-black/success-ticket-confirmation.png',
]

const forbiddenLegacyAssets = [
  '/images/live-in-black/hero-nightlife.jpg',
  '/images/live-in-black/auth-community.jpg',
  '/images/live-in-black/auth-organizer.jpg',
  '/images/live-in-black/auth-provider.jpg',
  '/images/live-in-black/journey-discover.jpg',
  '/images/live-in-black/journey-reserve.jpg',
  '/images/live-in-black/journey-enter.jpg',
]

const sourceRoots = ['app', 'lib']
const sourceFilePattern = /\.(tsx?|jsx?|css|mjs|cjs|json)$/
const liveInBlackAssetPattern = /\/images\/live-in-black\/[^'"`\s)]+/g

const failures = []
const runtimeReferences = new Map()

for (const asset of requiredAssets) {
  const filePath = `public${asset}`
  try {
    await access(filePath, constants.R_OK)
  } catch {
    failures.push(`${filePath}: image sur mesure manquante`)
  }
}

async function visit(path) {
  const info = await stat(path)
  if (info.isDirectory()) {
    const entries = await readdir(path)
    await Promise.all(entries.map((entry) => visit(`${path}/${entry}`)))
    return
  }
  if (!sourceFilePattern.test(path)) return
  const source = await readFile(path, 'utf8')

  for (const asset of forbiddenLegacyAssets) {
    if (source.includes(asset)) {
      failures.push(`${path}: ancienne image generique encore referencee ${asset}`)
    }
  }

  let match
  while ((match = liveInBlackAssetPattern.exec(source))) {
    const asset = match[0]
    const line = source.slice(0, match.index).split('\n').length
    const locations = runtimeReferences.get(asset) ?? []
    locations.push(`${path}:${line}`)
    runtimeReferences.set(asset, locations)
  }
}

await Promise.all(sourceRoots.map((root) => visit(root)))

for (const [asset, locations] of [...runtimeReferences.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  if (!requiredAssets.includes(asset)) {
    failures.push(`${asset}: image LIVEINBLACK referencee mais absente de la liste d'audit`)
  }
  if (locations.length > 1) {
    failures.push(`${asset}: image reutilisee dans l'app (${locations.join(', ')})`)
  }
}

const uniqueAssets = new Set(requiredAssets)
if (uniqueAssets.size !== requiredAssets.length) {
  failures.push('La liste des assets contient des doublons')
}

if (failures.length > 0) {
  console.error(`Audit images sur mesure KO - ${failures.length} probleme(s)`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Audit images sur mesure OK - ${requiredAssets.length} assets presents, aucune image legacy, aucun doublon runtime.`)
