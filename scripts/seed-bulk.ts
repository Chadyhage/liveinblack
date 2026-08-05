// Volume de données réaliste pour tester l'app "comme en prod" (listes
// longues, pagination visuelle, recherche/filtres avec vraiment du choix,
// stats non-vides). Complémentaire à `scripts/seed-dev.ts` (comptes de test
// nommés, scénarios précis) : celui-ci ne supprime RIEN de ce que seed-dev a
// créé, il ajoute par-dessus — les deux scripts peuvent être lancés dans
// n'importe quel ordre, y compris plusieurs fois (les comptes/events créés
// ici portent un domaine dédié @seed-bulk.dev, jamais réutilisé ailleurs,
// pour rester nettoyables : `npm run seed:bulk:clean`).
// Usage : npm run seed:bulk (nécessite MONGODB_URI dans .env.local, jamais
// une base de prod). --count=N pour changer le nombre d'événements (défaut 100).
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { HydratedDocument } from 'mongoose'
import { getDb } from '../lib/db/mongoose'
import User from '../lib/models/User'
import Event from '../lib/models/Event'
import ProviderProfile from '../lib/models/ProviderProfile'
import OrganizerProfile, { type OrganizerProfileDoc } from '../lib/models/OrganizerProfile'
import Ticket from '../lib/models/Ticket'
import Review from '../lib/models/Review'
import Boost from '../lib/models/Boost'
import { generateUniqueTicketCode } from '../lib/server/ticketCode'

const BULK_DOMAIN = '@seed-bulk.dev'
const DEV_PASSWORD = 'DevTest1234!'

const EVENT_COUNT = Number(process.argv.find((a) => a.startsWith('--count='))?.split('=')[1] || 100)

const REGIONS = [
  { id: 'togo', name: 'Togo', cities: ['Lomé', 'Kara', 'Sokodé'], currency: 'XOF' as const },
  { id: 'benin', name: 'Bénin', cities: ['Cotonou', 'Porto-Novo', 'Parakou'], currency: 'XOF' as const },
  { id: 'cote-ivoire', name: 'Côte d’Ivoire', cities: ['Abidjan', 'Yamoussoukro', 'Bouaké'], currency: 'XOF' as const },
  { id: 'senegal', name: 'Sénégal', cities: ['Dakar', 'Thiès', 'Saint-Louis'], currency: 'XOF' as const },
  { id: 'france', name: 'France', cities: ['Paris', 'Lyon', 'Marseille'], currency: 'EUR' as const },
]

const CATEGORIES = ['Afrobeat', 'Amapiano', 'House', 'Techno', 'Hip-Hop', 'Dancehall', 'Coupé-décalé', 'Live band', 'RnB', 'Latino']

const VENUE_WORDS = ['Club', 'Rooftop', 'Loft', 'Villa', 'Warehouse', 'Beach Lounge', 'Terrasse', 'Salle']
const VENUE_NAMES = ['Oxygène', 'Éclipse', 'Mirage', 'Zenith', 'Onyx', 'Horizon', 'Nova', 'Frequency', 'Velvet', 'Atlas']

const EVENT_ADJECTIVES = ['NIGHT', 'SESSION', 'EXPERIENCE', 'FEST', 'PARTY', 'EDITION', 'LIVE']

const ORGANIZER_NAMES = [
  'Obsidian Nights', 'Neon Collective', 'Sunset Crew', 'Black Pearl Events', 'Diamond Sound',
  'Urban Pulse', 'Velvet Room', 'Continental Vibes', 'Atlas Prod', 'Horizon Live',
  'Nova Entertainment', 'Coastline Events', 'Midnight Society', 'Kaleido Prod', 'Ember Nights',
]

const FIRST_NAMES = ['Ama', 'Kwame', 'Koffi', 'Yawa', 'Sena', 'Akosua', 'Kossi', 'Afi', 'Elom', 'Kafui', 'Adjoa', 'Yao', 'Efua', 'Selom', 'Mawuli', 'Abena', 'Kodjo', 'Aissatou', 'Moussa', 'Fatou']
const LAST_NAMES = ['Mensah', 'Agbeko', 'Diallo', 'Traoré', 'Kone', 'Sow', 'Fall', 'Adjovi', 'Amoussou', 'Gbedey', 'Kponton', 'Sarr', 'Toure', 'Bamba', 'Adigun']

