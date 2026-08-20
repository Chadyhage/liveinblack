import { describe, expect, it } from 'vitest'
import {
  errorMessageFor,
  findEditableLine,
  findLockedOwnLine,
  groupByCategory,
  isLocked,
  lockedLineLabel,
  type MenuItemView,
  type OrderItem,
} from '../commanderUtils'

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'item-1',
    menuItemId: 'burger',
    name: 'Burger',
    quantity: 1,
    unitPriceMinor: 1200,
    showOptionId: null,
    showLabel: null,
    showInfo: null,
    ticketId: 'T001',
    addedBy: 'user-1',
    addedByName: 'Alice',
    status: 'sent',
    kind: 'order',
    servedAt: null,
    servedBy: null,
    servedByName: null,
    paidAt: null,
    paidBy: null,
    paidByName: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    ...overrides,
  }
}

describe('commanderUtils', () => {
  it('retourne un message lisible avec fallback', () => {
    expect(errorMessageFor('not_your_item')).toContain("ne t'appartient pas")
    expect(errorMessageFor(undefined)).toBe('Une erreur est survenue. Réessaie.')
    expect(errorMessageFor('unknown')).toBe('Une erreur est survenue. Réessaie.')
  })

  it('détecte correctement les lignes verrouillées', () => {
    expect(isLocked(makeItem())).toBe(false)
    expect(isLocked(makeItem({ paidAt: '2026-08-20T12:00:00.000Z' }))).toBe(true)
    expect(isLocked(makeItem({ servedAt: '2026-08-20T12:00:00.000Z' }))).toBe(true)
    expect(isLocked(makeItem({ status: 'cancelled' }))).toBe(true)
  })

  it('trouve une ligne éditable appartenant au bon utilisateur', () => {
    const otherUser = makeItem({ id: 'other', addedBy: 'user-2' })
    const ownLocked = makeItem({ id: 'locked', paidAt: '2026-08-20T12:00:00.000Z' })
    const ownEditable = makeItem({ id: 'editable' })

    expect(findEditableLine([otherUser, ownLocked, ownEditable], 'burger', 'user-1')?.id).toBe('editable')
    expect(findEditableLine([otherUser], 'burger', 'user-1')).toBeUndefined()
  })

  it('trouve une ligne verrouillée appartenant au bon utilisateur', () => {
    const ownLocked = makeItem({ id: 'locked', servedAt: '2026-08-20T12:00:00.000Z' })
    const otherLocked = makeItem({ id: 'other', addedBy: 'user-2', servedAt: '2026-08-20T12:00:00.000Z' })

    expect(findLockedOwnLine([otherLocked, ownLocked], 'burger', 'user-1')?.id).toBe('locked')
  })

  it('libelle correctement l’état verrouillé', () => {
    expect(lockedLineLabel(makeItem({ paidAt: '2026-08-20T12:00:00.000Z' }))).toBe('Déjà payé — non modifiable')
    expect(lockedLineLabel(makeItem({ servedAt: '2026-08-20T12:00:00.000Z' }))).toBe('Déjà servi — non modifiable')
    expect(lockedLineLabel(makeItem({ status: 'cancelled' }))).toBe('Annulé — non modifiable')
  })

  it('groupe le menu par catégorie avec fallback', () => {
    const menu: MenuItemView[] = [
      { name: 'Burger', emoji: '🍔', imageUrl: null, price: 12, category: 'Food', description: '' },
      { name: 'Soda', emoji: '🥤', imageUrl: null, price: 4, category: 'Food', description: '' },
      { name: 'Water', emoji: '💧', imageUrl: null, price: 2, category: '', description: '' },
    ]

    expect(groupByCategory(menu)).toEqual([
      ['Food', [menu[0], menu[1]]],
      ['Autres', [menu[2]]],
    ])
  })
})
