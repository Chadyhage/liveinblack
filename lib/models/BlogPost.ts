import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose'

// Contenu éditorial public (articles de blog) — aligné sur les régions XOF/EUR
// de lib/shared/regions.ts pour la catégorisation géographique, plus deux
// catégories transverses ('guide', 'actualite') non liées à une région.
// `content` est une chaîne HTML-in-string (pas de markdown lib dans ce repo,
// voir package.json) : les articles sont écrits/seedés directement en HTML
// simple (paragraphes, titres), rendu via dangerouslySetInnerHTML côté page
// article — contenu 100% interne (seed/agent), jamais saisi par un visiteur.
export const BLOG_CATEGORY_IDS = ['togo', 'benin', 'cote-ivoire', 'senegal', 'burkina-faso', 'mali', 'niger', 'guinee-bissau', 'france', 'guide', 'actualite'] as const
export type BlogCategoryId = (typeof BLOG_CATEGORY_IDS)[number]

const blogPostSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    excerpt: { type: String, required: true },
    content: { type: String, required: true },
    coverImageUrl: { type: String, default: '' },
    category: { type: String, enum: BLOG_CATEGORY_IDS, default: 'actualite', index: true },
    tags: { type: [String], default: [] },
    publishedAt: { type: Date, required: true, index: true },
    authorName: { type: String, required: true },
    metaTitle: { type: String, required: true },
    metaDescription: { type: String, required: true },
    readingTimeMinutes: { type: Number, required: true },
  },
  { timestamps: true }
)

blogPostSchema.index({ title: 'text', excerpt: 'text', tags: 'text' })

export type BlogPostDoc = InferSchemaType<typeof blogPostSchema>
export type BlogPostModel = Model<BlogPostDoc>

export default (models.BlogPost as BlogPostModel) || model<BlogPostDoc>('BlogPost', blogPostSchema)
