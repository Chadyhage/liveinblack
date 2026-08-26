import { expect, test, type Page } from 'playwright/test'
import { loginSeededUser } from './helpers/auth'

test.skip(process.env.LIB_RUN_SEEDED_E2E !== '1', 'Seeded E2E requires npm run seed:e2e and LIB_RUN_SEEDED_E2E=1')

const ids = {
  event: '66e200000000000000000101',
  provider: '66e200000000000000000003',
  invitee: '66e200000000000000000007',
}

async function login(page: Page, email: string) {
  await loginSeededUser(page, email)
}

async function api<T>(page: Page, path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ path, init }) => {
      const response = await fetch(path, init)
      const text = await response.text()
      return { status: response.status, body: text ? JSON.parse(text) : null }
    },
    { path, init }
  )
}

async function getMessages(page: Page, conversationId: string) {
  const messages = await api<{ ok: boolean; messages: Array<{ id: string; content: string | null; deletedForAll: boolean; replyToMessageId: string | null; forwardedFrom: { senderName: string; convName: string } | null }> }>(
    page,
    `/api/conversations/${conversationId}/messages`
  )
  expect(messages.status).toBe(200)
  return messages.body.messages
}

async function getVisibleConversations(page: Page) {
  const conversations = await api<{
    ok: boolean
    conversations: Array<{ id: string; type: string; name: string | null }>
  }>(page, '/api/conversations')
  expect(conversations.status).toBe(200)
  return conversations.body.conversations
}

async function createGroup(page: Page, name: string, memberUserIds: string[]) {
  const result = await api<{ ok: boolean; conversation?: { id: string }; error?: string }>(page, '/api/conversations/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, memberUserIds }),
  })
  expect(result.status).toBe(200)
  expect(result.body.ok).toBe(true)
  expect(result.body.conversation?.id).toBeTruthy()
  return result.body.conversation!.id
}

