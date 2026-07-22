import { randomBytes } from 'node:crypto'
import { MongoDBAdapter } from '@auth/mongodb-adapter'
import clientPromise from '../db/mongodb-client'
import {
  VERIFICATION_TOKEN_PURPOSES,
  verificationTokenIdentifier,
  type VerificationTokenPurpose,
} from './token-identifier'

// Jetons de vérification email / reset mot de passe, stockés dans la
// collection `verification_tokens` gérée par l'adaptateur MongoDB d'Auth.js
// (déjà branché pour la connexion — voir web/auth.ts). Réutilisé ici en
// dehors du flux Credentials pour nos propres endpoints (register,
// verify-email, request/reset password), qui ne passent pas par NextAuth.
const adapter = MongoDBAdapter(clientPromise)

const ONE_DAY_MS = 24 * 60 * 60 * 1000

// `verification_tokens` est une collection gérée par @auth/mongodb-adapter,
// PAS un modèle Mongoose — pas d'autoIndex ici (contrairement à Boost.ts /
// Application.ts), donc rien ne crée l'index TTL tout seul. La vérification
// d'expiration au moment de la consommation (consumeVerificationToken
// ci-dessous) empêche déjà d'UTILISER un jeton expiré, mais un jeton jamais
// consommé (lien email jamais cliqué) restait accumulé indéfiniment en base
// (RGPD — minimisation des données). `createIndex` est idempotent côté Mongo
// (no-op si l'index existe déjà avec la même définition) ; on met quand même
// le résultat en cache par process pour éviter un aller-retour réseau à
// chaque émission de jeton, avec retente au prochain appel en cas d'échec.
let ttlIndexPromise: Promise<void> | null = null
function ensureVerificationTokenTTLIndex(): Promise<void> {
  if (!ttlIndexPromise) {
    ttlIndexPromise = (async () => {
      const client = await clientPromise
      await client
        .db()
        .collection('verification_tokens')
        .createIndex({ expires: 1 }, { name: 'expires_ttl', expireAfterSeconds: 0 })
    })().catch((err) => {
      ttlIndexPromise = null
      throw err
    })
  }
  return ttlIndexPromise
}

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export async function issueVerificationToken(
  subjectId: string,
  email: string,
  purpose: VerificationTokenPurpose,
  ttlMs = ONE_DAY_MS
): Promise<string> {
  const token = generateToken()
  await ensureVerificationTokenTTLIndex()
  await adapter.createVerificationToken?.({
    identifier: verificationTokenIdentifier(subjectId, email, purpose),
    token,
    expires: new Date(Date.now() + ttlMs),
  })
  return token
}

export async function consumeVerificationToken(
  subjectId: string,
  email: string,
  purpose: VerificationTokenPurpose,
  token: string
): Promise<boolean> {
  const found = await adapter.useVerificationToken?.({
    identifier: verificationTokenIdentifier(subjectId, email, purpose),
    token,
  })
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
export async function invalidateVerificationTokens(
  subjectId: string,
  email: string,
  purpose: VerificationTokenPurpose
): Promise<void> {
  const client = await clientPromise
  await client
    .db()
    .collection('verification_tokens')
    .deleteMany({ identifier: verificationTokenIdentifier(subjectId, email, purpose) })
}

export async function invalidateAllVerificationTokens(subjectId: string, email: string): Promise<void> {
  const client = await clientPromise
  await client
    .db()
    .collection('verification_tokens')
    .deleteMany({
      identifier: {
        $in: VERIFICATION_TOKEN_PURPOSES.map((purpose) =>
          verificationTokenIdentifier(subjectId, email, purpose)
        ),
      },
    })
}
