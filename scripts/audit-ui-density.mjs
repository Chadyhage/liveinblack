#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const MAX_PRIVATE_GRID_MIN_WIDTH = 260
const SCANNED_CSS_ROOTS = [
  'app/(public)/_components',
  'app/(app)',
  'app/components/features/agent',
  'app/components/features/account',
  'app/components/features/provider',
]
const SCANNED_TSX_ROOTS = [
  'app/(public)/contact',
  'app/(public)/home',
  'app/(public)/login',
  'app/(app)/profile',
  'app/(app)/on-site-sales',
  'app/(app)/organizer-studio',
  'app/components/features/provider',
]

const checks = [
  {
    file: 'app/globals.css',
    description: 'tokens globaux de densité et primitives compactes partagées',
    required: [
      '--density-action-min: 44px',
      '--density-card-min: 180px',
      '--density-card-min-compact: 148px',
      '--density-dashboard-card-min: 200px',
      '--density-list-card-min: 230px',
      '--density-panel-padding: clamp(14px, 1.6vw, 20px)',
      'repeat(auto-fill, minmax(min(100%, var(--density-card-min)), 1fr))',
      'repeat(auto-fill, minmax(var(--density-card-min-compact), 1fr))',
      'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
    ],
  },
  {
    file: 'app/(app)/notifications/NotificationsClient.module.css',
    description: 'notifications compactes et grille multi-cartes',
    required: [
      'width: min(100%, 1540px)',
      'grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))',
      'min-height: 62px',
      'font-size: 11px',
    ],
  },
  {
    file: 'app/(app)/messages/MessagesClient.module.css',
    description: 'messagerie compacte et lisible sur les écrans desktop',
    required: [
      'width: clamp(244px, 18vw, 292px) !important',
      'min-height: 34px !important',
      'min-height: 36px !important',
      'scroll-margin-block: 46px',
    ],
  },
  {
    file: 'app/(app)/messages/MessagesClient.tsx',
    description: 'avatars et espacements de messagerie compacts',
    required: [
      'const conversationAvatarSize = 34',
      "padding: '10px 12px'",
      "padding: '8px 0 4px'",
      "padding: '8px 12px'",
    ],
  },
  {
    file: 'app/(public)/blog/blog.module.css',
    description: 'blog public dense pour exposer davantage d’articles SEO',
    required: [
      'grid-template-columns:repeat(auto-fill,minmax(210px,1fr))',
      'aspect-ratio:16/7.2',
      'font-size:clamp(13.5px,1vw,16px)',
    ],
  },
  {
    file: 'app/(public)/blog/page.tsx',
    description: 'pagination blog plus riche pour les 100 articles SEO',
    required: [
      'const PAGE_SIZE = 24',
      'loading={index < 4 ?',
      '(max-width:1440px) 24vw',
    ],
  },
  {
    file: 'app/(public)/events/events.module.css',
    description: 'catalogue événements public dense',
    required: [
      'grid-template-columns:repeat(auto-fill,minmax(220px,1fr))',
      'Catalogue dense : plus de découvertes visibles',
    ],
  },
  {
    file: 'app/(public)/organizers/organizers.module.css',
    description: 'annuaire organisateurs public dense',
    required: [
      'grid-template-columns:repeat(auto-fill,minmax(210px,1fr))',
      'Annuaire dense : 24 organisateurs',
    ],
  },
  {
    file: 'app/(public)/providers/providers.module.css',
    description: 'annuaire prestataires public dense',
    required: [
      'grid-template-columns:repeat(auto-fill,minmax(210px,1fr))',
      'Annuaire dense : mêmes proportions',
    ],
  },
  {
    file: 'app/(public)/providers/page.tsx',
    description: 'pagination prestataires alignée avec les vitrines SEO',
    required: [
      'pageSize: 24',
      'eager={index < 4}',
    ],
  },
  {
    file: 'app/(public)/search/search.module.css',
    description: 'recherche publique dense et lisible',
    required: [
      'grid-template-columns:repeat(auto-fill,minmax(210px,1fr))',
      'min-height:54px',
      'Recherche dense : les résultats',
    ],
  },
  {
    file: 'app/(public)/search/SearchClient.tsx',
    description: 'placeholders de recherche adaptés à la grille dense',
    required: [
      'Array.from({ length: 8 })',
    ],
  },
  {
    file: 'app/(public)/contact/ContactClient.tsx',
    description: 'contact public compact pour garder le formulaire et les infos visibles',
    required: [
      "gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))'",
      "padding: '16px 14px'",
      'size={104}',
      'gap: 10',
    ],
  },
  {
    file: 'app/(public)/home/home.module.css',
    description: 'hero home large, autour de deux tiers de hauteur d’écran',
    required: [
      'min-height: clamp(520px, 66svh, 760px)',
      'padding: clamp(44px, 7vh, 88px)',
      'min-height: clamp(540px, 68svh, 640px)',
    ],
  },
  {
    file: 'app/(public)/home/page.tsx',
    description: 'accueil public compact sur les sections conversion',
    required: [
      "gridTemplateColumns: 'repeat(auto-fit, minmax(230px,1fr))'",
      'gap: 14',
      'gap: 12',
      'padding: 18',
    ],
  },
  {
    file: 'app/(public)/_components/AuthSplitLayout.module.css',
    description: 'layout auth compact pour login et inscriptions',
    required: [
      'grid-template-columns: minmax(220px, .58fr) minmax(360px, 1.42fr)',
      'min-height: 320px',
      'font-size: clamp(22px, 2.35vw, 32px)',
      'padding: clamp(10px, 1.8vh, 22px) 0',
      'grid-template-columns: minmax(220px, .54fr) minmax(400px, 1.46fr)',
    ],
  },
  {
    file: 'app/(public)/login/page.tsx',
    description: 'fallback login moins haut',
    required: [
      'minHeight: 220',
    ],
  },
  {
    file: 'app/(public)/login/AuthForm.tsx',
    description: 'formulaire auth compact et plus visible en un écran',
    required: [
      'marginBottom: 16',
      "style={{ marginBottom: 16 }}",
      "padding: '9px 12px'",
      'minHeight: 56',
      "contentStyle={{ padding: '22px 20px' }}",
    ],
  },
  {
    file: 'app/(app)/my-events/BookingsPanel.module.css',
    description: 'panneau réservations organisateur dense',
    required: [
      'grid-template-columns:repeat(auto-fit,minmax(118px,1fr))',
      'grid-template-columns:repeat(auto-fill,minmax(150px,1fr))',
      'grid-template-columns:repeat(auto-fill,minmax(230px,1fr))',
      'Feuille réservations dense',
    ],
  },
  {
    file: 'app/(app)/scanner/[eventId]/ScannerClient.module.css',
    description: 'scanner et service terrain compacts',
    required: [
      'minmax(260px, 0.78fr)',
      'minmax(260px, 0.72fr)',
      'min-height: 240px',
      'minmax(170px, .48fr)',
    ],
  },
  {
    file: 'app/(app)/on-site-sales/[eventId]/AgentSalesClient.tsx',
    description: 'vente sur place dense pour agents',
    required: [
      "const CARD_STYLE: React.CSSProperties = { padding: '10px 12px'",
      "padding: '14px clamp(10px, 1.4vw, 18px) 56px'",
      "gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))'",
      "gridTemplateColumns: 'repeat(3, minmax(0, 1fr))'",
    ],
  },
  {
    file: 'app/(app)/profile/TicketWallet.tsx',
    description: 'portefeuille billets dense pour voir plus d’accès par écran',
    required: [
      'const GROUP_PAGE_SIZE = 18',
      'ticket-wallet-section-grid',
      'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
      "gridTemplateColumns: 'minmax(0,1fr) 112px'",
      "minHeight: 112",
    ],
  },
  {
    file: 'app/(app)/profile/followed-organizers/FollowedOrganizersClient.tsx',
    description: 'organisateurs suivis compacts et paginés plus largement',
    required: [
      'const PAGE_SIZE = 24',
      'repeat(auto-fill, minmax(min(100%, 220px), 1fr))',
      'repeat(auto-fill, minmax(160px,1fr))',
      "style={{ padding: 12 }}",
    ],
  },
  {
    file: 'app/(app)/organizer-studio/StudioClient.tsx',
    description: 'studio organisateur compact et cohérent avec les autres pages connectées',
    required: [
      'minmax(240px, 0.62fr)',
      "gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'",
      "gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'",
      "gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))'",
      "gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'",
      "minHeight: 38",
      "padding: 11",
    ],
  },
  {
    file: 'app/components/features/provider/ProviderReviewsClient.tsx',
    description: 'avis prestataire compacts pour exposer plus de retours par écran',
    required: [
      'minHeight: 38',
      "gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'",
      'padding: 12',
      'lineHeight: 1.5',
    ],
  },
  {
    file: 'app/components/features/agent/AgentDashboardClient.module.css',
    description: 'dashboard agent dense sur desktop',
    required: [
      '@media (min-width: 980px)',
      '.actionGrid { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }',
      '.bentoGrid',
      'grid-template-columns: repeat(3, minmax(0, 1fr))',
      'min-height: 172px',
    ],
  },
  {
    file: 'app/components/features/agent/AgentDashboardClient.tsx',
    description: 'graphiques agent moins hauts',
    required: ['height={180}', 'size={160}'],
  },
  {
    file: 'app/(app)/agent/agent.module.css',
    description: 'listes agent adaptatives',
    required: [
      'repeat(auto-fit,minmax(260px,1fr))',
      'repeat(auto-fill,minmax(235px,1fr))',
      'repeat(auto-fill,minmax(220px,1fr))',
    ],
  },
  {
    file: 'app/components/features/agent/AgentDossiersClient.module.css',
    description: 'dossiers agent au moins 3 cartes par ligne quand l’espace le permet',
    required: ['repeat(auto-fit,minmax(230px,1fr))', 'min-height:72px'],
  },
  {
    file: 'app/components/features/agent/AgentEventsClient.module.css',
    description: 'événements agent au moins 3 cartes par ligne quand l’espace le permet',
    required: ['repeat(auto-fit,minmax(230px,1fr))', 'min-height:72px'],
  },
  {
    file: 'app/components/features/agent/AgentUsersClient.module.css',
    description: 'comptes agent au moins 3 cartes par ligne quand l’espace le permet',
    required: ['repeat(auto-fit,minmax(230px,1fr))', 'min-height: 72px'],
  },
]

