import type { LoadParticipantMessageLike } from './messagingServiceTypes'
import { editParticipantTextMessage, type EditMessageCaller, type EditMessageInput } from './messagingEditService'
import {
  deleteMessageForCaller,
  deleteMessageForEveryone,
  type MessageActionCaller,
  type MessageIdInput,
  starMessageForCaller,
  unstarMessageForCaller,
} from './messagingMessageActionsService'
import type { MessageView } from './messagingViews'

export interface MessageWorkflowDependencies<TMessage, TConversation> {
  loadParticipantMessage: LoadParticipantMessageLike<TMessage, TConversation>
}

export async function editMessageWorkflow<
  TMessage extends {
    senderId: string
    type: string
    deletedForAll?: boolean
    content?: string | null
    editedAt?: Date | null
    save: () => Promise<unknown>
    toObject: (options: { flattenMaps: true }) => unknown
  },
  TConversation extends {
    toObject: (options: { flattenMaps: true }) => unknown
  },
>(
  caller: EditMessageCaller,
  input: EditMessageInput,
  deps: MessageWorkflowDependencies<TMessage, TConversation> & {
    resolveReadReceiptsAllowed: (participantIds: string[]) => Promise<Map<string, boolean>>
  },
): Promise<{ ok: true; message: MessageView } | { ok: false; status: number; error: string }> {
  return editParticipantTextMessage(
    caller,
    input,
    deps.loadParticipantMessage,
    deps.resolveReadReceiptsAllowed,
  )
}

export async function deleteMessageForMeWorkflow<TMessage extends { _id: unknown }, TConversation>(
  caller: MessageActionCaller,
  input: MessageIdInput,
  deps: MessageWorkflowDependencies<TMessage, TConversation>,
) {
  return deleteMessageForCaller(caller, input, deps.loadParticipantMessage)
}

export async function deleteMessageForAllWorkflow<TMessage extends { _id: unknown; senderId: string }, TConversation>(
  caller: MessageActionCaller,
  input: MessageIdInput,
  deps: MessageWorkflowDependencies<TMessage, TConversation>,
) {
  return deleteMessageForEveryone(caller, input, deps.loadParticipantMessage)
}

export async function starMessageWorkflow<TMessage extends { _id: unknown }, TConversation>(
  caller: MessageActionCaller,
  input: MessageIdInput,
  deps: MessageWorkflowDependencies<TMessage, TConversation>,
) {
  return starMessageForCaller(caller, input, deps.loadParticipantMessage)
}

export async function unstarMessageWorkflow<TMessage extends { _id: unknown }, TConversation>(
  caller: MessageActionCaller,
  input: MessageIdInput,
  deps: MessageWorkflowDependencies<TMessage, TConversation>,
) {
  return unstarMessageForCaller(caller, input, deps.loadParticipantMessage)
}
