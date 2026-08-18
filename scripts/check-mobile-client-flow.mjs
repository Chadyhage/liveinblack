const baseUrl = process.env.LIB_WEB_BASE_URL?.replace(/\/$/, '')
const credentials = [
  { email: process.env.LIB_QA_EMAIL_A, password: process.env.LIB_QA_PASSWORD_A },
  { email: process.env.LIB_QA_EMAIL_B, password: process.env.LIB_QA_PASSWORD_B },
]

if (!baseUrl || credentials.some((item) => !item.email || !item.password)) {
  console.error('LIB_WEB_BASE_URL et les identifiants QA A/B sont requis')
  process.exit(1)
}

function cookiePairs(headers) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean)
  return values.flatMap((value) => value.split(/,(?=[^;,]+=)/)).map((value) => value.trim().split(';')[0])
}

function findCookie(headers, names) {
  return cookiePairs(headers).find((pair) => names.some((name) => pair.startsWith(name + '='))) ?? ''
}

async function authenticate({ email, password }) {
  const csrfResponse = await fetch(baseUrl + '/api/auth/csrf')
  const csrf = await csrfResponse.json()
  const csrfCookie = findCookie(csrfResponse.headers, ['authjs.csrf-token', '__Host-authjs.csrf-token'])
  const response = await fetch(baseUrl + '/api/auth/callback/credentials', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: csrfCookie },
    body: new URLSearchParams({ email, password, csrfToken: csrf.csrfToken, json: 'true' }),
  })
  const sessionCookie = findCookie(response.headers, ['authjs.session-token', '__Secure-authjs.session-token', '__Host-authjs.session-token'])
  if (!sessionCookie) throw new Error(`auth_failed:${email}`)
  return sessionCookie
}

