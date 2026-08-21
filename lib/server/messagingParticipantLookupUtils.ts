import User from '../models/User'

// Une seule requête pour tous les participants fournis — jamais une par
// message ni une par appel de toMessageView. `!== false` partout où cette
// Map est lue : un id absent (utilisateur supprimé, ou Map vide passée par
// un appelant qui sait que le message vient d'être créé) doit se comporter
// comme "autorisé", jamais comme "refusé" par défaut.
export async function resolveReadReceiptsAllowed(participantIds: string[]): Promise<Map<string, boolean>> {
  if (participantIds.length === 0) return new Map()
  const users = await User.find({ _id: { $in: participantIds } }).select('privacy.readReceipts').lean()
  return new Map(users.map((user) => [String(user._id), user.privacy?.readReceipts !== false]))
}

// Contrairement aux groupes, une conversation directe ne dénormalise pas les
// noms de ses participants dans le document (pas de `members` stocké — voir
// lib/models/Conversation.ts). `toConversationView` seul ne peut donc jamais
// afficher le nom de l'interlocuteur pour un type 'direct' : on le résout ici
// à la lecture, depuis de vrais documents User, jamais depuis le client.
export async function resolveDirectMemberNames(participantIds: string[]): Promise<Map<string, string>> {
  if (participantIds.length === 0) return new Map()
  const users = await User.find({ _id: { $in: participantIds } }).lean()
  return new Map(users.map((user) => [String(user._id), `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email]))
}
