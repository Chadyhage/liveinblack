import test from 'node:test'
import assert from 'node:assert/strict'

class MemoryStorage {
  constructor() { this.items = new Map() }
  getItem(key) { return this.items.has(key) ? this.items.get(key) : null }
  setItem(key, value) { this.items.set(key, String(value)) }
  removeItem(key) { this.items.delete(key) }
  clear() { this.items.clear() }
}

globalThis.localStorage = new MemoryStorage()

const {
  getGroupMemberMute,
  isGroupMemberMuted,
  canSendInConversation,
  setGroupMemberMute,
  clearGroupMemberMute,
  sendMessage,
  getMessages,
} = await import('../src/utils/messaging.js')

const NOW = Date.UTC(2026, 6, 10, 18, 0, 0)

function saveConversation(conversation) {
  localStorage.setItem('lib_conversations', JSON.stringify([conversation]))
  localStorage.setItem('lib_messages', JSON.stringify({}))
}

function makeGroup(memberMutes = {}) {
  return {
    id: 'grp-moderation',
    type: 'group',
    name: 'Groupe de test',
    members: [
      { userId: 'admin', name: 'Admin', role: 'admin' },
      { userId: 'member', name: 'Membre', role: 'member' },
      { userId: 'admin-2', name: 'Deuxième admin', role: 'admin' },
    ],
    participantIds: ['admin', 'member', 'admin-2'],
    adminIds: ['admin', 'admin-2'],
    memberMutes,
    updatedAt: new Date(NOW).toISOString(),
  }
}

test('la sourdine temporaire bloque l’envoi jusqu’à son échéance', () => {
  const group = makeGroup({
    member: { untilAtMs: NOW + 60 * 60 * 1000, mutedById: 'admin', mutedByName: 'Admin' },
  })
  saveConversation(group)

  assert.equal(isGroupMemberMuted(group, 'member', NOW), true)
  assert.equal(getGroupMemberMute(group, 'member', NOW)?.untilAtMs, NOW + 60 * 60 * 1000)
  assert.deepEqual(canSendInConversation(group.id, 'member', 'text', NOW).ok, false)
  assert.equal(sendMessage(group.id, 'member', 'Membre', 'text', 'Message interdit', {}, NOW).blocked, true)
  assert.deepEqual(getMessages(group.id), [])
  assert.equal(canSendInConversation(group.id, 'admin', 'text', NOW).ok, true)
})

test('une sourdine expirée ne bloque plus le membre', () => {
  const group = makeGroup({
    member: { untilAtMs: NOW - 1, mutedById: 'admin', mutedByName: 'Admin' },
  })
  saveConversation(group)

  assert.equal(getGroupMemberMute(group, 'member', NOW), null)
  assert.equal(isGroupMemberMuted(group, 'member', NOW), false)
  assert.equal(canSendInConversation(group.id, 'member', 'text', NOW).ok, true)
})

test('seul un administrateur peut activer ou lever la sourdine, jamais sur un autre admin', () => {
  saveConversation(makeGroup())

  assert.equal(setGroupMemberMute('grp-moderation', 'member', 'Membre', 'admin', 15 * 60 * 1000, NOW).reason, 'not_admin')
  assert.equal(setGroupMemberMute('grp-moderation', 'admin', 'Admin', 'admin-2', 15 * 60 * 1000, NOW).reason, 'target_is_admin')

  const applied = setGroupMemberMute('grp-moderation', 'admin', 'Admin', 'member', 15 * 60 * 1000, NOW)
  assert.equal(applied.ok, true)
  assert.equal(canSendInConversation('grp-moderation', 'member', 'text', NOW).reason, 'muted')

  assert.equal(clearGroupMemberMute('grp-moderation', 'member', 'member').reason, 'not_admin')
  assert.equal(clearGroupMemberMute('grp-moderation', 'admin', 'member').ok, true)
  assert.equal(canSendInConversation('grp-moderation', 'member', 'text', NOW).ok, true)
})
