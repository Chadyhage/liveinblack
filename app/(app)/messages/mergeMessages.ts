// Extrait de MessagesClient.tsx (audit du 12/08/2026 : "aucun test frontend",
// composant de ~3900 lignes) — logique pure, zéro dépendance React,
// donc testable en isolation sans monter le composant. Générique sur `{id:
// string}` plutôt que couplé à `MessageView` : n'importe quel appelant qui a
// juste un id peut l'utiliser sans tirer le type complet du message.
//
// Union par id, triée par id croissant (= ordre chronologique, les ids sont
// des ObjectId Mongo, monotones à la création — voir GetMessagesInput dans
// lib/server/messaging.ts) — `older` peut contenir des messages déjà
// présents dans `existing` en cas de chevauchement de fenêtre (pagination
// d'historique, reconnexion SSE après une coupure), jamais l'inverse ne doit
// produire de doublon visible dans le fil.
export function mergeMessagesById<T extends { id: string }>(older: T[], existing: T[]): T[] {
  const byId = new Map<string, T>()
  for (const m of older) byId.set(m.id, m)
  for (const m of existing) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
