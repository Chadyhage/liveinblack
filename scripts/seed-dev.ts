// Jeu de données de test pour vérifier manuellement l'app en local : un
// compte connectable par rôle (mot de passe commun ci-dessous), un
// organisateur/prestataire réels (liés à un vrai User, pas un id fictif),
// 3 événements (public à venir, privé, complet), un billet déjà en poche
// pour le client.
// Usage : npm run seed (nécessite MONGODB_URI dans .env.local — écrit sur
// CETTE base, ne jamais pointer vers une base de production).
// Note : les variables d'env (.env.local) sont chargées via le flag Node
// --env-file (voir le script npm "seed") — PAS en code ici, car les imports
// ES modules sont hoistés et s'exécuteraient avant tout chargement en code,
// capturant MONGODB_URI à `undefined` dans lib/db/mongoose.ts.
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { getDb } from '../lib/db/mongoose'
import User from '../lib/models/User'
import Event from '../lib/models/Event'
import ProviderProfile from '../lib/models/ProviderProfile'
import OrganizerProfile from '../lib/models/OrganizerProfile'
import Boost from '../lib/models/Boost'
import Ticket from '../lib/models/Ticket'
import { generateUniqueTicketCode } from '../lib/server/ticketCode'

const DEV_PASSWORD = 'DevTest1234!'

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex')
}

function inDays(n: number): string {
  const d = new Date(Date.now() + n * 24 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 10)
}

