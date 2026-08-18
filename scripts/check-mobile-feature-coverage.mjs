import fs from 'node:fs'
import path from 'node:path'

const webRoot = process.cwd()
const mobileRoot = path.resolve(webRoot, '../LIB_Mobile')

function exists(root, relative) {
  return fs.existsSync(path.join(root, relative))
}

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8')
}

function walk(root, relative) {
  const absolute = path.join(root, relative)
  if (!fs.existsSync(absolute)) return []
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(relative, entry.name)
    if (entry.isDirectory()) return walk(root, item)
    return /\.(ts|tsx)$/.test(entry.name) ? [item] : []
  })
}

const mobileFiles = walk(mobileRoot, 'app')
const mobileLibFiles = walk(mobileRoot, 'lib')
const apiRouteFiles = walk(webRoot, 'app/api')
const failures = []

function hasAny(root, files, patterns) {
  return files.some((file) => {
    const text = read(root, file)
    return patterns.some((pattern) => pattern.test(text) || pattern.test(file))
  })
}

function fail(message) {
  failures.push(message)
}

const domains = [
  {
    name: 'Découverte événements',
    designKeywords: ['Découverte', 'événements'],
    screens: ['app/(tabs)/index.tsx', 'app/(tabs)/search.tsx', 'app/event/[id].tsx'],
    libs: ['lib/events.ts', 'lib/recommendations.ts', 'lib/recommendationsApi.ts'],
    routes: ['app/api/events/route.ts', 'app/api/events/[eventId]/route.ts', 'app/api/search/route.ts'],
    signals: [/fetchPublicEventsPage/, /fetchEventById/, /getRecommendedEvents/],
  },
  {
    name: 'Authentification et compte',
    designKeywords: ['Authentification', 'Profil'],
    screens: ['app/login.tsx', 'app/settings.tsx', 'app/reset-password.tsx', 'app/verify-email.tsx'],
    libs: ['lib/api.ts', 'lib/authApi.ts', 'lib/authScreensApi.ts', 'lib/settings.ts'],
    routes: ['app/api/auth/[...nextauth]/route.ts', 'app/api/auth/register/route.ts', 'app/api/profil/route.ts'],
    signals: [/signInWithCredentials/, /register/, /requestPasswordReset/, /updatePassword/],
  },
  {
    name: 'Billetterie et checkout',
    designKeywords: ['Billets', 'paiements'],
    screens: ['app/(tabs)/tickets.tsx', 'app/checkout/[eventId].tsx', 'app/order/[eventId]/[ticketCode].tsx'],
    libs: ['lib/tickets.ts', 'lib/checkout.ts', 'lib/eventOrders.ts'],
    routes: ['app/api/tickets/mine/route.ts', 'app/api/checkout/route.ts', 'app/api/event-orders/materialize/route.ts'],
    signals: [/fetchMyTickets/, /startCheckout/, /materializeEventOrder/],
  },
  {
    name: 'Social et messagerie',
    designKeywords: ['Social'],
    screens: ['app/(tabs)/messages.tsx', 'app/conversation/[id].tsx', 'app/friends.tsx', 'app/new-group.tsx'],
    libs: ['lib/messaging.ts', 'lib/friends.ts', 'lib/groups.ts'],
    routes: ['app/api/conversations/route.ts', 'app/api/conversations/[conversationId]/messages/route.ts', 'app/api/friends/route.ts'],
    signals: [/fetchConversations/, /sendMessage/, /fetchFriends/, /createGroupConversation/],
  },
  {
    name: 'Organisateur',
    designKeywords: ['organisateur'],
    screens: ['app/spaces/organizer.tsx', 'app/spaces/organizer/new.tsx', 'app/spaces/organizer/[eventId].tsx'],
    libs: ['lib/organizerEvents.ts', 'lib/organizerProfile.ts', 'lib/organizerPayouts.ts'],
    routes: ['app/api/organizer-events/route.ts', 'app/api/organizers/me/route.ts', 'app/api/organizers/me/payouts/route.ts'],
    signals: [/fetchOrganizerEvents/, /createOrganizerEvent/, /fetchOrganizerProfile/, /requestPayout/],
  },
  {
    name: 'Prestataire',
    designKeywords: ['prestataire'],
    screens: ['app/spaces/provider.tsx', 'app/spaces/provider-reviews.tsx', 'app/provider/[id].tsx'],
    libs: ['lib/providerProfile.ts', 'lib/providerSubscription.ts', 'lib/reviews.ts'],
    routes: ['app/api/providers/me/route.ts', 'app/api/providers/me/reviews/route.ts', 'app/api/subscriptions/route.ts'],
    signals: [/fetchProviderProfile/, /fetchProviderReviews/, /fetchSubscription/],
  },
  {
    name: 'Agent/admin',
    designKeywords: ['agent'],
    screens: ['app/spaces/agent.tsx', 'app/spaces/agent/users.tsx', 'app/spaces/agent/events.tsx'],
    libs: ['lib/agentUsers.ts', 'lib/agentEvents.ts', 'lib/agentPayments.ts'],
    routes: ['app/api/agent/users/route.ts', 'app/api/agent/events/route.ts', 'app/api/agent/payments/refunds/route.ts'],
    signals: [/fetchAgentUsers/, /fetchAgentEvents/, /fetchAgentRefunds/],
  },
  {
    name: 'Scanner et staff',
    designKeywords: ['scanner'],
    screens: ['app/scanner.tsx', 'app/my-shifts.tsx', 'app/agent-sales/[eventId].tsx'],
    libs: ['lib/checkin.ts', 'lib/myShifts.ts', 'lib/agentSales.ts'],
    routes: ['app/api/tickets/checkin/route.ts', 'app/api/my-staffed-events/route.ts', 'app/api/agent-sales/[eventId]/sell/route.ts'],
    signals: [/checkInTicket/, /fetchMyStaffedEvents/, /sellTicketAtDoor/],
  },
  {
    name: 'Préférences, régions et recommandations',
    designKeywords: ['Préférences', 'région'],
    screens: ['app/preferences.tsx', 'app/interested-events.tsx', 'app/followed-organizers.tsx'],
    libs: ['lib/preferences.ts', 'lib/regions.ts', 'lib/organizerFollows.ts'],
    routes: ['app/api/profil/preferences/route.ts', 'app/api/profil/evenements-interesses/route.ts', 'app/api/organizers/followed/route.ts'],
    signals: [/fetchPreferences/, /KNOWN_REGIONS/, /followOrganizer/],
  },
]

