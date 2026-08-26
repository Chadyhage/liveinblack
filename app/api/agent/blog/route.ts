import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { auth } from '@/auth'
import { requireAgent } from '@/lib/server/agent/agentGuard'
import { listAllPostsForAgent, createPostForAgent } from '@/lib/server/blog'
import { BLOG_CATEGORY_IDS } from '@/lib/models/BlogPost'

const bodySchema = z.object({
  slug: z.string().trim().min(1).regex(/^[a-z0-9-]+$/, 'Slug invalide (minuscules, chiffres, tirets)'),
  title: z.string().trim().min(1),
  excerpt: z.string().trim().min(1),
  content: z.string().trim().min(1),
  coverImageUrl: z.string().trim().default(''),
  category: z.enum(BLOG_CATEGORY_IDS),
  tags: z.array(z.string()).default([]),
  publishedAt: z.coerce.date(),
  authorName: z.string().trim().min(1),
  metaTitle: z.string().trim().min(1),
  metaDescription: z.string().trim().min(1),
  readingTimeMinutes: z.coerce.number().int().min(1),
})

export async function GET(req: Request) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const page = Number(searchParams.get('page') || '1')
  const result = await listAllPostsForAgent({ page })
  return NextResponse.json({ ok: true, ...result })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!requireAgent(session?.user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 })

  const post = await createPostForAgent(parsed.data)
  revalidateTag('public-blog', { expire: 0 })
  return NextResponse.json({ ok: true, post })
}
