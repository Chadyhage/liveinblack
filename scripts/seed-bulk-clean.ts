// Supprime tout ce que scripts/seed-bulk.ts a créé, sans toucher aux comptes
// nommés de scripts/seed-dev.ts (@liveinblack.dev) ni aux données réelles.
// Repère les comptes par domaine @seed-bulk.dev, puis purge en cascade tout
// ce qui leur est rattaché (profils, événements, billets, avis, boosts).
import { getDb } from '../lib/db/mongoose'
import User from '../lib/models/User'
import Event from '../lib/models/Event'
import ProviderProfile from '../lib/models/ProviderProfile'
import OrganizerProfile from '../lib/models/OrganizerProfile'
import Ticket from '../lib/models/Ticket'
import Review from '../lib/models/Review'
import Boost from '../lib/models/Boost'

async function main() {
  await getDb()

  const users = await User.find({ email: { $regex: /@seed-bulk\.dev$/ } }, { _id: 1 }).lean()
  const userIds = users.map((u) => String(u._id))

  const events = await Event.find({ createdBy: { $in: userIds } }, { _id: 1 }).lean()
  const eventIds = events.map((e) => String(e._id))

  const [tickets, reviews, boosts, providerProfiles, organizerProfiles, deletedUsers, deletedEvents] = await Promise.all([
    Ticket.deleteMany({ $or: [{ eventId: { $in: eventIds } }, { userId: { $in: userIds } }] }),
    Review.deleteMany({ $or: [{ providerId: { $in: userIds } }, { authorId: { $in: userIds } }] }),
    Boost.deleteMany({ $or: [{ eventId: { $in: eventIds } }, { userId: { $in: userIds } }] }),
    ProviderProfile.deleteMany({ userId: { $in: userIds } }),
    OrganizerProfile.deleteMany({ userId: { $in: userIds } }),
    User.deleteMany({ _id: { $in: userIds } }),
    Event.deleteMany({ _id: { $in: eventIds } }),
  ])

  console.log('Seed bulk nettoyé.')
  console.log(`  - comptes supprimés: ${deletedUsers.deletedCount}`)
  console.log(`  - événements supprimés: ${deletedEvents.deletedCount}`)
  console.log(`  - billets supprimés: ${tickets.deletedCount}`)
  console.log(`  - avis supprimés: ${reviews.deletedCount}`)
  console.log(`  - boosts supprimés: ${boosts.deletedCount}`)
  console.log(`  - profils prestataire supprimés: ${providerProfiles.deletedCount}`)
  console.log(`  - profils organisateur supprimés: ${organizerProfiles.deletedCount}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
