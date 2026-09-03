import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Remplace le duo vulnérable `bookings/{bookingId}` (Firestore, mutable côté
// client) + billets `client-postpay` adoptés par le webhook (audit C05).
// Un Order est créé UNE FOIS, côté serveur, avant tout paiement — il fige la
// quantité, le prix, la devise, les préco résolues serveur, et c'est la SEULE
// source de vérité que le webhook consulte pour savoir combien de billets
// émettre. Aucune route ne permet au client de modifier un Order après
// création (pas de PATCH exposé) — seul le webhook (paid/settled) et le
// mécanisme d'expiration (status) le font évoluer.
const preorderRequestSchema = new Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true }, // résolu depuis event.menu au moment de la commande
    qty: { type: Number, required: true },
    showOptionId: { type: String, default: null },
    showLabel: { type: String, default: null },
    showInfo: { type: String, default: null },
  },
  { _id: false }
)

const ticketPreorderSchema = new Schema(
  {
    ticketIndex: { type: Number, required: true },
    items: { type: [preorderRequestSchema], default: [] },
  },
  { _id: false }
)

const orderSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    eventId: { type: String, required: true, index: true },
    placeId: { type: String, required: true },
    placeType: { type: String, required: true }, // libellé (event.places[].type), pour affichage/reçu
    qty: { type: Number, required: true }, // nombre de billets (1 pour une table = 1 unité payée)
    isTable: { type: Boolean, default: false },
    tableSeats: { type: Number, default: 0 },

    unitPriceMinor: { type: Number, required: true }, // prix unitaire figé serveur (cents EUR ou unités XOF)
    currency: { type: String, enum: ['EUR', 'XOF'], required: true },
    feeMinor: { type: Number, default: 0 },

    // Option d'annulation volontaire, choisie par l'acheteur au checkout
    // uniquement si l'organisateur l'a activée sur la catégorie de billet et
    // si la fermeture billetterie - 48h n'est pas atteinte. Elle rembourse le
    // prix facial uniquement et reste figée à l'achat.
    cancellationProtectionPurchased: { type: Boolean, default: false },
    cancellationProtectionFeeMinor: { type: Number, default: 0 },

    promoCode: { type: String, default: null },
    promoUses: { type: Number, default: 0 },
    promoUnitDiscountMinor: { type: Number, default: 0 },

    preorders: { type: [preorderRequestSchema], default: [] },
    ticketPreorders: { type: [ticketPreorderSchema], default: [] },

    sellerUid: { type: String, default: null },
    connectMode: { type: String, enum: ['auto', 'ledger', 'none'], default: 'none' },
    fedapaySubAccountReference: { type: String, default: null },

    // 'cash' (#C) : vente espèces par un agent — jamais de session Stripe/
    // FedaPay, statut posé directement à 'paid' de façon synchrone (voir
    // lib/server/agentSales.ts), aucune attente de webhook.
    rail: { type: String, enum: ['stripe', 'fedapay', 'free', 'cash'], required: true },
    stripeSessionId: { type: String, default: null, index: true },
    fedapayTxnId: { type: String, default: null, index: true },

    // 'superseded' : commande d'origine d'un billet depuis revendu — exclue
    // volontairement de la boucle de remboursement d'annulation
    // (organizerEventLifecycle.ts ne filtre que status:'paid') pour qu'une
    // seule commande par admission soit jamais remboursée (celle du DERNIER
    // payeur réel, cf. lib/server/resale.ts::fulfillResaleOrder).
    status: { type: String, enum: ['pending', 'paid', 'expired', 'cancelled', 'superseded'], default: 'pending', index: true },
    // 'ticket' = achat normal (stock décrémenté, billets mintés par
    // fulfillOrder). 'resale' = achat d'un billet REVENDU (aucun stock
    // touché, mute un Ticket existant — voir lib/server/resale.ts).
    // 'agent_sale' = vente sur place par un agent désigné (#C,
    // lib/server/agentSales.ts) — décrémente le stock comme un achat normal,
    // mais le titulaire du billet n'est pas forcément le payeur (userId reste
    // requis par le schéma Ticket mais ne représente qu'un rattachement
    // technique ; le vrai destinataire est `guestName`/`contactEmail`/
    // `contactPhone` ci-dessous, même convention que lib/server/guestlist.ts).
    // 'seat_hold_deposit' : acompte de blocage de place (#B extension,
    // lib/server/seatHolds.ts) — ne décrémente PAS le stock lui-même à la
    // création (le hold l'a déjà fait) ; sa réussite ACTIVE le SeatHold
    // référencé par `seatHoldId`, jamais de billet miné directement.
    // 'seat_hold_completion' : paiement du SOLDE d'un hold actif, passe par
    // le tunnel de checkout normal (createOrder) mais SANS redécrémenter le
    // stock (déjà réservé par le hold) et à un prix = prix figé - acompte
    // déjà payé — voir `completesSeatHoldId`.
    kind: { type: String, enum: ['ticket', 'resale', 'agent_sale', 'seat_hold_deposit', 'seat_hold_completion'], default: 'ticket' },
    resaleListingId: { type: String, default: null },
    seatHoldId: { type: String, default: null },
    completesSeatHoldId: { type: String, default: null },
    agentUid: { type: String, default: null },
    guestName: { type: String, default: null },
    contactEmail: { type: String, default: null },
    contactPhone: { type: String, default: null },
    stockDecremented: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },

    // Anti double-traitement du webhook (verrou 90s) + drapeaux finaux, même
    // pattern que le legacy bookings/{id}.fulfillStartedAt / paid / settled.
    fulfillStartedAt: { type: Date, default: null },
    paid: { type: Boolean, default: false },
    settled: { type: Boolean, default: false },

    // Traçabilité d'une demande de remboursement déclenchée par le CLIENT
    // (lib/server/clientRefunds.ts) — distincte du remboursement de masse
    // déclenché par l'organisateur via cancelOrganizerEvent (celui-ci ne
    // renseigne jamais ces deux champs). 'postponed_declined' = le client a
    // refusé la nouvelle date proposée après un report.
    clientRefundRequestedAt: { type: Date, default: null },
    // 'cancellation_option' = option d'annulation volontaire achetée au
    // checkout, utilisable strictement avant fermeture billetterie - 48h.
    clientRefundReason: { type: String, enum: ['postponed_declined', 'cancellation_option', null], default: null },
  },
  { timestamps: true }
)

