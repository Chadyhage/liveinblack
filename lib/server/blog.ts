import { getDb } from '@/lib/db/mongoose'
import BlogPost, { type BlogPostDoc, type BlogCategoryId } from '@/lib/models/BlogPost'

export type PublicBlogPost = BlogPostDoc & { id: string }

export interface ListPublishedPostsParams {
  category?: BlogCategoryId | ''
  page?: number
  pageSize?: number
}

export interface ListPublishedPostsResult {
  posts: PublicBlogPost[]
  page: number
  pageCount: number
  totalCount: number
}

const DEFAULT_PAGE_SIZE = 12

function publishedFilter(now = new Date()) {
  return {
    $or: [
      { publishedAt: { $exists: false } },
      { publishedAt: null },
      { publishedAt: { $lte: now } },
    ],
  }
}

// Liste des articles publiés (triés du plus récent au plus ancien), filtrable
// par catégorie, paginée côté serveur (skip/limit Mongo — contrairement à
// pageSlice côté page utilisé pour les annuaires prestataires/organisateurs
// déjà entièrement chargés en mémoire, le volume d'articles justifie une
// pagination base de données classique).
export async function listPublishedPosts(params: ListPublishedPostsParams = {}): Promise<ListPublishedPostsResult> {
  await getDb()
  const pageSize = Math.max(1, params.pageSize || DEFAULT_PAGE_SIZE)
  const requestedPage = Math.max(1, Math.floor(params.page || 1))

  const filter: Record<string, unknown> = publishedFilter()
  if (params.category) filter.category = params.category

  const totalCount = await BlogPost.countDocuments(filter)
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize))
  const page = Math.min(requestedPage, pageCount)

  const docs = await BlogPost.find(filter)
    .sort({ publishedAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean()

  const posts = docs.map((d) => ({ ...d, id: String(d._id) })) as PublicBlogPost[]

  return { posts, page, pageCount, totalCount }
}

export async function getPostBySlug(slug: string): Promise<PublicBlogPost | null> {
  await getDb()
  const doc = await BlogPost.findOne({ slug, ...publishedFilter() }).lean()
  if (!doc) return null
  return { ...doc, id: String(doc._id) } as PublicBlogPost
}

// Articles liés (même catégorie, exclut l'article courant) — utilisés par la
// page article pour la section "à lire aussi".
export async function listRelatedPosts(post: PublicBlogPost, limit = 3): Promise<PublicBlogPost[]> {
  await getDb()
  const docs = await BlogPost.find({
    category: post.category,
    slug: { $ne: post.slug },
    ...publishedFilter(),
  })
    .sort({ publishedAt: -1 })
    .limit(limit)
    .lean()
  return docs.map((d) => ({ ...d, id: String(d._id) })) as PublicBlogPost[]
}

// Liste complète des articles publiés, non paginée — usage sitemap uniquement
// (voir app/sitemap.ts), pattern identique à listPublicEvents/listPublicOrganizers.
export async function listAllPublishedPostsForSitemap(params: { pageSize?: number } = {}): Promise<PublicBlogPost[]> {
  const requestedPageSize = Math.max(1, Math.floor(Number(params.pageSize) || 0))
  const pageSize = Math.min(500, Math.max(1, requestedPageSize || 12))
  await getDb()
  const docs = await BlogPost.find(publishedFilter())
    .select('slug publishedAt updatedAt')
    .limit(pageSize)
    .sort({ publishedAt: -1 })
    .lean()
  return docs.map((d) => ({ ...d, id: String(d._id) })) as PublicBlogPost[]
}

// --- Gestion agent (comblement de lacune) ---------------------------------
// Le modèle BlogPost n'avait aucune surface de gestion (ni page agent, ni
// route API) : le contenu ne pouvait être créé/modifié que par script/seed
// direct en base, ce qui n'est pas "gérer l'intégralité de la plateforme à
// 100%". Ces fonctions et les routes app/api/agent/blog/* + la page
// app/(app)/agent/blog/ ferment cette lacune, réutilisant le même guard
// requireAgent que tout le reste de l'espace agent.

export interface AdminBlogListParams {
  page?: number
  pageSize?: number
}

export interface AdminBlogListResult {
  posts: PublicBlogPost[]
  page: number
  pageCount: number
  totalCount: number
}

// Liste TOUS les articles (publiés ou programmés dans le futur), pour la vue
// agent — contrairement à listPublishedPosts qui filtre sur publishedAt <= now.
export async function listAllPostsForAgent(params: AdminBlogListParams = {}): Promise<AdminBlogListResult> {
  await getDb()
  const pageSize = Math.max(1, params.pageSize || 20)
  const requestedPage = Math.max(1, Math.floor(params.page || 1))

  const totalCount = await BlogPost.countDocuments({})
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize))
  const page = Math.min(requestedPage, pageCount)

  const docs = await BlogPost.find({})
    .sort({ createdAt: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .lean()

  return { posts: docs.map((d) => ({ ...d, id: String(d._id) })) as PublicBlogPost[], page, pageCount, totalCount }
}

export async function getPostByIdForAgent(id: string): Promise<PublicBlogPost | null> {
  await getDb()
  const doc = await BlogPost.findById(id).lean()
  if (!doc) return null
  return { ...doc, id: String(doc._id) } as PublicBlogPost
}

export interface BlogPostInput {
  slug: string
  title: string
  excerpt: string
  content: string
  coverImageUrl?: string
  category: BlogCategoryId
  tags?: string[]
  publishedAt: Date
  authorName: string
  metaTitle: string
  metaDescription: string
  readingTimeMinutes: number
}

export async function createPostForAgent(input: BlogPostInput): Promise<PublicBlogPost> {
  await getDb()
  const doc = await BlogPost.create(input)
  const lean = doc.toObject()
  return { ...lean, id: String(lean._id) } as PublicBlogPost
}

export async function updatePostForAgent(id: string, input: BlogPostInput): Promise<PublicBlogPost | null> {
  await getDb()
  const doc = await BlogPost.findByIdAndUpdate(id, input, { returnDocument: 'after' }).lean()
  if (!doc) return null
  return { ...doc, id: String(doc._id) } as PublicBlogPost
}

export async function deletePostForAgent(id: string): Promise<boolean> {
  await getDb()
  const res = await BlogPost.findByIdAndDelete(id)
  return !!res
}
