import { describe, expect, it } from 'vitest'
import {
  checkinErrorMessage,
  findEditableLine,
  groupByCategory,
  isLocked,
  orderErrorMessage,
  resolveScanInput,
  resolveTicketCodeForLookup,
  serviceSessionKey,
  type MenuItemView,
  type OrderItem,
} from '../scannerUtils'

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'item-1',
    menuItemId: 'burger',
    name: 'Burger',
    quantity: 1,
    unitPriceMinor: 5000,
    showOptionId: null,
    showLabel: null,
    showInfo: null,
    ticketId: 'TK001',
    addedBy: 'staff-1',
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

describe('scannerUtils', () => {
  it('détecte les lignes verrouillées', () => {
    expect(isLocked(makeItem())).toBe(false)
    expect(isLocked(makeItem({ servedAt: '2026-08-20T10:00:00.000Z' }))).toBe(true)
    expect(isLocked(makeItem({ paidAt: '2026-08-20T10:00:00.000Z' }))).toBe(true)
    expect(isLocked(makeItem({ status: 'cancelled' }))).toBe(true)
  })

  it('retrouve la première ligne éditable pour un article', () => {
    const locked = makeItem({ id: 'locked', servedAt: '2026-08-20T10:00:00.000Z' })
    const editable = makeItem({ id: 'editable' })
    const included = makeItem({ id: 'included', kind: 'included' })

    expect(findEditableLine([locked, included, editable], 'burger')?.id).toBe('editable')
    expect(findEditableLine([locked, included], 'burger')).toBeUndefined()
  })

  it('résout un scan QR en token et une saisie libre en ticketCode', () => {
    expect(resolveScanInput('https://liveinblack.com/ticket/ABC123.sig')).toEqual({ token: 'ABC123.sig' })
    expect(resolveScanInput(' tk 01 ')).toEqual({ ticketCode: 'TK 01' })
  })

  it('extrait le ticketCode d’un lien billet signé', () => {
    expect(resolveTicketCodeForLookup('https://liveinblack.com/ticket/abc123.signature')).toBe('ABC123')
    expect(resolveTicketCodeForLookup(' tk01 ')).toBe('TK01')
  })

  it('groupe le menu par catégorie avec un fallback', () => {
    const menu: MenuItemView[] = [
      { name: 'Burger', emoji: '🍔', imageUrl: null, price: 12, category: 'Food', description: '' },
      { name: 'Fries', emoji: '🍟', imageUrl: null, price: 5, category: 'Food', description: '' },
      { name: 'Water', emoji: '💧', imageUrl: null, price: 2, category: ' ', description: '' },
    ]

    expect(groupByCategory(menu)).toEqual([
      ['Food', [menu[0], menu[1]]],
      ['Autres', [menu[2]]],
    ])
  })

  it('retourne des messages d’erreur lisibles avec fallback', () => {
    expect(checkinErrorMessage('wrong_event')).toContain('autre événement')
    expect(orderErrorMessage('nothing_to_pay')).toContain('Rien à encaisser')
    expect(checkinErrorMessage(undefined)).toBe('Une erreur est survenue. Réessaie.')
    expect(orderErrorMessage('unknown-code')).toBe('Une erreur est survenue. Réessaie.')
  })

  it('génère une clé de session dédiée à l’événement', () => {
    expect(serviceSessionKey('evt_42')).toBe('liveinblack:scanner:evt_42:ticketCode')
  })
})
