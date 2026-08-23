import type { LoadParticipantConversationLike } from './messagingServiceTypes'
import {
  clearConversationHistoryForCaller,
  hideConversationForCaller,
  muteConversationForCaller,
  pinConversationForCaller,
  type ConversationIdInput,
  unmuteConversationForCaller,
  unpinConversationForCaller,
} from './messagingConversationPreferencesService'
import {
  listConversationTypingUsers,
  setConversationTypingState,
  type SetTypingInput,
  type TypingUserView,
} from './messagingTypingService'
import {
  listBlockedSafetyUsers,
  listSafetyReports,
  type ListBlockedUsersResult,
  type ListMyReportsResult,
  type SafetyListsCaller,
} from './messagingSafetyListsService'

export interface MessagingWorkspaceCaller extends SafetyListsCaller {
  id: string
}

export interface MessagingWorkspaceDependencies<TConversation> {
  loadParticipantConversation: LoadParticipantConversationLike<TConversation>
  resolveDirectMemberNames: (participantIds: string[]) => Promise<Map<string, string>>
}

export async function pinConversationWorkspace<TConversation extends { _id: unknown }>(
  caller: MessagingWorkspaceCaller,
  input: ConversationIdInput,
  deps: Pick<MessagingWorkspaceDependencies<TConversation>, 'loadParticipantConversation'>,
) {
  return pinConversationForCaller(caller, input, deps.loadParticipantConversation)
}

export async function unpinConversationWorkspace<TConversation extends { _id: unknown }>(
  caller: MessagingWorkspaceCaller,
  input: ConversationIdInput,
  deps: Pick<MessagingWorkspaceDependencies<TConversation>, 'loadParticipantConversation'>,
) {
  return unpinConversationForCaller(caller, input, deps.loadParticipantConversation)
}

export async function muteConversationWorkspace<TConversation extends { _id: unknown }>(
  caller: MessagingWorkspaceCaller,
  input: ConversationIdInput,
  deps: Pick<MessagingWorkspaceDependencies<TConversation>, 'loadParticipantConversation'>,
) {
  return muteConversationForCaller(caller, input, deps.loadParticipantConversation)
}

export async function unmuteConversationWorkspace<TConversation extends { _id: unknown }>(
  caller: MessagingWorkspaceCaller,
  input: ConversationIdInput,
  deps: Pick<MessagingWorkspaceDependencies<TConversation>, 'loadParticipantConversation'>,
) {
  return unmuteConversationForCaller(caller, input, deps.loadParticipantConversation)
}

export async function hideConversationWorkspace<TConversation extends { _id: unknown }>(
  caller: MessagingWorkspaceCaller,
  input: ConversationIdInput,
  deps: Pick<MessagingWorkspaceDependencies<TConversation>, 'loadParticipantConversation'>,
) {
  return hideConversationForCaller(caller, input, deps.loadParticipantConversation)
}

export async function clearConversationHistoryWorkspace<TConversation>(
  caller: MessagingWorkspaceCaller,
  input: ConversationIdInput,
  deps: Pick<MessagingWorkspaceDependencies<TConversation>, 'loadParticipantConversation'>,
) {
  return clearConversationHistoryForCaller(caller, input, deps.loadParticipantConversation)
}

export async function setTypingWorkspace<TConversation extends { _id: unknown }>(
  caller: MessagingWorkspaceCaller,
  input: SetTypingInput,
  deps: Pick<MessagingWorkspaceDependencies<TConversation>, 'loadParticipantConversation'>,
) {
  return setConversationTypingState(caller, input, deps.loadParticipantConversation)
}

export async function getTypingUsersWorkspace<
  TConversation extends {
    type: 'direct' | 'group'
    members?: Array<{ userId: string; name?: string | null }> | null
    typingAt?: unknown
  },
>(
  caller: MessagingWorkspaceCaller,
  input: ConversationIdInput,
  deps: MessagingWorkspaceDependencies<TConversation>,
): Promise<{ ok: true; users: TypingUserView[] } | { ok: false; status: number; error: string }> {
  return listConversationTypingUsers(
    caller,
    input,
    deps.loadParticipantConversation,
    deps.resolveDirectMemberNames,
  )
}

export async function listWorkspaceReports(caller: MessagingWorkspaceCaller): Promise<ListMyReportsResult> {
  return listSafetyReports(caller)
}

export async function listWorkspaceBlockedUsers(caller: MessagingWorkspaceCaller): Promise<ListBlockedUsersResult> {
  return listBlockedSafetyUsers(caller)
}