const PROVIDER_CATEGORIES = ['artiste', 'salle', 'materiel', 'food', 'photo_video', 'decoration', 'securite', 'transport', 'staff', 'communication', 'bien_etre']
const PROVIDER_TYPE_NAMES: Record<string, string> = {
  artiste: 'DJ / Artiste', salle: 'Salle événementielle', materiel: 'Son & lumière', food: 'Traiteur',
  photo_video: 'Photographe', decoration: 'Décoration', securite: 'Sécurité événementielle',
  transport: 'Navette & logistique', staff: 'Staff événementiel', communication: 'Communication', bien_etre: 'Beauté & bien-être',
}

// Domaine whitelisté par next.config.ts (images.remotePatterns + CSP img-src)
// — jamais un générateur externe non listé (picsum.photos, etc.), sinon les
// images sont bloquées côté client sans erreur serveur visible.
const UNSPLASH_PHOTO_IDS = [
  '1470229722913-7c0e2dbbafd3', '1493676304819-0d7a8d026dcf', '1514525253161-7a46d19cd819',
  '1470225620780-dba8ba36b745', '1518998053901-5348d3961a04',
  '1522158637959-30385a09e0da', '1526367790999-0150786686a2', '1516450360452-9312f5e86fc7',
  '1477281765962-ef34e8bb0967', '1496337589254-7e19d01cec44', '1429962714451-bb934ecdc4ec',
]

