import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PROVIDER_CATEGORIES,
  getPrimaryProviderType,
  getProviderCategories,
  getProviderTypes,
  normalizeProviderType,
  normalizeProviderTypes,
  providerMatchesCategory,
} from '../src/utils/providerCategories.js'
import { getRequiredDocs } from '../src/utils/applications.js'

test('legacy provider types remain readable', () => {
  assert.equal(normalizeProviderType('prestation'), 'artiste')
  assert.equal(normalizeProviderType('supermarche'), 'food')
  assert.deepEqual(getProviderTypes({ prestataireType: 'photographe' }), ['photo_video'])
  assert.deepEqual(getProviderTypes({ prestataireType: 'artiste', specialties: ['Afro house'] }), ['artiste'])
})

test('multi-category profiles keep order, remove duplicates and expose a primary type', () => {
  const profile = { prestataireTypes: ['photo_video', 'decoration', 'photo_video'] }
  assert.deepEqual(getProviderTypes(profile), ['photo_video', 'decoration'])
  assert.equal(getPrimaryProviderType(profile), 'photo_video')
  assert.deepEqual(getProviderCategories(profile).map(category => category.id), ['photo_video', 'decoration'])
})

test('directory filters match every selected activity, not only the primary one', () => {
  const provider = { prestataireType: 'artiste', prestataireTypes: ['artiste', 'communication'] }
  assert.equal(providerMatchesCategory(provider, 'artiste'), true)
  assert.equal(providerMatchesCategory(provider, 'communication'), true)
  assert.equal(providerMatchesCategory(provider, 'salle'), false)
})

test('profiles without a category remain valid and fall back to other services', () => {
  assert.deepEqual(normalizeProviderTypes([], null), [])
  assert.deepEqual(getProviderTypes({ prestataireTypes: [] }), ['autre'])
  assert.equal(PROVIDER_CATEGORIES.some(category => category.id === 'autre'), true)
})

test('required documents are the union of every selected activity', () => {
  const docs = getRequiredDocs('prestataire', ['artiste', 'salle'])
  for (const key of ['identity', 'billing_proof', 'business_doc', 'insurance', 'exploitation_proof']) {
    assert.equal(docs.includes(key), true, `${key} should be required`)
  }
  assert.equal(new Set(docs).size, docs.length)
  assert.deepEqual(getRequiredDocs('prestataire', []), ['identity'])
})
