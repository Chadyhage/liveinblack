import { describe, expect, it } from 'vitest'
import Conversation from '../Conversation'
import Message from '../Message'

const arrayFields = {
  Conversation: new Set(['participantIds', 'members', 'mutedUserIds', 'pinnedByUserIds', 'mutedConversationByUserIds', 'hiddenByUserIds']),
  Message: new Set(['deletedForUserIds', 'starredByUserIds']),
}

function compoundIndexFields(model: typeof Conversation | typeof Message) {
  return model.schema.indexes().map(([definition]) => Object.keys(definition))
}

describe('MongoDB index safety', () => {
  it('Conversation never compounds two array fields', () => {
    for (const fields of compoundIndexFields(Conversation)) {
      const arrayCount = fields.filter((field) => arrayFields.Conversation.has(field)).length
      expect(arrayCount, fields.join(', ')).toBeLessThanOrEqual(1)
    }
  })

  it('Message never compounds two array fields', () => {
    for (const fields of compoundIndexFields(Message)) {
      const arrayCount = fields.filter((field) => arrayFields.Message.has(field)).length
      expect(arrayCount, fields.join(', ')).toBeLessThanOrEqual(1)
    }
  })
})
