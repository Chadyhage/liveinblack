export type OrderItemStatus = 'sent' | 'served' | 'cancelled'
export type OrderItemKind = 'order' | 'preorder' | 'included'

export interface OrderItem {
  id: string
  menuItemId: string | null
  name: string
  quantity: number
  unitPriceMinor: number
  showOptionId: string | null
  showLabel: string | null
  showInfo: string | null
  ticketId: string
  addedBy: string
  addedByName: string | null
  status: OrderItemStatus
  kind: OrderItemKind
  servedAt: string | null
  servedBy: string | null
  servedByName: string | null
  paidAt: string | null
  paidBy: string | null
  paidByName: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  cancellationReason: string | null
}

export interface MenuItemView {
  name: string
  emoji: string
  imageUrl: string | null
  price: number
  category: string
  description: string
}

const FALLBACK_ERROR_MESSAGE = 'Une erreur est survenue. Réessaie.'

const ERROR_MESSAGES: Record<string, string> = {
  auth_required: 'Ta session a expiré — reconnecte-toi pour commander.',
  not_your_ticket: "Ce billet ne t'appartient pas.",
  not_your_item: "Cette ligne de commande ne t'appartient pas.",
  unknown_menu_item: "Cet article n'est plus disponible au menu.",
  invalid_quantity: 'Quantité invalide.',
  invalid_input: 'Requête invalide.',
  invalid_body: 'Requête invalide.',
  item_not_found: 'Cette ligne de commande est introuvable — elle a peut-être déjà été retirée.',
  ticket_not_found: 'Billet introuvable.',
  forbidden: 'Action non autorisée.',
  locked: 'Cet article a déjà été servi, payé ou annulé — modification impossible.',
  bad_response: 'Réponse du serveur illisible — réessaie.',
}

export function errorMessageFor(code: string | undefined): string {
  if (!code) return FALLBACK_ERROR_MESSAGE
  return ERROR_MESSAGES[code] ?? FALLBACK_ERROR_MESSAGE
}

export function isLocked(item: OrderItem): boolean {
  return Boolean(item.servedAt) || Boolean(item.paidAt) || item.status === 'cancelled'
}

export function findEditableLine(items: OrderItem[], menuItemName: string, currentUserId: string): OrderItem | undefined {
  return items.find((item) => item.menuItemId === menuItemName && item.kind === 'order' && item.addedBy === currentUserId && !isLocked(item))
}

export function findLockedOwnLine(items: OrderItem[], menuItemName: string, currentUserId: string): OrderItem | undefined {
  return items.find((item) => item.menuItemId === menuItemName && item.kind === 'order' && item.addedBy === currentUserId && isLocked(item))
}

export function lockedLineLabel(item: OrderItem): string {
  if (item.paidAt) return 'Déjà payé — non modifiable'
  if (item.servedAt) return 'Déjà servi — non modifiable'
  return 'Annulé — non modifiable'
}

export function groupByCategory(menu: MenuItemView[]): Array<[string, MenuItemView[]]> {
  const map = new Map<string, MenuItemView[]>()
  for (const item of menu) {
    const category = item.category?.trim() || 'Autres'
    const bucket = map.get(category)
    if (bucket) bucket.push(item)
    else map.set(category, [item])
  }
  return Array.from(map.entries())
}
