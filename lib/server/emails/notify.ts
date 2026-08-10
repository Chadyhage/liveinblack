// Wrapper "best-effort" pour les envois d'email déclenchés depuis la logique
// métier (achat, remboursement, versement, staff...). Règle non négociable :
// un envoi d'email raté (ou l'utilisateur introuvable) ne doit JAMAIS faire
// échouer l'opération métier qui le déclenche — sendEmail() ne throw déjà
// jamais (lib/server/email.ts), mais la résolution de l'email par userId ici
// (requête Mongo) est en plus protégée par un try/catch dédié.
import User from '../../models/User'
import { sendEmail } from '../email'
import type { Email } from './types'

export async function notifyUserById(userId: string | null | undefined, build: () => Email): Promise<void> {
  if (!userId) return
  try {
    const user = await User.findById(userId).select('email').lean<{ email?: string } | null>()
    if (!user?.email) return
    await sendEmail(user.email, build())
  } catch (err) {
    console.error('[emails] notifyUserById failed:', err)
  }
}

export async function notifyEmail(to: string | null | undefined, build: () => Email): Promise<void> {
  if (!to) return
  try {
    await sendEmail(to, build())
  } catch (err) {
    console.error('[emails] notifyEmail failed:', err)
  }
}
