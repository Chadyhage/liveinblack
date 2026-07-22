import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agentGuard'
import { getApplicationDocumentForAccess } from '@/lib/server/applications'
import { createApplicationDocumentDownloadUrl } from '@/lib/server/applicationUpload'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; documentKey: string; index: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const { id, documentKey, index } = await params
  const result = await getApplicationDocumentForAccess(id, documentKey, Number(index))
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  if (result.document.userId !== session.user.id && !requireAgent(session.user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const protectedUrl = result.document.publicId && result.document.format
    ? createApplicationDocumentDownloadUrl({
        publicId: result.document.publicId,
        format: result.document.format,
        resourceType: result.document.resourceType,
        deliveryType: result.document.deliveryType,
      })
    : null

  if (protectedUrl) {
    const response = NextResponse.redirect(protectedUrl, 302)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }

  // Compatibilité transitoire avec les justificatifs téléversés avant le
  // stockage authentifié. On ne redirige que vers le domaine Cloudinary.
  try {
    const legacyUrl = new URL(result.document.legacyUrl)
    if (legacyUrl.protocol !== 'https:' || legacyUrl.hostname !== 'res.cloudinary.com') throw new Error('invalid_host')
    const response = NextResponse.redirect(legacyUrl, 302)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch {
    return NextResponse.json({ error: 'document_unavailable' }, { status: 404 })
  }
}
