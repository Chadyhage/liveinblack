import { NextResponse } from 'next/server'

const VAPID_PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-]{80,120}$/

// Une clé VAPID publique est, comme son nom l'indique, destinée au
// navigateur. La servir à l'exécution évite de rendre les notifications
// dépendantes d'une seconde variable NEXT_PUBLIC_* injectée au moment du
// build, tout en gardant la clé privée exclusivement côté serveur.
export async function GET() {
  const publicKey = (
    process.env.VAPID_PUBLIC_KEY?.trim() ||
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
    ''
  )

  if (!VAPID_PUBLIC_KEY_PATTERN.test(publicKey)) {
    return NextResponse.json(
      { error: 'push_not_configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  return NextResponse.json(
    { publicKey },
    { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } }
  )
}
