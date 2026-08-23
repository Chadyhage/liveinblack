import { beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import Conversation from '@/lib/models/Conversation'
import User from '@/lib/models/User'
import {
  loadParticipantConversation,
  normalizeObjectId,
  resolveDisplayName,
} from '../messaging/messagingCoreService'

vi.mock('../../models/Conversation', () => ({
  default: {
    findById: vi.fn(),
  },
}))

vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
  },
}))

describe('messagingCoreService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalise un ObjectId en chaîne canonique', () => {
    expect(normalizeObjectId('507F1F77BCF86CD799439011')).toBe(
      new mongoose.Types.ObjectId('507F1F77BCF86CD799439011').toString(),
    )
  })

  it('résout un nom complet ou l’email en repli', async () => {
    vi.mocked(User.findById)
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ firstName: 'Alice', lastName: 'A', email: 'alice@test.com' }) } as never)
      .mockReturnValueOnce({ lean: vi.fn().mockResolvedValue({ firstName: '', lastName: '', email: 'fallback@test.com' }) } as never)

    await expect(resolveDisplayName('u1')).resolves.toBe('Alice A')
    await expect(resolveDisplayName('u2')).resolves.toBe('fallback@test.com')
  })

  it('charge seulement une conversation où l’appelant participe', async () => {
    vi.mocked(Conversation.findById)
      .mockResolvedValueOnce({ participantIds: ['u1', 'u2'] } as never)
      .mockResolvedValueOnce({ participantIds: ['u2'] } as never)

    await expect(loadParticipantConversation('507f1f77bcf86cd799439011', 'u1')).resolves.toMatchObject({ ok: true })
    await expect(loadParticipantConversation('507f1f77bcf86cd799439012', 'u1')).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'conversation_not_found',
    })
  })

  it('rejette un conversationId invalide', async () => {
    await expect(loadParticipantConversation('bad-id', 'u1')).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'conversation_not_found',
    })
  })
})