// Purge automatique (RGPD — minimisation des données) des holds de checkout
// EXPIRÉS ET JAMAIS PAYÉS uniquement : index TTL PARTIEL sur `expiresAt`,
// filtré à `status: 'expired'`. Le filtre partiel est réévalué par le
// moniteur TTL de Mongo à CHAQUE passage contre l'état ACTUEL du document
// (pas figé à l'insertion) — un Order qui passe en 'paid' avant que le
// TTL ne s'exécute sort donc automatiquement du champ du filtre, aucun
// risque de supprimer une commande payée quelle que soit sa valeur
// `expiresAt` d'origine (celle-ci ne compte que pré-paiement, cf.
// lib/server/orders.ts). Ne cible QUE 'expired' — jamais 'pending'
// (peut encore aboutir), 'paid' ou 'cancelled' (statut légitime distinct).
// Délai de grâce : 30 jours après expiresAt (qui est déjà +30min après
// création, cf. ORDER_TTL_MS) — largement suffisant pour toute
// investigation/litige sur un hold jamais payé, sans accumulation
// indéfinie de données sensibles (stripeSessionId, fedapayTxnId,
// montants, codes promo).
orderSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30, partialFilterExpression: { status: 'expired' } }
)

export type OrderDoc = InferSchemaType<typeof orderSchema>
export type OrderModel = Model<OrderDoc>

export default (models.Order as OrderModel) || model<OrderDoc>('Order', orderSchema)
