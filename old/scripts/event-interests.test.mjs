import test from 'node:test'
import assert from 'node:assert/strict'

const store = new Map()
global.localStorage = {
  getItem: key => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => { store.set(key, String(value)) },
  removeItem: key => { store.delete(key) },
  clear: () => { store.clear() },
}

const {
  cacheEventInterests,
  eventInterestSnapshot,
  getEventInterests,
  isInterestedInEvent,
  normalizeEventInterests,
} = await import('../src/utils/eventInterests.js')

test('eventInterestSnapshot keeps the minimum useful event data', () => {
  const snap = eventInterestSnapshot({
    id: 42,
    name: 'After Noir',
    city: 'Paris',
    places: [{ price: 18, available: 4 }, { price: 0, available: 1 }],
  })

  assert.equal(snap.id, '42')
  assert.equal(snap.name, 'After Noir')
  assert.equal(snap.city, 'Paris')
  assert.equal(snap.minPrice, 0)
  assert.equal(snap.hasFreePlace, true)
  assert.equal(snap.remaining, 5)
})

test('normalizeEventInterests deduplicates by event and keeps active state', () => {
  const items = normalizeEventInterests([
    { id: 'a', userId: 'u1', eventId: 'evt1', status: 'active', updatedAt: 10, event: { name: 'First' } },
    { id: 'b', userId: 'u1', eventId: 'evt1', status: 'active', updatedAt: 9, event: { name: 'Duplicate' } },
    { id: 'c', userId: 'u1', eventId: 'evt2', status: 'removed', updatedAt: 8, event: { name: 'Removed' } },
    null,
  ])

  assert.equal(items.length, 2)
  assert.equal(items[0].eventId, 'evt1')
  assert.equal(items[0].event.name, 'First')
  assert.equal(items[1].status, 'removed')
})

test('cacheEventInterests stores data per user', () => {
  localStorage.clear()
  cacheEventInterests('u1', [
    { id: 'u1__evt1', userId: 'u1', eventId: 'evt1', status: 'active', event: { id: 'evt1', name: 'Saved' } },
  ])
  cacheEventInterests('u2', [
    { id: 'u2__evt2', userId: 'u2', eventId: 'evt2', status: 'active', event: { id: 'evt2', name: 'Other' } },
  ])

  assert.equal(isInterestedInEvent('u1', 'evt1'), true)
  assert.equal(isInterestedInEvent('u1', 'evt2'), false)
  assert.equal(getEventInterests('u2')[0].eventId, 'evt2')
})
