import { regions } from './regions'

// Port du calcul "payoutGaps"/"payoutGapLabel" de MesEvenementsPage.jsx (#7
// phase organisateur) — bannière du tableau de bord signalant qu'un
// organisateur a des événements ACTIFS (non annulés) dont la recette
// resterait en attente faute d'un moyen d'encaissement configuré : compte
// Stripe Connect (événements EUR) et/ou numéro Mobile Money du pays
// concerné (événements XOF, un numéro par pays UEMOA).

export interface PayoutGapEvent {
  currency: 'EUR' | 'XOF'
  region: string
  cancelled: boolean
}

export interface PayoutGapInputs {
  stripeChargesEnabled: boolean
  momos: Record<string, string>
}

export function computePayoutGapLabel(events: PayoutGapEvent[], inputs: PayoutGapInputs): string {
  const active = events.filter((e) => !e.cancelled)

  const needsStripe = active.some((e) => e.currency === 'EUR') && !inputs.stripeChargesEnabled

  const missingMomoCountries = new Set<string>()
  for (const e of active) {
    if (e.currency !== 'XOF') continue
    const region = regions.find((r) => r.name === e.region || r.id === e.region)
    const momoCountry = region?.momoCountry
    if (momoCountry && !inputs.momos[momoCountry]) missingMomoCountries.add(momoCountry)
  }

  const parts: string[] = []
  if (needsStripe) parts.push('ton compte bancaire (événements en euros)')
  for (const country of missingMomoCountries) {
    const region = regions.find((r) => r.momoCountry === country)
    parts.push(`un numéro Mobile Money pour ${region?.name || country}`)
  }
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`
}
