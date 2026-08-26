#!/usr/bin/env node
import { readFile } from 'node:fs/promises'

const checks = [
  {
    file: 'app/(app)/notifications/NotificationsClient.module.css',
    description: 'notifications compactes et grille multi-cartes',
    required: [
      'width: min(100%, 1480px)',
      'grid-template-columns: repeat(auto-fill, minmax(255px, 1fr))',
      'min-height: 74px',
      'font-size: 11.5px',
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

if (failures.length > 0) {
  console.error(`Audit densité UI KO — ${failures.length} problème(s)`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Audit densité UI OK — ${checks.length} zones critiques vérifiées.`)
