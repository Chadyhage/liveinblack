import { describe, expect, it } from 'vitest'
import {
  applyMentionSelection,
  avatarColorFor,
  buildReplyPreview,
  conversationLabel,
  errorMessageFor,
  findMentionMatches,
  formatDateSeparator,
  formatMuteUntil,
  getInitials,
  isSameDay,
  mergeMessagesById,
} from '../messagingUtils'
import type { ConversationView, MessageView } from '../types'

describe('messagingUtils', () => {
  it('retourne un message d’erreur générique pour un code inconnu', () => {
    expect(errorMessageFor('totally_unknown')).toBe('Une erreur est survenue.')
    expect(errorMessageFor(undefined)).toBe('Une erreur est survenue.')
  })

  it('détermine correctement les séparateurs de date récents', () => {
    const now = new Date('2026-08-20T10:00:00.000Z')
    expect(formatDateSeparator('2026-08-20T09:00:00.000Z', now)).toBe("Aujourd'hui")
    expect(formatDateSeparator('2026-08-19T09:00:00.000Z', now)).toBe('Hier')
  })

  it('compare correctement deux dates sur le même jour local', () => {
    expect(isSameDay('2026-08-20T08:00:00.000Z', '2026-08-20T23:59:59.000Z')).toBe(true)
    expect(isSameDay('2026-08-20T08:00:00.000Z', '2026-08-21T00:00:00.000Z')).toBe(false)
  })

  it('calcule les initiales et une couleur stable pour un avatar', () => {
    expect(getInitials('Jean Michel')).toBe('JM')
    expect(getInitials('  live  ')).toBe('LI')
    expect(getInitials('   ')).toBe('?')
    expect(avatarColorFor('user-42')).toBe(avatarColorFor('user-42'))
  })

  it('fusionne les messages sans doublons et garde l’ordre chronologique', () => {
    const older = [
      { id: '1', createdAt: '2026-08-20T08:00:00.000Z' },
      { id: '2', createdAt: '2026-08-20T08:01:00.000Z' },
    ] as MessageView[]
    const existing = [
      { id: '2', createdAt: '2026-08-20T08:01:00.000Z', content: 'new' },
      { id: '3', createdAt: '2026-08-20T08:02:00.000Z' },
    ] as MessageView[]

    expect(mergeMessagesById(older, existing).map((message) => message.id)).toEqual(['1', '2', '3'])
    expect(mergeMessagesById(older, existing)[1].content).toBe('new')
  })

  it('choisit le bon libellé de conversation', () => {
    const directConversation = {
      type: 'direct',
      name: null,
      members: [
        { userId: 'me', name: 'Moi', role: 'member' },
        { userId: 'u2', name: 'Awa', role: 'member' },
      ],
    } as ConversationView
    const groupConversation = { type: 'group', name: 'Staff VIP', members: [] } as ConversationView

    expect(conversationLabel(directConversation, 'me')).toBe('Awa')
    expect(conversationLabel(groupConversation, 'me')).toBe('Staff VIP')
  })

  it('formate les libellés de mise en sourdine', () => {
    expect(formatMuteUntil(null)).toBe("jusqu'à réactivation")
    expect(formatMuteUntil('2026-08-25T12:30:00.000Z')).toContain("jusqu'au")
  })

  it('construit un aperçu de réponse adapté au type de message', () => {
    expect(buildReplyPreview({ type: 'text', content: 'Bonjour tout le monde' } as MessageView)).toBe('Bonjour tout le monde')
    expect(buildReplyPreview({ type: 'image', content: null } as MessageView)).toBe('Photo')
    expect(buildReplyPreview({ type: 'voice', content: null } as MessageView)).toBe('Message vocal')
    expect(buildReplyPreview({ type: 'poll', content: null } as MessageView)).toBe('Sondage')
    expect(buildReplyPreview({ type: 'event', content: null } as MessageView)).toBe('Pièce jointe')
  })

  it('trouve les correspondances de mention uniquement dans un groupe hors édition', () => {
    const members = [
      { userId: 'me', name: 'Moi', role: 'member' },
      { userId: 'u2', name: 'Awa', role: 'member' },
      { userId: 'u3', name: 'Aude', role: 'member' },
    ] as ConversationView['members']

    expect(
      findMentionMatches({
        conversationType: 'group',
        editingMessageId: null,
        composerText: 'Salut @au',
        members,
        currentUserId: 'me',
      }).map((member) => member.name)
    ).toEqual(['Aude'])

    expect(
      findMentionMatches({
        conversationType: 'direct',
        editingMessageId: null,
        composerText: 'Salut @au',
        members,
        currentUserId: 'me',
      })
    ).toEqual([])
  })

  it('applique correctement la sélection d’une mention', () => {
    expect(applyMentionSelection('Salut @aw', 'Awa')).toBe('Salut @Awa ')
    expect(applyMentionSelection('@au', 'Aude')).toBe('@Aude ')
  })
})
