import fs from 'node:fs'
import path from 'node:path'

const webRoot = process.cwd()
const mobileRoot = path.resolve(webRoot, '../LIB_Mobile')
const failures = []

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8')
}

function exists(root, relative) {
  return fs.existsSync(path.join(root, relative))
}

function requireFile(root, relative, label = relative) {
  if (!exists(root, relative)) failures.push(`Fichier requis manquant : ${label}`)
}

function forbidFile(root, relative, label = relative) {
  if (exists(root, relative)) failures.push(`Ancien fichier interdit encore présent : ${label}`)
}

function requireIncludes(root, relative, needle, message) {
  const text = read(root, relative)
  if (!text.includes(needle)) failures.push(message)
}

function walk(root, directory) {
  const absolute = path.join(root, directory)
  if (!fs.existsSync(absolute)) return []
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'old') return []
      return walk(root, relative)
    }
    return /\.(ts|tsx|json|md)$/.test(entry.name) ? [relative] : []
  })
}

for (const file of [
  'lib/models/RefundCase.ts',
  'lib/models/RefundPoint.ts',
  'lib/shared/refundPolicy.ts',
  'lib/server/refunds/refundCases.ts',
  'lib/server/payments/fedapayMarketplace.ts',
  'app/api/cron/refund-cases/route.ts',
]) {
  requireFile(webRoot, file)
}

for (const file of [
  'lib/models/EventRefund.ts',
  'lib/server/events/eventRefunds.ts',
  'lib/server/payments/fedapayRefunds.ts',
]) {
  forbidFile(webRoot, file)
}

requireIncludes(webRoot, 'vercel.json', '"/api/cron/refund-cases"', 'Le cron de reprise des dossiers de remboursement doit être planifié.')
requireIncludes(webRoot, 'lib/server/payments/fedapayClient.ts', 'sub_accounts_commisssions', 'Les transactions FedaPay doivent porter le split Marketplace.')
requireIncludes(webRoot, 'lib/server/payments/sellerSettlementMode.ts', 'fedapaySubAccountReference ? \'auto\' : \'ledger\'', 'FedaPay doit passer en mode auto quand le sous-compte vendeur existe.')
requireIncludes(webRoot, 'app/api/organizer-events/route.ts', 'fedapay_marketplace_account_required', 'La publication Bénin doit exiger le compte FedaPay Marketplace.')
requireIncludes(webRoot, 'lib/shared/refundPolicy.ts', 'CANCELLATION_OPTION_MIN_FACE_VALUE_XOF = 5_000', 'L’option doit être réservée aux billets de 5 000 FCFA et plus.')
requireIncludes(webRoot, 'lib/shared/refundPolicy.ts', 'CANCELLATION_OPTION_DEADLINE_MS = 48 * 60 * 60 * 1000', 'La limite option doit être fermeture billetterie - 48h.')
requireIncludes(webRoot, 'lib/shared/refundPolicy.ts', 'POSTPONEMENT_REFUND_WINDOW_MS = 24 * 60 * 60 * 1000', 'Le report doit ouvrir une fenêtre exacte de 24h.')
requireIncludes(webRoot, 'lib/server/refunds/refundCases.ts', 'auditContextFromRequest', 'Les actions remboursement doivent auditer le contexte technique HTTP.')
requireIncludes(webRoot, 'app/api/agent/payments/refunds/[id]/complete/route.ts', 'signatureUpload', 'La validation agent doit accepter une signature téléversée et vérifiée.')
requireIncludes(webRoot, 'app/api/organizer-refunds/[refundCaseId]/declare/route.ts', 'proofUpload', 'La déclaration organisateur doit accepter une preuve téléversée et vérifiée.')

for (const file of ['app', 'lib'].flatMap((dir) => walk(webRoot, dir))) {
  const text = read(webRoot, file)
  if (text.includes('refunds.create') && !file.toLowerCase().includes('boost')) {
    failures.push(`Remboursement prestataire détecté hors boost : ${file}`)
  }
  if (text.includes('fedapayRefunds') || text.includes('EventRefund')) {
    failures.push(`Référence à l’ancien modèle de remboursement détectée : ${file}`)
  }
  if (text.includes('Les billets déjà payés seront automatiquement remboursés')) {
    failures.push(`Promesse publique/active de remboursement automatique détectée : ${file}`)
  }
}

if (exists(mobileRoot, 'package.json')) {
  requireFile(mobileRoot, 'lib/refundCases.ts', 'LIB_Mobile/lib/refundCases.ts')
  requireIncludes(mobileRoot, 'app/(tabs)/tickets.tsx', 'fetchMyRefundCases', 'Le wallet mobile doit afficher les dossiers de remboursement.')
  requireIncludes(mobileRoot, 'app/(tabs)/tickets.tsx', 'switchRefundToIndividual', 'Le mobile doit permettre la bascule irréversible vers remboursement individuel.')
  requireIncludes(mobileRoot, 'app/spaces/agent/payments.tsx', 'code unique', 'Le module agent mobile doit demander le code unique.')
  requireIncludes(mobileRoot, 'app/spaces/agent/payments.tsx', 'uploadPublicImage', 'Le module agent mobile doit joindre une signature/preuve.')
  requireIncludes(mobileRoot, 'lib/clientRefunds.ts', "aucun\n// remboursement automatique Stripe/FedaPay", 'Le commentaire mobile doit exclure le remboursement automatique Stripe/FedaPay.')
  for (const file of ['app', 'lib'].flatMap((dir) => walk(mobileRoot, dir))) {
    const text = read(mobileRoot, file)
    if (text.includes('Les billets déjà payés seront automatiquement remboursés')) {
      failures.push(`Promesse mobile de remboursement automatique détectée : LIB_Mobile/${file}`)
    }
  }
}

if (failures.length) {
  console.error(`Audit remboursement Bénin/FedaPay : ÉCHEC (${failures.length})`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Audit remboursement Bénin/FedaPay : OK')
