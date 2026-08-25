import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import { getDb } from '@/lib/db/mongoose'
import BlogPost from '@/lib/models/BlogPost'
import { buildBeninCampaign } from '@/scripts/blog-benin-campaign'

export const maxDuration = 300

export async function POST(request: Request) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as { confirm?: boolean }
  const posts = buildBeninCampaign()

  // L'aperçu ne touche jamais la base. Une seconde action volontaire avec
  // confirm=true est requise pour l'import de production.
  if (body.confirm !== true) {
    return NextResponse.json({ ok: true, dryRun: true, count: posts.length, firstSlugs: posts.slice(0, 5).map((post) => post.slug) })
  }

  await getDb()
  const result = await BlogPost.bulkWrite(posts.map((post) => ({
    updateOne: {
      filter: { slug: post.slug },
      update: { $set: post },
      upsert: true,
    },
  })), { ordered: false })

  return NextResponse.json({
    ok: true,
    dryRun: false,
    count: posts.length,
    created: result.upsertedCount,
    updated: result.modifiedCount,
    matched: result.matchedCount,
  })
}
