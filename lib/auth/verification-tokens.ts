import { randomBytes } from 'node:crypto'
import { MongoDBAdapter } from '@auth/mongodb-adapter'
import clientPromise from '../db/mongodb-client'

// Jetons de vérification email / reset mot de passe, stockés dans la
// collection `verification_tokens` gérée par l'adaptateur MongoDB d'Auth.js
// (déjà branché pour la connexion — voir web/auth.ts). Réutilisé ici en
// dehors du flux Credentials pour nos propres endpoints (register,
// verify-email, request/reset password), qui ne passent pas par NextAuth.
const adapter = MongoDBAdapter(clientPromise)

const ONE_DAY_MS = 24 * 60 * 60 * 1000

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export async function issueVerificationToken(email: string, ttlMs = ONE_DAY_MS): Promise<string> {
  const token = generateToken()
  await adapter.createVerificationToken?.({
    identifier: email,
    token,
    expires: new Date(Date.now() + ttlMs),
  })
  return token
}

export async function consumeVerificationToken(email: string, token: string): Promise<boolean> {
  const found = await adapter.useVerificationToken?.({ identifier: email, token })
  if (!found) return false
  if (found.expires.getTime() < Date.now()) return false
  return true
}

// Supprime tous les jetons en attente pour cet email avant d'en émettre un
// nouveau (utilisé par resend-verification) : l'adaptateur MongoDB
// d'Auth.js n'a pas de notion d'unicité par `identifier`, createVerificationToken
// se contente d'un insertOne — sans ce nettoyage, redemander l'email plusieurs
// fois empilerait des jetons dupliqués (tous valides jusqu'à expiration) dans
// `verification_tokens` au lieu de n'en laisser qu'un seul actif.
export async function invalidateVerificationTokens(email: string): Promise<void> {
  const client = await clientPromise
  await client.db().collection('verification_tokens').deleteMany({ identifier: email })
}
