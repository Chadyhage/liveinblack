import crypto from 'node:crypto'

// Jeton de déverrouillage d'un événement privé (ferme l'audit C01). Un simple
// cookie "unlocked=true" serait falsifiable par n'importe qui (un visiteur
// peut poser ses propres cookies) — on signe donc le cookie avec un HMAC
// serveur : seul le serveur, qui connaît AUTH_SECRET, peut produire un jeton
// valide pour un eventId donné, et seulement après vérification du code réel.
function secret(): string {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET manquant — requis pour signer les déverrouillages d’événements privés')
  return s
}

export function signEventUnlock(eventId: string): string {
  return crypto.createHmac('sha256', secret()).update(eventId).digest('hex')
}

export function verifyEventUnlockToken(eventId: string, token: string | undefined | null): boolean {
  if (!token) return false
  const expected = signEventUnlock(eventId)
  const a = Buffer.from(expected)
  const b = Buffer.from(token)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function unlockCookieName(eventId: string): string {
  return `evu_${eventId}`
}
