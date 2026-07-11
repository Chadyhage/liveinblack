// France (EUR/Stripe) + zone UEMOA FedaPay (XOF). D\u00c9RIV\u00c9 de src/data/regions.js
// (champ currency) \u2014 plus de liste re-cod\u00e9e qui pourrait diverger de la source.
import { regions } from '../src/data/regions.js'

const BILLING_REGION_IDS = new Set(regions.map(r => r.id))
const XOF_BILLING_REGION_IDS = new Set(regions.filter(r => r.currency === 'XOF').map(r => r.id))

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
