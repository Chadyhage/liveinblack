// Tests des options incluses dans un type de place (liaison menu obligatoire).
// Lancer : node scripts/includedOptions.test.mjs
globalThis.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] ?? null },
  setItem(k, v) { this._s[k] = String(v) },
  removeItem(k) { delete this._s[k] },
}

const { includedForPlace, ORDER_SOURCE } = await import('../src/utils/eventOrders.js')

let failed = 0
function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`)
  else { failed++; console.error(`  ✗ ${name}`) }
}

const event = {
  places: [
    { type: 'Entrée simple', price: 5000 },
    {
      type: 'VIP dîner', price: 25000,
      included: [
        { name: 'Dîner', qty: 1 },
        { name: 'Boisson', qty: 2 },
        { name: 'Bouteille', qty: 1 },
        { name: 'Article supprimé du menu', qty: 1 },
      ],
    },
  ],
  menu: [
    { name: 'Dîner', emoji: '🍽️', price: 8000 },
    { name: 'Boisson', emoji: '🍹', price: 2000 },
    { name: 'Bouteille', emoji: '🍾', price: 30000 },
  ],
}

console.log('includedForPlace :')
const vip = includedForPlace(event, 'VIP dîner')
check('3 options retenues (l\'orpheline hors menu est écartée)', vip.length === 3)
check('quantité respectée (2 boissons)', vip.find(i => i.name === 'Boisson')?.qty === 2)
check('toujours gratuit (pas de champ free/prix résiduel)', vip.every(i => i.free === undefined && i.price === undefined))
check('emoji résolu depuis le menu', vip.find(i => i.name === 'Dîner')?.emoji === '🍽️')
check('place sans options → []', includedForPlace(event, 'Entrée simple').length === 0)
check('place inconnue → []', includedForPlace(event, 'Inexistante').length === 0)
check('event null → []', includedForPlace(null, 'VIP dîner').length === 0)
check('event sans menu → [] (lien menu obligatoire)', includedForPlace({ places: event.places }, 'VIP dîner').length === 0)

console.log('Matérialisation (idempotence des ids) :')
const idOf = (ticket, name) => `inc_${ticket}_${String(name).replace(/\s+/g, '_')}`.slice(0, 90)
check('id déterministe par billet+article', idOf('LIB-123', 'Dîner') === idOf('LIB-123', 'Dîner'))
check('ids distincts entre billets', idOf('LIB-123', 'Dîner') !== idOf('LIB-456', 'Dîner'))
check('source included exportée', ORDER_SOURCE.INCLUDED === 'included')

if (failed) { console.error(`\n${failed} test(s) en échec`); process.exit(1) }
console.log('\nTous les tests passent ✓')
