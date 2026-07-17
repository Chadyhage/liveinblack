import crypto from 'node:crypto'
import { getDb } from '../db/mongoose'
import Event from '../models/Event'
import EventAccessCode from '../models/EventAccessCode'

// Port du système de codes d'accès INDIVIDUELS de src/utils/guestlist.js
// (#7 phase organisateur) — génération par lot (1 à 100) pour un événement
// privé, chaque code étant à usage unique et distinct du code MAÎTRE partagé
// (`Event.privateCodeHash`, vérifié par lib/server/events.ts). Contrairement
// au legacy (localStorage par appareil + doc plat Firestore, deux sources
// potentiellement désynchronisées), un seul modèle Mongo fait foi.

export interface AccessCodeCaller {
  id: string
}

type ErrResult = { ok: false; status: number; error: string }

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // exclut I/O/0/1 (ambiguïté visuelle)
const MAX_BATCH = 100

function randomCode(length = 8): string {
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

async function assertOwner(eventId: string, callerId: string) {
  const event = await Event.findById(eventId).lean()
  if (!event) return { ok: false as const, status: 404, error: 'event_not_found' }
  if (event.organizerId !== callerId && event.createdBy !== callerId) return { ok: false as const, status: 403, error: 'forbidden' }
  if (!event.isPrivate) return { ok: false as const, status: 400, error: 'event_not_private' }
  return { ok: true as const }
}

export interface AccessCodeView {
  code: string
  usedBy: string | null
  usedAt: string | null
  createdAt: string
}

export type GenerateCodesResult = ErrResult | { ok: true; codes: string[] }
export type ListCodesResult = ErrResult | { ok: true; codes: AccessCodeView[] }

// Génère `count` codes uniques (1-100 par lot, fidèle au legacy) — renvoyés
// UNE SEULE FOIS en clair à l'organisateur pour distribution (SMS, message
// privé…) ; relire la liste ensuite (listAccessCodes) ne remontre plus que
// le statut d'usage, jamais une raison de re-générer le même code.
export async function generateAccessCodes(caller: AccessCodeCaller, eventId: string, count: number): Promise<GenerateCodesResult> {
  await getDb()

  const guard = await assertOwner(eventId, caller.id)
  if (!guard.ok) return guard

  const n = Math.max(1, Math.min(MAX_BATCH, Math.floor(count)))
  const codes: string[] = []
  for (let i = 0; i < n; i++) codes.push(randomCode())

  await EventAccessCode.insertMany(codes.map((code) => ({ eventId, code, createdBy: caller.id })))
  return { ok: true, codes }
}

export async function listAccessCodes(caller: AccessCodeCaller, eventId: string): Promise<ListCodesResult> {
  await getDb()

  const guard = await assertOwner(eventId, caller.id)
  if (!guard.ok) return guard

  const codes = await EventAccessCode.find({ eventId }).sort({ createdAt: -1 }).lean()
  return {
    ok: true,
    codes: codes.map((c) => ({
      code: c.code,
      usedBy: c.usedBy ?? null,
      usedAt: c.usedAt ? new Date(c.usedAt).toISOString() : null,
      createdAt: new Date(c.createdAt as unknown as string).toISOString(),
    })),
  }
}

// Consomme un code individuel (usage unique) — appelée depuis la route de
// déverrouillage (POST /api/events/[id]/unlock) en repli si le code MAÎTRE
// ne correspond pas. `usedBy` est facultatif : le déverrouillage d'un
// événement privé ne requiert pas de session (cf. app/(public)/evenements/
// [id]/page.tsx), donc l'appelant peut être anonyme.
export async function consumeEventAccessCode(eventId: string, code: string, usedBy: string | null = null): Promise<boolean> {
  await getDb()

  const normalized = code.trim().toUpperCase()
  if (!normalized) return false

  const updated = await EventAccessCode.findOneAndUpdate(
    { eventId, code: normalized, usedBy: null },
    { $set: { usedBy: usedBy ?? 'anonymous', usedAt: new Date() } }
  )
  return Boolean(updated)
}
