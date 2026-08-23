import ProviderProfile from '@/lib/models/ProviderProfile'
import User from '@/lib/models/User'
import type { LoadParticipantConversationLike } from './messagingServiceTypes'

export interface ContactPhoneCaller {
  id: string
}

export interface ContactPhoneInput {
  conversationId: string
}

export async function resolveConversationContactPhone<
  TConversation extends { type: 'direct' | 'group'; participantIds: string[] },
>(
  caller: ContactPhoneCaller,
  input: ContactPhoneInput,
  loadParticipantConversation: LoadParticipantConversationLike<TConversation>,
): Promise<{ ok: true; phone: string | null } | { ok: false; status: number; error: string }> {
  const conversationId = input.conversationId?.trim()
  if (!conversationId) return { ok: false, status: 400, error: 'invalid_input' }

  const guard = await loadParticipantConversation(conversationId, caller.id)
  if (!guard.ok) return guard

  const { conversation } = guard
  if (conversation.type !== 'direct') return { ok: false, status: 400, error: 'invalid_type' }

  const otherId = conversation.participantIds.find((participantId) => participantId !== caller.id)
  if (!otherId) return { ok: true, phone: null }

  const other = await User.findById(otherId).lean()
  const proPhone = other?.phone?.trim()
  if (proPhone) return { ok: true, phone: proPhone }

  const provider = await ProviderProfile.findOne({ userId: otherId }).lean()
  const providerPhone = provider?.phone?.trim()
  return { ok: true, phone: providerPhone || null }
}