for (const domain of domains) {
  for (const screen of domain.screens) {
    if (!exists(mobileRoot, screen)) fail(`${domain.name}: écran mobile manquant ${screen}`)
  }
  for (const lib of domain.libs) {
    if (!exists(mobileRoot, lib)) fail(`${domain.name}: client mobile manquant ${lib}`)
  }
  for (const route of domain.routes) {
    if (!exists(webRoot, route)) fail(`${domain.name}: route API backend manquante ${route}`)
  }
  if (!hasAny(mobileRoot, [...domain.screens, ...domain.libs].filter((file) => exists(mobileRoot, file)), domain.signals)) {
    fail(`${domain.name}: aucun signal d’implémentation mobile détecté`)
  }
}

const designSpec = exists(mobileRoot, 'DESIGN_SPEC.md') ? read(mobileRoot, 'DESIGN_SPEC.md') : ''
for (const domain of domains) {
  if (!domain.designKeywords.some((keyword) => designSpec.toLowerCase().includes(keyword.toLowerCase()))) {
    fail(`${domain.name}: domaine absent du design spec mobile`)
  }
}

if (failures.length > 0) {
  console.error(`Couverture fonctionnelle mobile : ÉCHEC (${failures.length} problème${failures.length > 1 ? 's' : ''}).`)
  for (const failure of failures) console.error('- ' + failure)
  process.exit(1)
}

console.log(`Couverture fonctionnelle mobile : OK (${domains.length} domaines, ${mobileFiles.length} écrans, ${mobileLibFiles.length} clients, ${apiRouteFiles.length} routes API).`)
