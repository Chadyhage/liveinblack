import { auth } from '@/auth'
import { buildMyDataExport } from '@/lib/server/dataExport'

// Art. 15 (droit d'accès) + Art. 20 (droit à la portabilité) RGPD —
// "Télécharger mes données", voir lib/server/dataExport.ts pour la portée
// exacte de l'agrégation et les décisions de scoping (notamment messagerie).
// Réponse en téléchargement de fichier (Content-Disposition: attachment),
// jamais un simple JSON affiché en ligne — cohérent avec l'intention "copie
// exportable" du droit à la portabilité.
export async function GET() {
  const session = await auth()
  if (!session?.user) return Response.json({ error: 'auth_required' }, { status: 401 })

  const data = await buildMyDataExport({ id: session.user.id })
  if (!data) return Response.json({ error: 'user_not_found' }, { status: 404 })

  const body = JSON.stringify(data, null, 2)
  const filename = `liveinblack-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
