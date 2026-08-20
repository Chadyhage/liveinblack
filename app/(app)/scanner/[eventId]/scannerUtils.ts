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

const CHECKIN_ERROR_MESSAGES: Record<string, string> = {
  auth_required: 'Ta session a expiré — reconnecte-toi pour scanner.',
  invalid_body: 'Requête invalide.',
  invalid_code: 'Code invalide — vérifie la saisie ou réessaie le scan.',
  ticket_not_found: 'Billet introuvable.',
  revoked: 'Ce billet a été révoqué — entrée refusée.',
  event_not_found: "Cet événement n'existe plus.",
  wrong_event: 'Ce billet appartient à un autre événement — vérifie que tu es sur le bon scanner.',
  forbidden: "Tu n'as pas les droits pour scanner ce billet.",
  stale_or_invalid_token: 'QR périmé ou invalide — redemande un billet à jour au titulaire.',
  manual_entry_not_allowed_for_reassigned_seat: "Ce siège a été réattribué — la saisie manuelle n'est pas acceptée ici, scanne le QR à jour.",
  event_ended: 'Cet événement est terminé — entrée refusée.',
  payment_pending: 'Paiement non confirmé — entrée refusée.',
  not_entitled: "Ce billet n'ouvre pas droit à l'entrée.",
  bad_response: 'Réponse du serveur illisible — réessaie.',
}

const ORDER_ERROR_MESSAGES: Record<string, string> = {
  auth_required: 'Ta session a expiré — reconnecte-toi.',
  invalid_body: 'Requête invalide.',
  invalid_input: 'Requête invalide.',
  invalid_quantity: 'Quantité invalide.',
  event_not_found: "Cet événement n'existe plus.",
  unknown_menu_item: "Cet article n'est plus disponible au menu.",
  ticket_not_found: 'Billet introuvable pour cet événement.',
  not_your_ticket: "Ce billet ne t'appartient pas.",
  item_not_found: 'Cette ligne de commande est introuvable — elle a peut-être déjà été retirée.',
  item_cancelled: 'Cette ligne a été annulée — impossible de la servir.',
  serve_staff_only: 'Seul le staff peut marquer un article comme servi.',
  pay_staff_only: 'Seul un serveur, un manager ou le propriétaire peut encaisser.',
  cancel_manager_only: "Seul le manager ou le propriétaire de l'événement peut annuler une ligne.",
  reason_required: 'Un motif est requis pour annuler cette ligne.',
  nothing_to_pay: 'Rien à encaisser sur ce billet — tout est déjà payé ou annulé.',
  staff_only: 'Action réservée au staff.',
  forbidden: 'Action non autorisée.',
  bad_response: 'Réponse du serveur illisible — réessaie.',
}

const TICKET_URL_TOKEN_RE = /\/ticket\/([A-Za-z0-9_.-]+)/

export function checkinErrorMessage(code: string | undefined): string {
  if (!code) return FALLBACK_ERROR_MESSAGE
  return CHECKIN_ERROR_MESSAGES[code] ?? FALLBACK_ERROR_MESSAGE
}

export function orderErrorMessage(code: string | undefined): string {
  if (!code) return FALLBACK_ERROR_MESSAGE
  return ORDER_ERROR_MESSAGES[code] ?? FALLBACK_ERROR_MESSAGE
}

export function isLocked(item: OrderItem): boolean {
  return Boolean(item.servedAt) || Boolean(item.paidAt) || item.status === 'cancelled'
}

export function findEditableLine(items: OrderItem[], menuItemName: string): OrderItem | undefined {
  return items.find((item) => item.menuItemId === menuItemName && item.kind === 'order' && !isLocked(item))
}

export function resolveScanInput(raw: string): { token: string } | { ticketCode: string } {
  const trimmed = raw.trim()
  const match = trimmed.match(TICKET_URL_TOKEN_RE)
  if (match) return { token: match[1] }
  return { ticketCode: trimmed.toUpperCase() }
}

export function resolveTicketCodeForLookup(raw: string): string {
  const trimmed = raw.trim()
  const match = trimmed.match(TICKET_URL_TOKEN_RE)
  const token = match ? match[1] : trimmed
  const dot = token.lastIndexOf('.')
  const code = dot > 0 && dot < token.length - 1 ? token.slice(0, dot) : token
  return code.toUpperCase()
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

export function serviceSessionKey(eventId: string): string {
  return `liveinblack:scanner:${eventId}:ticketCode`
}
