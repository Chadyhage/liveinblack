import crypto from 'node:crypto'

// Jeton QR de billet — remplace src/utils/ticket.js (generateTicketToken /
// verifyTicketToken), qui signait avec une clé EN DUR expédiée dans le bundle
// JS public (audit H19 : "la signature QR est publique et non
// cryptographique... le préfiltre n'apporte pas de garantie d'authenticité").
//
// Ici la signature est calculée UNIQUEMENT côté serveur (AUTH_SECRET n'existe
// jamais dans un bundle client) et porte sur l'état COURANT du billet en base
// (seatVersion, entryNonce) plutôt que sur des données figées au moment de la
// génération. Conséquence : un jeton émis avant une réattribution de siège
// (#79) ou une révocation devient AUTOMATIQUEMENT invalide dès que
// seatVersion/entryNonce changent en base — pas besoin d'une comparaison de
// fraîcheur séparée, la vérification de signature EST la vérification de
// fraîcheur. La donnée d'affichage du billet (nom événement, prix, etc.)
// n'est plus embarquée dans le jeton : elle est chargée depuis Mongo par
// /ticket/[token] (le legacy l'embarquait pour fonctionner hors-ligne avec
// Firestore ; on a désormais une base interrogeable à chaque affichage).
function secret(): string {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET manquant — requis pour signer les jetons de billet')
  return s
}

export interface TicketTokenState {
  ticketCode: string
  seatVersion: number
  entryNonce: string | null
}

function computeSig(state: TicketTokenState): string {
  const payload = `${state.ticketCode}:${state.seatVersion}:${state.entryNonce ?? ''}`
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url')
}

// Le ticketCode (alphabet ALPHABET de ticketCode.ts, jamais de '.') sert de
// séparateur sûr — pas besoin d'un encodage plus complexe.
export function signTicketToken(state: TicketTokenState): string {
  return `${state.ticketCode}.${computeSig(state)}`
}

// Extrait le ticketCode d'un jeton SANS le valider — sert uniquement à savoir
// quel billet charger en base avant de pouvoir vérifier la signature (qui a
// besoin de l'état courant seatVersion/entryNonce). Ne JAMAIS faire confiance
// à ce retour sans appeler verifyTicketToken ensuite avec l'état chargé.
export function extractTicketCode(token: string): string | null {
  const i = token.lastIndexOf('.')
  if (i <= 0 || i === token.length - 1) return null
  return token.slice(0, i)
}

export function verifyTicketToken(token: string, current: TicketTokenState): boolean {
  const i = token.lastIndexOf('.')
  if (i <= 0 || i === token.length - 1) return false
  const ticketCode = token.slice(0, i)
  const presentedSig = token.slice(i + 1)
  if (ticketCode !== current.ticketCode) return false

  const expectedSig = computeSig(current)
  const a = Buffer.from(expectedSig)
  const b = Buffer.from(presentedSig)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
