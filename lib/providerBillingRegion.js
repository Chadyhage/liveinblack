// France (EUR/Stripe) + zone UEMOA FedaPay (XOF). Miroir serveur de
// src/data/regions.js \u2014 garder les deux align\u00e9s.
const BILLING_REGION_IDS = new Set([
  'france', 'togo', 'benin', 'cote-ivoire', 'senegal',
  'burkina-faso', 'mali', 'niger', 'guinee-bissau',
])
const XOF_BILLING_REGION_IDS = new Set([
  'togo', 'benin', 'cote-ivoire', 'senegal', 'burkina-faso', 'mali', 'niger', 'guinee-bissau',
])

export function normalizeProviderBillingRegion(value) {
  const token = String(typeof value === 'object' ? value?.id || value?.name || '' : value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s']+/g, '-')
    .trim()
    .toLowerCase()

  const aliases = {
    france: 'france', fr: 'france',
    togo: 'togo', tg: 'togo',
    benin: 'benin', bj: 'benin',
    'cote-divoire': 'cote-ivoire', 'cote-ivoire': 'cote-ivoire', ci: 'cote-ivoire',
    senegal: 'senegal', sn: 'senegal',
    'burkina-faso': 'burkina-faso', bf: 'burkina-faso',
    mali: 'mali', ml: 'mali',
    niger: 'niger', ne: 'niger',
    'guinee-bissau': 'guinee-bissau', gw: 'guinee-bissau',
  }
  const regionId = aliases[token] || ''
  return BILLING_REGION_IDS.has(regionId) ? regionId : ''
}

export function providerBillingCurrency(regionId) {
  return XOF_BILLING_REGION_IDS.has(normalizeProviderBillingRegion(regionId)) ? 'XOF' : 'EUR'
}
