import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { updateOrganizerEvent, getMyOrganizerEventDetail } from '@/lib/server/organizerEvents'
import { deleteOrganizerEvent } from '@/lib/server/organizerEventLifecycle'

export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const result = await getMyOrganizerEventDetail({ id: session.user.id }, eventId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, event: result.event })
}

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

const menuItemSchema = z.object({
  name: z.string().trim().min(1),
  emoji: z.string().default(''),
  imageUrl: z.string().nullable().default(null),
  price: z.number().min(0).default(0),
  category: z.string().default('Boissons'),
  description: z.string().default(''),
  hasShow: z.boolean().default(false),
  showOptions: z.array(z.string()).default([]),
  excludedPlaces: z.array(z.string()).default([]),
})

const artistSchema = z.object({ name: z.string().trim().min(1), role: z.string().default('DJ') })

// Corps PARTIEL (contrairement à la création) : seuls les champs fournis
// sont appliqués — voir lib/server/organizerEvents.ts pour la logique de
// verrouillage post-vente qui décide, champ par champ, si la valeur fournie
// est réellement appliquée.
const eventFormSchema = z.object({
  name: z.string().trim().min(1).optional(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  eventType: z.string().optional(),
  musicStyles: z.array(z.string()).optional(),
  ambiances: z.array(z.string()).optional(),
  date: z.string().optional(),
  dateDisplay: z.string().optional(),
  time: z.string().optional(),
  endTime: z.string().optional(),
  location: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  videoUrl: z.string().nullable().optional(),
  color: z.string().optional(),
  accentColor: z.string().optional(),
  places: z.array(placeSchema).optional(),
  playlist: z.boolean().optional(),
  preorder: z.boolean().optional(),
  menu: z.array(menuItemSchema).nullable().optional(),
  artists: z.array(artistSchema).optional(),
  dj: z.string().optional(),
  performers: z.array(z.string()).optional(),
  minAge: z.number().min(0).max(99).optional(),
  isPrivate: z.boolean().optional(),
  privateCode: z.string().nullable().optional(),
  publishAt: z.string().nullable().optional(),
  closingDate: z.string().nullable().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const parsed = eventFormSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const { eventId } = await params
  const result = await updateOrganizerEvent({ id: session.user.id }, eventId, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}

// Suppression FERMÉE dès qu'une réservation existe — voir
// lib/server/organizerEventLifecycle.ts. Le client bascule automatiquement
// vers le flux d'annulation (POST .../cancel) sur un 409 `has_bookings`.
export async function DELETE(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { eventId } = await params
  const result = await deleteOrganizerEvent({ id: session.user.id }, eventId)
  if (!result.ok) {
    if ('bookingCount' in result) return NextResponse.json({ error: 'has_bookings', bookingCount: result.bookingCount }, { status: 409 })
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