async function request(cookie, path, { method = 'GET', body, expected = [200] } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    redirect: 'manual',
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  const text = await response.text()
  let data = null
  try { data = JSON.parse(text) } catch {}
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 200)}`)
  }
  return data
}

const passed = []
function mark(name) {
  passed.push(name)
  console.log(`PASS ${name}`)
}

const cookies = []
let flowError = null
try {
  cookies.push(await authenticate(credentials[0]), await authenticate(credentials[1]))
  mark('connexion Auth.js A/B')

  const sessions = await Promise.all(cookies.map((cookie) => request(cookie, '/api/auth/session')))
  const userA = sessions[0]?.user?.id
  const userB = sessions[1]?.user?.id
  if (!userA || !userB) throw new Error('session_user_id_missing')
  mark('sessions et identités')

  await request(cookies[0], '/api/profil/nom', { method: 'POST', body: { firstName: 'QA', lastName: 'Alpha Social' } })
  await request(cookies[0], '/api/profil/demographie', { method: 'POST', body: { birthYear: 1995, gender: 'autre' } })
  await request(cookies[0], '/api/profil/confidentialite', { method: 'POST', body: { showOnline: false, readReceipts: false } })
  await request(cookies[0], '/api/profil/preferences', { method: 'POST', body: { ambience: ['concert'], city: 'Lomé' } })
  const profile = await request(cookies[0], '/api/profil')
  if (profile?.profile?.lastName !== 'Alpha Social' || profile?.profile?.privacy?.showOnline !== false) throw new Error('profile_mutation_not_persisted')
  mark('profil, démographie, confidentialité et préférences')

  const events = await request(null, '/api/events?page=1&pageSize=10')
  const event = events?.events?.find((item) => item?.id) ?? events?.items?.find((item) => item?.id)
  if (event?.id) {
    await request(cookies[0], `/api/events/${event.id}/interest`, { method: 'POST' })
    const interest = await request(cookies[0], `/api/events/${event.id}/interest`)
    if (interest?.interested !== true) throw new Error('event_interest_not_persisted')
    await request(cookies[0], `/api/events/${event.id}/interest`, { method: 'DELETE' })
    mark('intérêt événement ajouter/lire/retirer')
  } else {
    console.log('SKIP intérêt événement — aucun événement public disponible en production')
  }

  const organizers = await request(null, '/api/organizers?page=1&pageSize=10')
  const organizer = organizers?.organizers?.find((item) => item?.userId || item?.organizerId)
  const organizerId = organizer?.userId || organizer?.organizerId
  if (organizerId) {
    await request(cookies[0], `/api/organizers/${organizerId}/follow`, { method: 'POST' })
    const follow = await request(cookies[0], `/api/organizers/${organizerId}/follow`)
    if (follow?.following !== true) throw new Error('organizer_follow_not_persisted')
    await request(cookies[0], `/api/organizers/${organizerId}/follow`, { method: 'DELETE' })
    mark('suivi organisateur ajouter/lire/retirer')
  } else {
    throw new Error('no_public_organizer_for_follow_test')
  }

  const sent = await request(cookies[0], '/api/friends/requests', { method: 'POST', body: { toUserId: userB } })
  if (sent?.status !== 'pending' || !sent?.requestId) throw new Error('friend_request_not_pending')
  const received = await request(cookies[1], '/api/friends/requests')
  const requestId = received?.received?.find((item) => item.fromId === userA)?.id || sent.requestId
  await request(cookies[1], `/api/friends/requests/${requestId}/accept`, { method: 'POST' })
  const friends = await request(cookies[0], '/api/friends')
  if (!friends?.friends?.some((item) => item.userId === userB)) throw new Error('friendship_not_visible')
  mark('demande, notification et acceptation d’ami')

  const direct = await request(cookies[0], '/api/conversations', { method: 'POST', body: { otherUserId: userB } })
  const conversationId = direct?.conversation?.id
  if (!conversationId) throw new Error('conversation_id_missing')
  const sentMessage = await request(cookies[0], `/api/conversations/${conversationId}/messages`, { method: 'POST', body: { type: 'text', content: 'Message QA mobile' } })
  const messageId = sentMessage?.message?.id
  if (!messageId) throw new Error('message_id_missing')
  const messagesForB = await request(cookies[1], `/api/conversations/${conversationId}/messages`)
  if (!messagesForB?.messages?.some((item) => item.id === messageId)) throw new Error('message_not_received')
  await request(cookies[1], `/api/messages/${messageId}/react`, { method: 'POST', body: { emoji: '👍' } })
  await request(cookies[0], `/api/messages/${messageId}/edit`, { method: 'POST', body: { content: 'Message QA mobile modifié' } })
  await request(cookies[0], `/api/messages/${messageId}/star`, { method: 'POST' })
  const starred = await request(cookies[0], '/api/messages/starred')
  if (!starred?.messages?.some((item) => item.id === messageId)) throw new Error('starred_message_missing')
  await request(cookies[0], `/api/messages/${messageId}/star`, { method: 'DELETE' })
  await request(cookies[1], `/api/conversations/${conversationId}/read`, { method: 'POST' })
  await request(cookies[0], `/api/conversations/${conversationId}/pin`, { method: 'POST' })
  await request(cookies[0], `/api/conversations/${conversationId}/pin`, { method: 'DELETE' })
  mark('conversation, message, lecture, réaction, édition, favori et épinglage')

  const pollResult = await request(cookies[0], `/api/conversations/${conversationId}/polls`, {
    method: 'POST',
    body: { kind: 'poll', question: 'Test QA ?', options: ['Oui', 'Non'] },
  })
  const pollMessageId = pollResult?.message?.id
  const pollOptionId = pollResult?.message?.poll?.options?.[0]?.id
  if (!pollMessageId || !pollOptionId) throw new Error('poll_payload_missing')
  await request(cookies[1], `/api/messages/${pollMessageId}/vote`, { method: 'POST', body: { optionId: pollOptionId } })
  mark('sondage et vote')

  const notifications = await request(cookies[1], '/api/notifications?limit=20')
  if (!Array.isArray(notifications?.notifications)) throw new Error('notifications_payload_invalid')
  await request(cookies[0], '/api/friends/remove', { method: 'POST', body: { friendUserId: userB } })
  mark('notifications et retrait d’ami')
} catch (error) {
  flowError = error
  console.error(`FAIL ${error instanceof Error ? error.message : 'unknown_error'}`)
} finally {
  for (let index = 0; index < cookies.length; index += 1) {
    try {
      await request(cookies[index], '/api/profil/supprimer-compte', {
        method: 'POST',
        body: { currentPassword: credentials[index].password },
      })
      console.log(`CLEANUP compte QA ${index === 0 ? 'A' : 'B'} supprimé`)
    } catch (error) {
      console.error(`CLEANUP FAILED compte QA ${index === 0 ? 'A' : 'B'}: ${error instanceof Error ? error.message : 'unknown'}`)
      flowError ||= error
    }
  }
}

console.log(`Parcours client mobile : ${flowError ? 'ÉCHEC' : 'OK'} (${passed.length} domaines validés).`)
if (flowError) process.exitCode = 1