const failures = []

async function listFilesByExtension(dir, extension) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await listFilesByExtension(path, extension))
    if (entry.isFile() && path.endsWith(extension)) files.push(path)
  }

  return files
}

for (const check of checks) {
  let source
  try {
    source = await readFile(check.file, 'utf8')
  } catch (error) {
    failures.push(`${check.file}: fichier illisible (${error.message})`)
    continue
  }

  for (const snippet of check.required) {
    if (!source.includes(snippet)) {
      failures.push(`${check.file}: ${check.description} — signal manquant « ${snippet} »`)
    }
  }
}

const cssFilesToScan = new Set()
for (const root of SCANNED_CSS_ROOTS) {
  try {
    for (const file of await listFilesByExtension(root, '.css')) cssFilesToScan.add(file)
  } catch (error) {
    failures.push(`${root}: scan CSS impossible (${error.message})`)
  }
}

const denseGridPattern = /grid-template-columns:\s*repeat\((auto-fit|auto-fill),\s*minmax\((?:min\(100%,\s*)?(\d+)px/g
for (const file of cssFilesToScan) {
  const source = await readFile(file, 'utf8')
  let match
  while ((match = denseGridPattern.exec(source))) {
    const minWidth = Number(match[2])
    if (minWidth > MAX_PRIVATE_GRID_MIN_WIDTH) {
      failures.push(`${file}: grille privée trop large (${minWidth}px > ${MAX_PRIVATE_GRID_MIN_WIDTH}px) — utiliser les tokens --density-* ou une grille compacte`)
    }
  }
}

const tsxFilesToScan = new Set()
for (const root of SCANNED_TSX_ROOTS) {
  try {
    for (const file of await listFilesByExtension(root, '.tsx')) tsxFilesToScan.add(file)
  } catch (error) {
    failures.push(`${root}: scan TSX impossible (${error.message})`)
  }
}

const inlineDenseGridPattern = /gridTemplateColumns:\s*['"`]repeat\((auto-fit|auto-fill),\s*minmax\((?:min\(100%,\s*)?(\d+)px/g
for (const file of tsxFilesToScan) {
  const source = await readFile(file, 'utf8')
  let match
  while ((match = inlineDenseGridPattern.exec(source))) {
    const minWidth = Number(match[2])
    if (minWidth > MAX_PRIVATE_GRID_MIN_WIDTH) {
      failures.push(`${file}: grille inline trop large (${minWidth}px > ${MAX_PRIVATE_GRID_MIN_WIDTH}px) — réduire les cartes pour afficher plus d’éléments`)
    }
  }
}

if (failures.length > 0) {
  console.error(`Audit densité UI KO — ${failures.length} problème(s)`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Audit densité UI OK — ${checks.length} zones critiques vérifiées.`)
