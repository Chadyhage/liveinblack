import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { createOrganizerEvent, listMyOrganizerEvents } from '@/lib/server/organizerEvents'
import { canCreateEvent } from '@/lib/server/permissions'

const placeSchema = z.object({
  id: z.string().default(''),
  type: z.string().trim().min(1),
  price: z.number().min(0).default(0),
  total: z.number().min(0).default(0),
  icon: z.string().default(''),
  maxPerAccount: z.number().min(0).default(0),
  groupType: z.enum(['solo', 'group']).default('solo'),
  groupMin: z.number().min(0).default(0),
  groupMax: z.number().min(0).default(0),
  photos: z.array(z.string()).default([]),
  included: z.array(z.object({ name: z.string(), qty: z.number().default(1) })).default([]),
})

const showOptionSchema = z.union([
  z.string().trim().min(1).max(160),
  z.object({
    id: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(160),
    requiresInfo: z.boolean().default(false),
    infoPrompt: z.string().max(240).default(''),
    excludedPlaces: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  }),
])

const menuItemSchema = z.object({
  name: z.string().trim().min(1),
  emoji: z.string().default(''),
  imageUrl: z.string().nullable().default(null),
  price: z.number().min(0).default(0),
  category: z.string().default('Boissons'),
  description: z.string().default(''),
  available: z.boolean().default(true),
  hasShow: z.boolean().default(false),
  showOptions: z.array(showOptionSchema).max(20).default([]),
  excludedPlaces: z.array(z.string()).default([]),
})

const artistSchema = z.object({ name: z.string().trim().min(1), role: z.string().default('DJ') })

const eventFormSchema = z.object({
  name: z.string().trim().min(1),
  subtitle: z.string().default(''),
  description: z.string().default(''),
  category: z.string().default(''),
  tags: z.array(z.string()).default([]),
  eventType: z.string().default(''),
  musicStyles: z.array(z.string()).default([]),
  ambiances: z.array(z.string()).default([]),
  date: z.string().min(1),
  dateDisplay: z.string().default(''),
  time: z.string().default('22:00'),
  endTime: z.string().default('05:00'),
  location: z.string().default(''),
  city: z.string().trim().min(1),
  region: z.string().trim().min(1),
  imageUrl: z.string().nullable().default(null),
  videoUrl: z.string().nullable().default(null),
  color: z.string().default('#c8a96e'),
  accentColor: z.string().default('#e8d49e'),
  places: z.array(placeSchema).default([]),
  playlist: z.boolean().default(false),
  preorder: z.boolean().default(false),
  menu: z.array(menuItemSchema).nullable().default(null),
  artists: z.array(artistSchema).default([]),
  dj: z.string().default(''),
  performers: z.array(z.string()).default([]),
  minAge: z.number().min(0).max(99).default(18),
  isPrivate: z.boolean().default(false),
  privateCode: z.string().nullable().optional(),
  publishAt: z.string().nullable().optional(),
  closingDate: z.string().nullable().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const result = await listMyOrganizerEvents({ id: session.user.id })
  return NextResponse.json({ ok: true, events: result.events })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  // Fidèle à la garde de page (app/(app)/my-events/page.tsx) — celle-ci
  // bloquait déjà l'ACCÈS À LA PAGE pour un organisateur dont le dossier est
  // encore 'pending' ou a été 'rejected'/suspendu par un agent (#9 phase
  // agent/admin), mais cette route restait joignable en direct (n'importe
  // quel appel API, pas seulement via l'UI) sans revérifier `orgStatus` —
  // régression trouvée à l'audit : un compte non vetté pouvait publier un
  // événement payant et encaisser de l'argent réel avant toute revue.
  if (!canCreateEvent({ activeRole: session.user.activeRole, status: session.user.status, orgStatus: session.user.orgStatus, prestStatus: session.user.prestStatus })) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const parsed = eventFormSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const result = await createOrganizerEvent({ id: session.user.id }, session.user.name || '', parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, eventId: result.eventId }, { status: 201 })
}
