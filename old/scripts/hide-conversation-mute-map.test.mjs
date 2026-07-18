import test from 'node:test'
import assert from 'node:assert/strict'

// Régression : hideConversationForUser plantait (TypeError .filter) quand
// lib_muted_convs[myId] était une MAP { convId: untilMs } (format depuis la
// refonte sourdine f97cb41), ce qui avortait la fonction AVANT la persistance.
// On mock localStorage puis on vérifie qu'aucune exception n'est levée et que
// l'état est bien écrit.

const store = new Map()
global.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)) },
  removeItem: k => { store.delete(k) },
  clear: () => { store.clear() },
}

const { hideConversationForUser } = await import('../src/utils/messaging.js')

test('hideConversationForUser ne plante pas quand lib_muted_convs est une MAP', () => {
  store.clear()
  // Format MAP (untilMs) — c'est ce qui faisait planter le .filter d'origine.
  // 0 = sourdine « jusqu'à réactivation » (permanente), jamais purgée.
  store.set('lib_muted_convs', JSON.stringify({ me: { c1: 0, c2: 0 } }))

  let hidden
  assert.doesNotThrow(() => { hidden = hideConversationForUser('me', 'c1') })

  // La conversation est bien masquée (fonction allée jusqu'au bout).
  assert.deepEqual(hidden, ['c1'])
  const hiddenStore = JSON.parse(store.get('lib_hidden_conversations'))
  assert.deepEqual(hiddenStore.me, ['c1'])

  // La sourdine de la conv masquée est purgée, l'autre conservée.
  const muted = JSON.parse(store.get('lib_muted_convs')).me
  assert.equal('c1' in muted, false)
  assert.equal('c2' in muted, true)
})

test('hideConversationForUser reste compatible avec l\'ancien format TABLEAU', () => {
  store.clear()
  store.set('lib_muted_convs', JSON.stringify({ me: ['c1', 'c9'] }))

  let hidden
  assert.doesNotThrow(() => { hidden = hideConversationForUser('me', 'c1') })
  assert.deepEqual(hidden, ['c1'])
  // clearConvMute migre le tableau en map puis retire c1 ; c9 survit.
  const muted = JSON.parse(store.get('lib_muted_convs')).me
  assert.equal('c1' in muted, false)
  assert.equal('c9' in muted, true)
})
