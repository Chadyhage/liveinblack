// Wrapper "best-effort" pour les envois d'email déclenchés depuis la logique
// métier (achat, remboursement, versement, staff...). Règle non négociable :
// un envoi d'email raté (ou l'utilisateur introuvable) ne doit JAMAIS faire
// échouer l'opération métier qui le déclenche — sendEmail() ne throw déjà
// jamais (lib/server/email.ts), mais la résolution de l'email par userId ici
// (requête Mongo) est en plus protégée par un try/catch dédié.
//
// Si l'Email construit porte un champ `inApp` (lib/server/emails/types.ts),
// ce même point d'appel déclenche AUSSI une notification in-app
// (lib/server/notifications.ts) et, si `inApp.push:true`, une notification
// push navigateur (lib/server/push.ts) — un seul site d'appel métier
// alimente les trois canaux, jamais besoin de dupliquer l'appel ailleurs.
import User from '@/lib/models/User'
import { sendEmail } from '../email'
import { createNotification } from '../notifications'
import { sendPushToUser, sendPushToAgents } from '../push'
import type { Email } from './types'

async function fireInApp(userId: string, email: Email): Promise<void> {
  const inApp = email.inApp
  if (!inApp) return
  try {
    await createNotification({ userId, type: inApp.type, title: inApp.title, body: inApp.body, link: inApp.link })
  } catch (err) {
    console.error('[notify] createNotification failed:', err)
  }
  if (inApp.push) {
    await sendPushToUser(userId, { title: inApp.title, body: inApp.body, url: inApp.link })
  }
}

export async function notifyUserById(userId: string | null | undefined, build: () => Email): Promise<void> {
  if (!userId) return
  const email = build()
  try {
    const user = await User.findById(userId).select('email').lean<{ email?: string } | null>()
    if (user?.email) await sendEmail(user.email, email)
  } catch (err) {
    console.error('[emails] notifyUserById failed:', err)
  }
  await fireInApp(userId, email)
}

export async function notifyEmail(to: string | null | undefined, build: () => Email): Promise<void> {
  if (!to) return
  try {
    await sendEmail(to, build())
  } catch (err) {
    console.error('[emails] notifyEmail failed:', err)
  }
  // Pas de userId ici (email brut, parfois capturé APRÈS anonymisation du
  // compte) — aucune notification in-app/push possible, volontairement omis
  // plutôt que de deviner un destinataire.
}

// Diffusion aux comptes agent (plateforme) — candidature/signalement/demande
// de suppression à examiner. Point UNIQUE de résolution "qui sont les
// agents" pour ne pas dupliquer cette requête à chaque call site
// (applications.ts, messaging.ts, agentDeletion.ts...).
export async function notifyAllAgents(build: () => Email): Promise<void> {
  const email = build()
  try {
    const agents = await User.find({ roles: 'agent', disabled: { $ne: true } }).select('email').lean<{ _id: unknown; email?: string }[]>()
    await Promise.all(agents.filter((a) => a.email).map((a) => sendEmail(a.email as string, email)))
    if (email.inApp) {
      await Promise.all(agents.map((a) => createNotification({ userId: String(a._id), type: email.inApp!.type, title: email.inApp!.title, body: email.inApp!.body, link: email.inApp!.link })))
      if (email.inApp.push) await sendPushToAgents({ title: email.inApp.title, body: email.inApp.body, url: email.inApp.link })
    }
  } catch (err) {
    console.error('[emails] notifyAllAgents failed:', err)
  }
}