async function main() {
  await getDb()

  await Promise.all([
    User.deleteMany({ email: { $regex: /@liveinblack\.dev$/ } }),
    Event.deleteMany({}),
    ProviderProfile.deleteMany({}),
    OrganizerProfile.deleteMany({}),
    Boost.deleteMany({}),
    Ticket.deleteMany({}),
  ])

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12)
  const now = new Date()

  const client = await User.create({
    email: 'client@liveinblack.dev',
    passwordHash,
    firstName: 'Ama',
    lastName: 'Client',
    phone: '+228 90 11 22 33',
    roles: ['client'],
    activeRole: 'client',
    status: 'active',
    emailVerifiedAt: now,
    points: 30,
  })

  const organizerUser = await User.create({
    email: 'organisateur@liveinblack.dev',
    passwordHash,
    firstName: 'Kwame',
    lastName: 'Organisateur',
    phone: '+228 90 00 00 00',
    roles: ['organisateur'],
    activeRole: 'organisateur',
    status: 'active',
    orgStatus: 'active',
    emailVerifiedAt: now,
  })

  const providerUser = await User.create({
    email: 'prestataire@liveinblack.dev',
    passwordHash,
    firstName: 'Koffi',
    lastName: 'DJ',
    phone: '+228 91 23 45 67',
    roles: ['prestataire'],
    activeRole: 'prestataire',
    status: 'active',
    prestStatus: 'active',
    emailVerifiedAt: now,
    prestataireSubActive: true,
  })

  const agentUser = await User.create({
    email: 'agent@liveinblack.dev',
    passwordHash,
    firstName: 'Agent',
    lastName: 'LIB',
    roles: ['agent'],
    activeRole: 'agent',
    status: 'active',
    emailVerifiedAt: now,
  })

  const organizerId = String(organizerUser._id)
  const providerId = String(providerUser._id)

  const organizer = await OrganizerProfile.create({
    userId: organizerId,
    publicName: 'Obsidian Nights',
    slug: 'obsidian-nights',
    shortDescription: "Le collectif qui fait vibrer Lomé depuis 2022.",
    longDescription:
      "Obsidian Nights organise des soirées afrobeat/amapiano premium à Lomé et Cotonou depuis 2022. Notre équipe soigne chaque détail : son, lumière, sécurité et line-up.",
    city: 'Lomé',
    country: 'Togo',
    regionId: 'togo',
    status: 'public',
    isVerified: true,
    zonesIntervention: ['togo', 'benin'],
    followersCount: 342,
    totalEventsCount: 2,
    media: [
      { id: 'm1', url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=800&q=80', type: 'image', visibility: 'public', displayOrder: 0 },
    ],
    proPhone: '+228 90 00 00 00',
  })

  await ProviderProfile.create({
    userId: providerId,
    name: 'DJ Koffi',
    headline: 'DJ Afrobeat / Amapiano — 10 ans d’expérience',
    description: "Résident de plusieurs clubs à Lomé, DJ Koffi mixe afrobeat, amapiano et hip-hop pour tout type d'événement.",
    city: 'Lomé',
    country: 'Togo',
    regionId: 'togo',
    zonesIntervention: ['togo', 'benin'],
    website: 'https://djkoffi.example.com',
    socialLinks: { instagram: 'https://instagram.com/djkoffi' },
    prestataireType: 'artiste',
    prestataireTypes: ['artiste'],
    phone: '+228 91 23 45 67',
    catalogCurrency: 'XOF',
    subscriptionActive: true,
    catalog: [
      {
        id: 'c1',
        name: 'Set DJ 3h',
        description: 'Set complet, matériel son inclus.',
        price: 150000,
        currency: 'XOF',
        unit: 'soirée',
        category: 'DJ',
        available: true,
      },
    ],
  })

  const eventUpcoming = await Event.create({
    name: 'AFRO NATION LOMÉ',
    subtitle: 'La plus grosse soirée afrobeat du mois',
    description: "Une nuit entière dédiée à l'afrobeat et à l'amapiano, avec un line-up international et une expérience premium.",
    category: 'Afrobeat',
    tags: ['Afrobeat', 'Premium'],
    date: inDays(30),
    dateDisplay: 'SAM 15 AOÛT 2026',
    time: '22:00',
    endTime: '05:00',
    location: 'Club Oxygène, Lomé',
    city: 'Lomé',
    region: 'Togo',
    currency: 'XOF',
    imageUrl: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80',
    color: '#c8a96e',
    places: [
      { id: 'p1', type: 'Entrée standard', price: 5000, available: 119, total: 200, maxPerAccount: 4 },
      { id: 'p2', type: 'VIP', price: 15000, available: 3, total: 20, maxPerAccount: 2 },
      { id: 'p3', type: 'Table VIP (groupe)', price: 100000, available: 2, total: 5, maxPerAccount: 1, groupType: 'group', groupMin: 4, groupMax: 8 },
    ],
    preorder: true,
    menu: [
      { name: 'Bouteille Champagne', emoji: '🍾', price: 50000, category: 'Boissons', description: 'Moët & Chandon' },
      { name: 'Cocktail signature', emoji: '🍹', price: 5000, category: 'Boissons', description: '' },
    ],
    artists: [
      { name: 'DJ Koffi', role: 'DJ' },
      { name: 'MC Ama', role: 'MC' },
    ],
    minAge: 18,
    userCreated: true,
    isPrivate: false,
    createdBy: organizerId,
    organizerId,
    organizerName: organizer.publicName,
    organizer: organizer.publicName,
  })

  await Event.create({
    name: 'SOIRÉE PRIVÉE — ANNIVERSAIRE',
    subtitle: 'Sur invitation uniquement',
    description: 'Événement privé.',
    category: 'House',
    date: inDays(20),
    dateDisplay: 'VEN 4 SEPT 2026',
    time: '21:00',
    endTime: '04:00',
    location: 'Villa Kodjoviakopé, Lomé',
    city: 'Lomé',
    region: 'Togo',
    currency: 'XOF',
    places: [{ id: 'p1', type: 'Entrée', price: 0, available: 40, total: 50 }],
    minAge: 18,
    userCreated: true,
    isPrivate: true,
    privateCodeHash: hashCode('SECRET2026'),
    createdBy: organizerId,
    organizerId,
    organizerName: organizer.publicName,
    organizer: organizer.publicName,
  })

  await Event.create({
    name: 'HOUSE SESSION PARIS',
    subtitle: 'Deep house & techno',
    description: 'Une soirée house intimiste dans un cadre exclusif.',
    category: 'House',
    date: inDays(10),
    dateDisplay: 'SAM 25 JUIL 2026',
    time: '23:00',
    endTime: '06:00',
    location: 'Rooftop République, Paris',
    city: 'Paris',
    region: 'France',
    currency: 'EUR',
    imageUrl: 'https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?auto=format&fit=crop&w=1200&q=80',
    places: [{ id: 'p1', type: 'Entrée', price: 20, available: 0, total: 80 }],
    minAge: 18,
    userCreated: true,
    isPrivate: false,
    createdBy: organizerId,
    organizerId,
    organizerName: organizer.publicName,
    organizer: organizer.publicName,
  })

  await Boost.create({
    boostId: 'SEED_BOOST_1',
    eventId: String(eventUpcoming._id),
    position: 1,
    region: 'togo',
    price: 9.99,
    days: 7,
    userId: organizerId,
    purchasedAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: 'active',
  })

  // Un billet déjà en poche pour le client (place standard, non scanné) —
  // pour tester le portefeuille billets, la page /ticket/[token] et le
  // scanner sans avoir à repasser par tout le tunnel d'achat.
  const ticketCode = await generateUniqueTicketCode()
  await Ticket.create({
    ticketCode,
    eventId: String(eventUpcoming._id),
    eventName: eventUpcoming.name,
    eventDate: eventUpcoming.date,
    place: 'Entrée standard',
    placePrice: 5000,
    totalPrice: 5000,
    currency: 'XOF',
    userId: String(client._id),
    paid: true,
    source: 'paid',
    bookedAt: now,
  })

  console.log('Seed OK — mot de passe commun pour tous les comptes ci-dessous :', DEV_PASSWORD)
  console.log('  - client:', client.email)
  console.log('  - organisateur:', organizerUser.email, '(organizer profile:', organizer.slug + ')')
  console.log('  - prestataire:', providerUser.email)
  console.log('  - agent:', agentUser.email)
  console.log('  - event public à venir:', String(eventUpcoming._id), '— 1 billet déjà émis pour le client')
  console.log('  - event privé (code: SECRET2026)')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