function unsplashUrl(seed: number, w = 1200, h = 800): string {
  const id = UNSPLASH_PHOTO_IDS[seed % UNSPLASH_PHOTO_IDS.length]
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`
}

const MENU_ITEMS = [
  { name: 'Bouteille Champagne', emoji: '🍾', price: 50000, category: 'Boissons' },
  { name: 'Cocktail signature', emoji: '🍹', price: 5000, category: 'Boissons' },
  { name: 'Bière premium', emoji: '🍺', price: 2000, category: 'Boissons' },
  { name: 'Assiette de tapas', emoji: '🍢', price: 8000, category: 'Nourriture' },
]

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex')
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr]
  const out: T[] = []
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0])
  return out
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function displayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const days = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM']
  const months = ['JANV', 'FÉVR', 'MARS', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC']
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

async function main() {
  await getDb()
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12)
  const now = new Date()

  console.log(`Seed bulk — génération de ${EVENT_COUNT} événements...`)

  // --- Organisateurs (15 comptes, un profil public chacun) ---
  const organizerCount = Math.min(15, ORGANIZER_NAMES.length)
  const organizers: { userId: string; profile: HydratedDocument<OrganizerProfileDoc> }[] = []
  for (let i = 0; i < organizerCount; i++) {
    const publicName = ORGANIZER_NAMES[i]
    const region = pick(REGIONS)
    const city = pick(region.cities)
    const firstName = pick(FIRST_NAMES)
    const lastName = pick(LAST_NAMES)
    const user = await User.create({
      email: `organisateur${i + 1}${BULK_DOMAIN}`,
      passwordHash,
      firstName,
      lastName,
      phone: `+228 9${randInt(0, 9)} ${randInt(10, 99)} ${randInt(10, 99)} ${randInt(10, 99)}`,
      roles: ['organisateur'],
      activeRole: 'organisateur',
      status: 'active',
      orgStatus: 'active',
      emailVerifiedAt: now,
    })
    const slug = `${slugify(publicName)}-${i + 1}`
    const profile = await OrganizerProfile.create({
      userId: String(user._id),
      publicName,
      slug,
      shortDescription: `${publicName} organise des soirées ${pick(CATEGORIES).toLowerCase()} à ${city}.`,
      longDescription: `${publicName} est un collectif événementiel basé à ${city}, spécialisé dans les soirées ${pick(CATEGORIES).toLowerCase()} depuis plusieurs années.`,
      city,
      country: region.name,
      regionId: region.id,
      status: 'public',
      isVerified: Math.random() > 0.3,
      zonesIntervention: [region.id],
      followersCount: randInt(10, 900),
      totalEventsCount: 0,
      avatarUrl: unsplashUrl(i + 20, 200, 200),
      bannerUrl: unsplashUrl(i, 1200, 500),
      media: [{ id: `m${i}`, url: unsplashUrl(i, 800, 600), type: 'image', visibility: 'public', displayOrder: 0 }],
      proPhone: `+228 9${randInt(0, 9)} ${randInt(10, 99)} ${randInt(10, 99)} ${randInt(10, 99)}`,
    })
    organizers.push({ userId: String(user._id), profile })
  }

  // --- Prestataires (15 comptes, catalogue simple) ---
  const providerCount = 15
  const providers: { userId: string }[] = []
  for (let i = 0; i < providerCount; i++) {
    const category = PROVIDER_CATEGORIES[i % PROVIDER_CATEGORIES.length]
    const region = pick(REGIONS)
    const city = pick(region.cities)
    const firstName = pick(FIRST_NAMES)
    const lastName = pick(LAST_NAMES)
    const name = `${PROVIDER_TYPE_NAMES[category]} ${lastName}`
    const user = await User.create({
      email: `prestataire${i + 1}${BULK_DOMAIN}`,
      passwordHash,
      firstName,
      lastName,
      phone: `+228 9${randInt(0, 9)} ${randInt(10, 99)} ${randInt(10, 99)} ${randInt(10, 99)}`,
      roles: ['prestataire'],
      activeRole: 'prestataire',
      status: 'active',
      prestStatus: 'active',
      emailVerifiedAt: now,
      prestataireSubActive: true,
    })
    await ProviderProfile.create({
      userId: String(user._id),
      name,
      headline: `${PROVIDER_TYPE_NAMES[category]} basé(e) à ${city}`,
      description: `${name} propose des prestations de type ${PROVIDER_TYPE_NAMES[category].toLowerCase()} pour tout événement à ${city} et ses environs.`,
      city,
      country: region.name,
      regionId: region.id,
      zonesIntervention: [region.id],
      prestataireType: category,
      prestataireTypes: [category],
      phone: `+228 9${randInt(0, 9)} ${randInt(10, 99)} ${randInt(10, 99)} ${randInt(10, 99)}`,
      catalogCurrency: region.currency,
      subscriptionActive: true,
      photoUrl: unsplashUrl(i + 40, 200, 200),
      coverUrl: unsplashUrl(i + 60, 1200, 500),
      catalog: [
        {
          id: 'c1',
          name: `Prestation ${PROVIDER_TYPE_NAMES[category]}`,
          description: 'Prestation standard, matériel/équipe inclus.',
          media: [{ url: unsplashUrl(i + 60, 800, 600), type: 'image' }],
          price: randInt(20, 300) * 1000,
          currency: region.currency,
          unit: 'soirée',
          category: PROVIDER_TYPE_NAMES[category],
          available: true,
        },
      ],
    })
    providers.push({ userId: String(user._id) })
  }

  // --- Clients (40 comptes, pour billets/avis) ---
  const clientCount = 40
  const clients: string[] = []
  for (let i = 0; i < clientCount; i++) {
    const firstName = pick(FIRST_NAMES)
    const lastName = pick(LAST_NAMES)
    const user = await User.create({
      email: `client${i + 1}${BULK_DOMAIN}`,
      passwordHash,
      firstName,
      lastName,
      phone: `+228 9${randInt(0, 9)} ${randInt(10, 99)} ${randInt(10, 99)} ${randInt(10, 99)}`,
      roles: ['client'],
      activeRole: 'client',
      status: 'active',
      emailVerifiedAt: now,
      points: randInt(0, 100),
    })
    clients.push(String(user._id))
  }

  // --- Événements (répartis passé/à venir, régions, catégories) ---
  let ticketsCreated = 0
  for (let i = 0; i < EVENT_COUNT; i++) {
    const organizer = pick(organizers)
    const region = pick(REGIONS)
    const city = pick(region.cities)
    const category = pick(CATEGORIES)
    // ~70% à venir (1 à 90 jours), ~30% passés (1 à 60 jours en arrière) pour
    // avoir des données d'historique/stats en plus du catalogue à venir.
    const offsetDays = Math.random() < 0.7 ? randInt(1, 90) : -randInt(1, 60)
    const date = isoDate(offsetDays)
    const isPast = offsetDays < 0
    const name = `${category.toUpperCase()} ${pick(EVENT_ADJECTIVES)} ${pick(VENUE_NAMES)}`.slice(0, 80)
    const capacity = randInt(60, 400)
    const price = randInt(2, 30) * 1000
    const currency = region.currency
    const hasMenu = Math.random() > 0.5
    const isPrivate = Math.random() < 0.08

    type SeedPlace = {
      id: string
      type: string
      price: number
      available: number
      total: number
      maxPerAccount: number
      groupType?: 'group'
      groupMin?: number
      groupMax?: number
    }
    const places: SeedPlace[] = [
      { id: 'p1', type: 'Entrée standard', price, available: isPast ? 0 : randInt(0, capacity), total: capacity, maxPerAccount: 4 },
      { id: 'p2', type: 'VIP', price: price * 3, available: isPast ? 0 : randInt(0, Math.floor(capacity * 0.15)), total: Math.floor(capacity * 0.15) || 5, maxPerAccount: 2 },
    ]
    if (Math.random() > 0.6) {
      places.push({
        id: 'p3',
        type: 'Table VIP (groupe)',
        price: price * 12,
        available: isPast ? 0 : randInt(0, 4),
        total: 4,
        maxPerAccount: 1,
        groupType: 'group',
        groupMin: 4,
        groupMax: 8,
      })
    }

    const event = await Event.create({
      name,
      subtitle: `Une soirée ${category.toLowerCase()} signée ${organizer.profile.publicName}`,
      description: `${name} — ${category} à ${city}, organisé par ${organizer.profile.publicName}. Line-up, son et ambiance premium pour une nuit inoubliable.`,
      category,
      tags: [category],
      date,
      dateDisplay: displayDate(date),
      time: pick(['21:00', '22:00', '23:00']),
      endTime: pick(['04:00', '05:00', '06:00']),
      location: `${pick(VENUE_WORDS)} ${pick(VENUE_NAMES)}, ${city}`,
      city,
      region: region.name,
      currency,
      imageUrl: unsplashUrl(i),
      color: pick(['#c8a96e', '#4ee8c8', '#e05aaa', '#8b5cf6']),
      places,
      preorder: hasMenu,
      menu: hasMenu ? pickN(MENU_ITEMS, randInt(1, MENU_ITEMS.length)) : null,
      artists: [{ name: `DJ ${pick(LAST_NAMES)}`, role: 'DJ' }],
      minAge: Math.random() > 0.2 ? 18 : 0,
      userCreated: true,
      isPrivate,
      privateCodeHash: isPrivate ? hashCode(`SEED${i}`) : null,
      createdBy: organizer.userId,
      organizerId: organizer.userId,
      organizerName: organizer.profile.publicName,
      organizer: organizer.profile.publicName,
    })

    await OrganizerProfile.updateOne({ _id: organizer.profile._id }, { $inc: { totalEventsCount: 1 } })

    // Quelques billets vendus par événement (plus si l'event est passé, pour
    // peupler l'historique/stats) — jamais plus que le nombre de clients seedés.
    const soldCount = isPast ? randInt(5, Math.min(20, clientCount)) : randInt(0, Math.min(10, clientCount))
    const buyers = pickN(clients, soldCount)
    for (const buyerId of buyers) {
      const place = pick(places)
      const ticketCode = await generateUniqueTicketCode()
      await Ticket.create({
        ticketCode,
        eventId: String(event._id),
        eventName: event.name,
        eventDate: event.date,
        place: place.type,
        placePrice: place.price,
        totalPrice: place.price,
        currency,
        userId: buyerId,
        paid: true,
        source: 'paid',
        bookedAt: new Date(Date.now() - randInt(1, 30) * 24 * 60 * 60 * 1000),
        checkedInAt: isPast && Math.random() > 0.2 ? new Date() : null,
      })
      ticketsCreated++
    }

    // Boost actif sur ~10% des événements à venir.
    if (!isPast && Math.random() < 0.1) {
      await Boost.create({
        boostId: `SEED_BULK_BOOST_${i}`,
        eventId: String(event._id),
        position: randInt(1, 3),
        region: region.id,
        price: 9.99,
        days: 7,
        userId: organizer.userId,
        purchasedAt: now,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'active',
      })
    }

    if ((i + 1) % 20 === 0) console.log(`  ... ${i + 1}/${EVENT_COUNT} événements créés`)
  }

  // --- Avis prestataires (2 à 8 par prestataire) ---
  let reviewsCreated = 0
  for (const provider of providers) {
    const reviewCount = randInt(2, 8)
    const authors = pickN(clients, Math.min(reviewCount, clients.length))
    for (const authorId of authors) {
      const author = await User.findById(authorId).lean()
      await Review.create({
        providerId: provider.userId,
        authorId,
        authorName: author ? `${author.firstName} ${author.lastName}`.trim() : 'Client',
        rating: randInt(3, 5),
        comment: pick([
          'Prestation impeccable, je recommande !',
          'Très professionnel, ponctuel et à l’écoute.',
          'Bon rapport qualité/prix, referons appel à eux.',
          'Ambiance parfaite, exactement ce qu’on voulait.',
          'Quelques petits soucis d’organisation mais globalement satisfait.',
        ]),
        status: 'published',
        verified: true,
      })
      reviewsCreated++
    }
  }

  console.log('Seed bulk terminé.')
  console.log(`  - organisateurs: ${organizers.length}`)
  console.log(`  - prestataires: ${providers.length}`)
  console.log(`  - clients: ${clients.length}`)
  console.log(`  - événements: ${EVENT_COUNT}`)
  console.log(`  - billets: ${ticketsCreated}`)
  console.log(`  - avis: ${reviewsCreated}`)
  console.log(`  Mot de passe commun (comptes @${BULK_DOMAIN.slice(1)}) :`, DEV_PASSWORD)
  console.log('  Pour nettoyer : npm run seed:bulk:clean')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
