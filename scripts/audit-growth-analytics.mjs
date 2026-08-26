#!/usr/bin/env node
import { readFile } from 'node:fs/promises'

const checks = [
  {
    file: 'lib/client/growthAnalytics.ts',
    required: [
      '@vercel/analytics/react',
      'allowsAnalytics()',
      'gtag',
      'cta_click',
      'search_submit',
      'event_select_ticket',
      'checkout_start',
      'seat_hold_start',
      'professional_application_submit',
    ],
  },
  {
    file: 'app/components/layout/GrowthAnalytics.tsx',
    required: [
      'useSearchParams',
      'data-growth-event',
      'GROWTH_EVENT_NAMES.searchSubmit',
      'document.addEventListener',
      'trackGrowthEvent',
    ],
  },
  {
    file: 'app/layout.tsx',
    required: ['GrowthAnalytics', '<Suspense fallback={null}>'],
  },
  {
    file: 'app/components/features/events/EventCheckoutPanel.tsx',
    required: [
      'GROWTH_EVENT_NAMES.eventSelectTicket',
      'GROWTH_EVENT_NAMES.checkoutStart',
      'GROWTH_EVENT_NAMES.seatHoldStart',
      'event_id: eventId',
      'ticket_type: selectedPlace.type',
    ],
  },
  {
    file: 'app/(public)/home/page.tsx',
    required: [
      'data-growth-event="cta_click"',
      'data-growth-surface="home_hero"',
      'data-growth-surface="home_final"',
      'data-growth-target="organizer_signup"',
      'data-growth-target="provider_signup"',
    ],
  },
  {
    file: 'app/components/features/organizer/OrganizerOnboardingWizard.tsx',
    required: [
      'GROWTH_EVENT_NAMES.professionalApplicationSubmit',
      "role: 'organisateur'",
      'has_documents:',
    ],
  },
  {
    file: 'app/components/features/provider/PrestataireOnboardingWizard.tsx',
    required: [
      'GROWTH_EVENT_NAMES.professionalApplicationSubmit',
      "role: 'prestataire'",
      'provider_type:',
      'has_documents:',
    ],
  },
]

const failures = []

for (const check of checks) {
  let source
  try {
    source = await readFile(check.file, 'utf8')
  } catch (error) {
    failures.push(`${check.file}: fichier illisible (${error.message})`)
    continue
  }

  for (const snippet of check.required) {
    if (!source.includes(snippet)) failures.push(`${check.file}: signal analytics manquant « ${snippet} »`)
  }
}

if (failures.length > 0) {
  console.error(`Audit analytics croissance KO — ${failures.length} problème(s)`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Audit analytics croissance OK — ${checks.length} fichiers critiques vérifiés.`)
