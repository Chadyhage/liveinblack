import test from 'node:test'
import assert from 'node:assert/strict'
import {
  makeUniqueOrganizerSlug,
  slugifyOrganizer,
  validateOrganizerSlug,
} from '../src/utils/organizers.js'

test('normalise un nom public en slug partageable', () => {
  assert.equal(slugifyOrganizer('  Black Room Lomé  '), 'black-room-lome')
})

test('refuse les slugs réservés', () => {
  const result = validateOrganizerSlug('admin', [])
  assert.equal(result.ok, false)
  assert.match(result.error, /réservé/i)
})

test('résout les doublons sans modifier le profil courant', () => {
  const profiles = [
    { id: 'a', slug: 'the-next-play' },
    { id: 'b', slug: 'the-next-play-2' },
  ]
  assert.equal(makeUniqueOrganizerSlug('The Next Play', profiles, 'c'), 'the-next-play-3')
  assert.equal(validateOrganizerSlug('the-next-play', profiles, 'a').ok, true)
})

