// Fallback requis pour le slot parallèle @modal quand aucune route
// interceptée n'est active (navigation directe, refresh) — voir
// node_modules/next/dist/docs/.../parallel-routes.md#defaultjs.
export default function Default() {
  return null
}
