// Tests d'INTÉGRATION (vraie base MongoDB) pour les codes promo côté
// organisateur (#7 phase organisateur — lib/server/organizerPromoCodes.ts,
// port de PromoCodesPanel.jsx). La consommation à l'achat (lib/server/
// promos.ts) est déjà testée ailleurs (promos.test.ts) — ici uniquement la
// gestion organisateur : création, activation/désactivation, suppression.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { createPromoCode, listPromoCodes, togglePromoCodeActive, deletePromoCode } from '../organizerPromoCodes'
import { createOrganizerEvent } from '../organizerEvents'
import Event from '../../models/Event'
import PromoCode from '../../models/PromoCode'

const RUN_INTEGRATION = Boolean(process.env.MONGODB_URI)
const describeIntegration = describe.skipIf(!RUN_INTEGRATION)
const TEST_URI = process.env.MONGODB_URI || ''

beforeAll(async () => {
  if (!RUN_INTEGRATION) return
  await mongoose.connect(TEST_URI)
}, 20000)

afterAll(async () => {
  if (!RUN_INTEGRATION) return
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
})

beforeEach(async () => {
  if (!RUN_INTEGRATION) return
  await Event.deleteMany({})
  await PromoCode.deleteMany({})
})

async function seedEvent(ownerId = 'org-1') {
  const result = await createOrganizerEvent(
    { id: ownerId },
    'Organisateur Test',
    { name: 'Soirée Test', date: '2026-12-31', city: 'Lomé', region: 'Togo', places: [{ id: '', type: 'Standard', price: 20, total: 100 }] }
  )
  if (!result.ok) throw new Error('seed failed')
  return result.eventId
}

describeIntegration('organizerPromoCodes (intégration, vraie base) — codes promo (#7)', () => {
  describe('createPromoCode', () => {
    it("refuse pour quelqu'un d'autre que le propriétaire", async () => {
      const eventId = await seedEvent()
      const result = await createPromoCode({ id: 'intrus' }, eventId, { code: 'TEST20', type: 'percent', value: 20 })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('forbidden')
    })

    it('crée un code pourcentage valide', async () => {
      const eventId = await seedEvent()
      const result = await createPromoCode({ id: 'org-1' }, eventId, { code: 'soiree20', type: 'percent', value: 20 })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.promo.code).toBe('SOIREE20') // normalisé en majuscules
      expect(result.promo.active).toBe(true)
      expect(result.promo.usedCount).toBe(0)
    })

    it('refuse un pourcentage >= 100', async () => {
      const eventId = await seedEvent()
      const result = await createPromoCode({ id: 'org-1' }, eventId, { code: 'FREE100', type: 'percent', value: 100 })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('percent_too_high')
    })

    it('refuse un montant fixe qui couvre le billet le moins cher', async () => {
      const eventId = await seedEvent()
      const result = await createPromoCode({ id: 'org-1' }, eventId, { code: 'BIG', type: 'fixed', value: 20 })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('fixed_covers_cheapest_ticket')
    })

    it('accepte un montant fixe inférieur au billet le moins cher', async () => {
      const eventId = await seedEvent()
      const result = await createPromoCode({ id: 'org-1' }, eventId, { code: 'SMALL', type: 'fixed', value: 5 })
      expect(result.ok).toBe(true)
    })

    it('refuse un code trop court', async () => {
      const eventId = await seedEvent()
      const result = await createPromoCode({ id: 'org-1' }, eventId, { code: 'AB', type: 'percent', value: 10 })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('code_too_short')
    })

    it('refuse un doublon de code sur le même événement', async () => {
      const eventId = await seedEvent()
      await createPromoCode({ id: 'org-1' }, eventId, { code: 'DUPLI', type: 'percent', value: 10 })
      const result = await createPromoCode({ id: 'org-1' }, eventId, { code: 'DUPLI', type: 'percent', value: 20 })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error).toBe('code_taken')
    })
  })

  describe('togglePromoCodeActive / deletePromoCode', () => {
    it('active/désactive un code', async () => {
      const eventId = await seedEvent()
      await createPromoCode({ id: 'org-1' }, eventId, { code: 'TOGGLE', type: 'percent', value: 10 })

      const off = await togglePromoCodeActive({ id: 'org-1' }, eventId, 'toggle')
      expect(off.ok).toBe(true)
      if (!off.ok) return
      expect(off.active).toBe(false)

      const on = await togglePromoCodeActive({ id: 'org-1' }, eventId, 'toggle')
      expect(on.ok && on.active).toBe(true)
    })

    it('supprime un code immédiatement (aucune confirmation nécessaire côté serveur)', async () => {
      const eventId = await seedEvent()
      await createPromoCode({ id: 'org-1' }, eventId, { code: 'GONE', type: 'percent', value: 10 })
      const result = await deletePromoCode({ id: 'org-1' }, eventId, 'gone')
      expect(result.ok).toBe(true)

      const list = await listPromoCodes({ id: 'org-1' }, eventId)
      expect(list.ok && list.promos).toHaveLength(0)
    })

    it("refuse pour quelqu'un d'autre que le propriétaire", async () => {
      const eventId = await seedEvent()
      await createPromoCode({ id: 'org-1' }, eventId, { code: 'SECURE', type: 'percent', value: 10 })
      const result = await togglePromoCodeActive({ id: 'intrus' }, eventId, 'secure')
      expect(result.ok).toBe(false)
    })
  })
})
