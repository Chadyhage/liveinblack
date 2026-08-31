import type { ConversationMember, ConversationView, MessageView } from './types'

const AVATAR_COLORS = ['var(--primary)', '#c8a96e', '#c8a96e', '#3b82f6', 'var(--primary-strong)', '#f59e0b']

const ERROR_MESSAGES: Record<string, string> = {
  auth_required: 'Ta session a expiré — reconnecte-toi.',
  user_not_found: 'Aucun compte trouvé avec cet email.',
  cannot_message_self: 'Tu ne peux pas te contacter toi-même.',
  cannot_block_self: 'Tu ne peux pas te bloquer toi-même.',
  cannot_report_self: 'Tu ne peux pas te signaler toi-même.',
  cannot_friend_self: 'Tu ne peux pas être ton propre ami.',
  blocked: 'Impossible — un blocage existe entre vos deux comptes.',
  empty_message: 'Le message est vide.',
  message_too_long: 'Message trop long.',
  muted: 'Tu es en sourdine dans ce groupe.',
  conversation_not_found: 'Conversation introuvable.',
  message_not_found: 'Message introuvable.',
  group_name_required: 'Le nom du groupe est requis.',
  not_enough_members: 'Ajoute au moins un autre membre.',
  admin_only: "Réservé à l'administrateur du groupe.",
  not_a_member: "Cette personne n'est pas membre du groupe.",
  already_a_member: 'Cette personne est déjà membre du groupe.',
  too_many_members: 'Le groupe a atteint sa taille maximale.',
  cannot_remove_self: 'Utilise "Quitter le groupe" pour te retirer toi-même.',
  only_admin: "Nomme un autre administrateur avant de te retirer ce rôle.",
  target_is_admin: 'Impossible de mettre en sourdine un autre administrateur.',
  not_message_owner: "Tu ne peux modifier ou supprimer que tes propres messages.",
  invalid_type: 'Action impossible sur ce type de message.',
  message_deleted: 'Ce message a été supprimé.',
  forward_failed: "Le transfert n'a abouti dans aucune conversation.",
  already_friends: 'Vous êtes déjà amis.',
  request_already_pending: 'Une demande est déjà en attente.',
  request_not_pending: 'Cette demande a déjà été traitée.',
  request_not_found: 'Demande introuvable.',
  not_friends: "Vous n'êtes pas amis.",
  invalid_options: 'Options de sondage invalides (2 à 6, non vides, sans doublon).',
  question_required: 'La question du sondage est requise.',
  reason_required: 'Un motif est requis.',
  file_too_large: 'Fichier trop volumineux.',
  upload_failed: "L'envoi du fichier a échoué.",
}

export const NEW_FRIEND_IDS_STORAGE_KEY = 'liveinblack:newFriendIds'

export function errorMessageFor(code: string | undefined): string {
  if (!code) return 'Une erreur est survenue.'
  return ERROR_MESSAGES[code] ?? 'Une erreur est survenue.'
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

export function persistNewFriendIds(ids: Set<string>): void {
  try {
    window.localStorage.setItem(NEW_FRIEND_IDS_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // localStorage indisponible — le badge "Nouveau" ne survivra pas à un
    // rechargement dans ce cas, dégradation silencieuse acceptable.
  }
}

export function isSameDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

export function formatDateSeparator(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(iso, now.toISOString())) return "Aujourd'hui"
  if (isSameDay(iso, yesterday.toISOString())) return 'Hier'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function avatarColorFor(userId: string): string {
  if (!userId) return AVATAR_COLORS[0]
  const code = userId.charCodeAt(userId.length - 1) || 0
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

// Union par id, triée par id croissant (= ordre chronologique, voir
// GetMessagesInput dans lib/server/messaging.ts) — `older` peut contenir des
// messages déjà présents dans `existing` en cas de chevauchement de fenêtre,
// jamais l'inverse ne doit produire de doublon visible dans le fil.
export function mergeMessagesById(older: MessageView[], existing: MessageView[]): MessageView[] {
  const byId = new Map<string, MessageView>()
  for (const message of older) byId.set(message.id, message)
  for (const message of existing) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export function conversationLabel(
  conv: {
    type: ConversationView['type']
    name: ConversationView['name']
    members: Array<{ userId: string; name: string }>
  },
  currentUserId: string
): string {
  if (conv.type === 'group') return conv.name || 'Groupe'
  const other = conv.members.find((member) => member.userId !== currentUserId)
  return other?.name || 'Conversation'
}

export function formatMuteUntil(untilAt: string | null): string {
  if (!untilAt) return "jusqu'à réactivation"
  return `jusqu'au ${new Date(untilAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
}

export function buildReplyPreview(message: Pick<MessageView, 'type' | 'content'>): string {
  if (message.type === 'text') return (message.content || '').slice(0, 60)
  if (message.type === 'image') return 'Photo'
  if (message.type === 'voice') return 'Message vocal'
  if (message.type === 'poll' || message.type === 'event_poll') return 'Sondage'
  return 'Pièce jointe'
}

export function findMentionMatches({
  conversationType,
  editingMessageId,
  composerText,
  members,
  currentUserId,
}: {
  conversationType: ConversationView['type'] | null
  editingMessageId: string | null
  composerText: string
  members: ConversationMember[]
  currentUserId: string
}): ConversationMember[] {
  const mentionMatch = conversationType === 'group' && !editingMessageId ? composerText.match(/(?:^|\s)@([^\s@]*)$/) : null
  if (!mentionMatch) return []

  const query = mentionMatch[1].toLowerCase()
  return members.filter((member) => member.userId !== currentUserId && member.name.toLowerCase().includes(query)).slice(0, 5)
}

export function applyMentionSelection(text: string, memberName: string): string {
  return text.replace(/((?:^|\s)@)[^\s@]*$/, `$1${memberName} `)
}
