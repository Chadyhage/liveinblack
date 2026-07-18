// Port TypeScript de lib/providerBillingRegion.js — dérive le PAYS DE
// FACTURATION prestataire (rail EUR/Stripe vs XOF/FedaPay) à partir de
// `regions` (lib/shared/regions.ts), source unique du champ `currency` (voir
// commentaire d'origine dans regions.ts). Ne PAS re-coder d'ensemble XOF
// ailleurs — providerBillingCurrency() est la seule fonction à consulter pour
// router un prestataire vers le bon rail de paiement.
import { regions } from './regions'

function normKey(value: unknown): string {
  const token = typeof value === 'object' && value !== null ? ((value as { id?: string; name?: string }).id ?? (value as { name?: string }).name ?? '') : value
  return String(token ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s']+/g, '-')
    .trim()
    .toLowerCase()
}

const BY_KEY = new Map<string, string>()
for (const r of regions) {
  for (const key of [r.id, r.code, r.name, r.country]) {
    BY_KEY.set(normKey(key), r.id)
  }
}

// Alias courts (indicatifs pays ISO-2) non déjà couverts par `regions[].code`.
const EXTRA_ALIASES: Record<string, string> = {
  fr: 'france', tg: 'togo', bj: 'benin', ci: 'cote-ivoire', sn: 'senegal',
  bf: 'burkina-faso', ml: 'mali', ne: 'niger', gw: 'guinee-bissau',
}

export function normalizeProviderBillingRegion(value: unknown): string {
  const key = normKey(value)
  return BY_KEY.get(key) || EXTRA_ALIASES[key] || ''
}

export function providerBillingCurrency(regionId: unknown): 'EUR' | 'XOF' {
  const id = normalizeProviderBillingRegion(regionId)
  const region = regions.find((r) => r.id === id)
  return region?.currency === 'XOF' ? 'XOF' : 'EUR'
}
