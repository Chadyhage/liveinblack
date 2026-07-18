import test from 'node:test'
import assert from 'node:assert/strict'
import { filterVisibleConversations } from '../src/utils/messaging.js'

const conversations = [
  { id: 'visible-direct', type: 'direct', participants: ['me', 'active-user'] },
  { id: 'deleted-direct', type: 'direct', participants: ['me', 'deleted-user'] },
  { id: 'other-direct', type: 'direct', participants: ['someone', 'else'] },
  { id: 'my-group', type: 'group', members: [{ userId: 'me' }, { userId: 'friend' }] },
]

test('masque une conversation uniquement pour le compte qui a choisi de la retirer', () => {
  const visibleForMe = filterVisibleConversations(conversations, 'me', ['deleted-direct'])
  assert.deepEqual(visibleForMe.map(item => item.id), ['visible-direct', 'my-group'])

  const visibleForDeletedUser = filterVisibleConversations(conversations, 'deleted-user', [])
  assert.deepEqual(visibleForDeletedUser.map(item => item.id), ['deleted-direct'])
})

test('les groupes et conversations non membres ne sont pas affectés par le masquage', () => {
  const visible = filterVisibleConversations(conversations, 'me', ['missing-id'])
  assert.deepEqual(visible.map(item => item.id), ['visible-direct', 'deleted-direct', 'my-group'])
})