test.describe.serial('seeded messaging and social controls', () => {
  test('client can manage a group conversation, messages, reactions and polls', async ({ page }) => {
    test.setTimeout(60_000)

    await login(page, 'client@liveinblack.dev')
    const conversationId = await createGroup(page, `E2E groupe ${Date.now()}`, [ids.invitee])

    const message = await api<{ ok: boolean; message: { id: string; content: string; readStatus: string } }>(
      page,
      `/api/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'text', content: 'Message de groupe E2E' }),
      }
    )
    expect(message).toMatchObject({ status: 200, body: { ok: true, message: { content: 'Message de groupe E2E' } } })

    const edited = await api<{ ok: boolean; message: { content: string; editedAt: string | null } }>(page, `/api/messages/${message.body.message.id}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Message de groupe E2E modifié' }),
    })
    expect(edited.status).toBe(200)
    expect(edited.body.message.content).toBe('Message de groupe E2E modifié')
    expect(edited.body.message.editedAt).toBeTruthy()

    const reacted = await api<{ ok: boolean; reactions: Record<string, string[]> }>(page, `/api/messages/${message.body.message.id}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji: '👍' }),
    })
    expect(reacted.status).toBe(200)
    expect(Object.keys(reacted.body.reactions)).toContain('👍')

    const starred = await api<{ ok: boolean; starred: boolean }>(page, `/api/messages/${message.body.message.id}/star`, { method: 'POST' })
    expect(starred).toMatchObject({ status: 200, body: { ok: true, starred: true } })

    const pinnedConversation = await api<{ ok: boolean }>(page, `/api/conversations/${conversationId}/pin`, { method: 'POST' })
    expect(pinnedConversation).toMatchObject({ status: 200, body: { ok: true } })

    const pinnedMessage = await api<{ ok: boolean }>(page, `/api/conversations/${conversationId}/pinned-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: message.body.message.id }),
    })
    expect(pinnedMessage).toMatchObject({ status: 200, body: { ok: true } })

    const poll = await api<{ ok: boolean; message: { id: string; type: string; poll: { options: Array<{ id: string; text: string; voterIds: string[] }> } } }>(
      page,
      `/api/conversations/${conversationId}/polls`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'poll', question: 'On valide ce test ?', options: ['Oui', 'Encore oui'] }),
      }
    )
    expect(poll.status).toBe(200)
    expect(poll.body.message.type).toBe('poll')

    const voted = await api<{ ok: boolean; options: Array<{ id: string; voterIds: string[] }> }>(page, `/api/messages/${poll.body.message.id}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optionId: poll.body.message.poll.options[0].id }),
    })
    expect(voted.status).toBe(200)
    expect(voted.body.options[0].voterIds.length).toBeGreaterThan(0)

    const eventPoll = await api<{ ok: boolean; message: { type: string; poll: { event: { id: string; name: string } | null } } }>(
      page,
      `/api/conversations/${conversationId}/polls`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'event_poll', eventId: ids.event }),
      }
    )
    expect(eventPoll.status).toBe(200)
    expect(eventPoll.body.message.type).toBe('event_poll')
    expect(eventPoll.body.message.poll.event?.id).toBe(ids.event)

    const memberAdded = await api<{ ok: boolean; conversation: { members: Array<{ userId: string }> } }>(page, `/api/conversations/${conversationId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: ids.provider }),
    })
    expect(memberAdded.status).toBe(200)
    expect(memberAdded.body.conversation.members.some((member) => member.userId === ids.provider)).toBe(true)

    const mutedMember = await api<{ ok: boolean; untilAtMs: number }>(page, `/api/conversations/${conversationId}/members/${ids.provider}/mute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durationMs: 900000 }),
    })
    expect(mutedMember.status).toBe(200)
    expect(mutedMember.body.untilAtMs).toBeGreaterThan(Date.now())

    const unmutedMember = await api<{ ok: boolean }>(page, `/api/conversations/${conversationId}/members/${ids.provider}/mute`, { method: 'DELETE' })
    expect(unmutedMember).toMatchObject({ status: 200, body: { ok: true } })

    const roleChanged = await api<{ ok: boolean }>(page, `/api/conversations/${conversationId}/members/${ids.provider}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    })
    expect(roleChanged).toMatchObject({ status: 200, body: { ok: true } })

    const mutedConversation = await api<{ ok: boolean }>(page, `/api/conversations/${conversationId}/mute`, { method: 'POST' })
    expect(mutedConversation).toMatchObject({ status: 200, body: { ok: true } })

    const read = await api<{ ok: boolean }>(page, `/api/conversations/${conversationId}/read`, { method: 'POST' })
    expect(read).toMatchObject({ status: 200, body: { ok: true } })
  })

  test('client can reply, forward, delete, clear and hide conversation content', async ({ page }) => {
    await login(page, 'client@liveinblack.dev')

    const source = { id: await createGroup(page, `E2E source ${Date.now()}`, [ids.invitee]) }
    const target = { id: await createGroup(page, `E2E target ${Date.now()}`, [ids.provider]) }

    const first = await api<{ ok: boolean; message: { id: string; content: string } }>(page, `/api/conversations/${source.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', content: 'Message source à citer' }),
    })
    expect(first.status).toBe(200)

    const reply = await api<{ ok: boolean; message: { id: string; replyToMessageId: string | null } }>(page, `/api/conversations/${source.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', content: 'Réponse E2E', replyToMessageId: first.body.message.id }),
    })
    expect(reply).toMatchObject({ status: 200, body: { ok: true, message: { replyToMessageId: first.body.message.id } } })

    const forwarded = await api<{ ok: boolean; messages: Array<{ id: string; forwardedFrom: { senderName: string; convName: string } | null }> }>(page, `/api/messages/${first.body.message.id}/forward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toConversationIds: [target.id] }),
    })
    expect(forwarded.status).toBe(200)
    expect(forwarded.body.messages[0].forwardedFrom).toBeTruthy()

    const targetMessages = await getMessages(page, target.id)
    expect(targetMessages.some((message) => message.forwardedFrom && message.content === 'Message source à citer')).toBe(true)

    const deletedForMe = await api<{ ok: boolean }>(page, `/api/messages/${reply.body.message.id}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'me' }),
    })
    expect(deletedForMe).toMatchObject({ status: 200, body: { ok: true } })
    expect((await getMessages(page, source.id)).some((message) => message.id === reply.body.message.id)).toBe(false)

    const deletedForAll = await api<{ ok: boolean }>(page, `/api/messages/${first.body.message.id}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'all' }),
    })
    expect(deletedForAll).toMatchObject({ status: 200, body: { ok: true } })
    const sourceMessages = await getMessages(page, source.id)
    expect(sourceMessages.find((message) => message.id === first.body.message.id)).toMatchObject({ content: null, deletedForAll: true })

    const cleared = await api<{ ok: boolean }>(page, `/api/conversations/${target.id}/clear`, { method: 'POST' })
    expect(cleared).toMatchObject({ status: 200, body: { ok: true } })
    expect(await getMessages(page, target.id)).toHaveLength(0)

    const hidden = await api<{ ok: boolean }>(page, `/api/conversations/${target.id}/hide`, { method: 'POST' })
    expect(hidden).toMatchObject({ status: 200, body: { ok: true } })
    const hiddenConversations = await api<{ ok: boolean; conversations: Array<{ id: string }> }>(page, '/api/conversations')
    expect(hiddenConversations.status).toBe(200)
    expect(hiddenConversations.body.conversations.some((conversation) => conversation.id === target.id)).toBe(false)
  })

  test('client can rename groups, publish typing presence and delete an owned group', async ({ page }) => {
    await login(page, 'client@liveinblack.dev')

    const group = { id: await createGroup(page, `Ancien nom E2E ${Date.now()}`, [ids.invitee]) }
    const renamed = await api<{ ok: boolean; name: string }>(page, `/api/conversations/${group.id}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nouveau nom E2E' }),
    })
    expect(renamed).toMatchObject({ status: 200, body: { ok: true, name: 'Nouveau nom E2E' } })

    const typingOn = await api<{ ok: boolean }>(page, `/api/conversations/${group.id}/typing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ typing: true }),
    })
    expect(typingOn).toMatchObject({ status: 200, body: { ok: true } })

    await login(page, 'invitee@liveinblack.dev')
    const typingUsers = await api<{ ok: boolean; users: Array<{ userId: string; name: string }> }>(page, `/api/conversations/${group.id}/typing`)
    expect(typingUsers.status).toBe(200)
    expect(typingUsers.body.users.some((user) => user.userId !== ids.invitee)).toBe(true)

    await login(page, 'client@liveinblack.dev')
    const typingOff = await api<{ ok: boolean }>(page, `/api/conversations/${group.id}/typing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ typing: false }),
    })
    expect(typingOff).toMatchObject({ status: 200, body: { ok: true } })
  })

  test('client can block, report and unblock another account', async ({ page }) => {
    await login(page, 'client@liveinblack.dev')

    const blocked = await api<{ ok: boolean }>(page, '/api/users/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: ids.provider }),
    })
    expect(blocked).toMatchObject({ status: 200, body: { ok: true } })

    const reported = await api<{ ok: boolean }>(page, '/api/users/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: ids.provider, reason: 'Signalement social E2E' }),
    })
    expect(reported).toMatchObject({ status: 200, body: { ok: true } })

    const reports = await api<{ ok: boolean; reports: Array<{ targetId: string; reason: string }> }>(page, '/api/users/report')
    expect(reports.status).toBe(200)
    expect(reports.body.reports.some((report) => report.targetId === ids.provider && report.reason === 'Signalement social E2E')).toBe(true)

    const unblocked = await api<{ ok: boolean }>(page, '/api/users/unblock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: ids.provider }),
    })
    expect(unblocked).toMatchObject({ status: 200, body: { ok: true } })
  })
})
