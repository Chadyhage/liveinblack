'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Search,
  BookOpen,
  Calendar,
  Clock,
  User,
  Sparkles,
  Layers,
  HelpCircle,
  Eye,
  FileText
} from 'lucide-react'
import {
  Button,
  Card,
  Input,
  Textarea,
  Select,
  Modal,
  SlideOverModal,
  Skeleton,
  EmptyState,
  Badge,
  DashboardPageHeader
} from '@/app/components/ui'

const BLOG_CATEGORY_IDS = [
  'actualite',
  'guide',
  'togo',
  'benin',
  'cote-ivoire',
  'senegal',
  'burkina-faso',
  'mali',
  'niger',
  'guinee-bissau',
  'france',
] as const
type BlogCategoryId = (typeof BLOG_CATEGORY_IDS)[number]

const CATEGORY_LABELS: Record<BlogCategoryId, string> = {
  actualite: 'Actualité',
  guide: 'Guide',
  togo: 'Togo',
  benin: 'Bénin',
  'cote-ivoire': "Côte d'Ivoire",
  senegal: 'Sénégal',
  'burkina-faso': 'Burkina Faso',
  mali: 'Mali',
  niger: 'Niger',
  'guinee-bissau': 'Guinée-Bissau',
  france: 'France',
}

interface Post {
  id: string
  slug: string
  title: string
  excerpt: string
  content: string
  coverImageUrl: string
  category: BlogCategoryId
  tags: string[]
  publishedAt: string
  authorName: string
  metaTitle: string
  metaDescription: string
  readingTimeMinutes: number
}

interface Draft {
  slug: string
  title: string
  excerpt: string
  content: string
  coverImageUrl: string
  category: BlogCategoryId
  tags: string
  publishedAt: string
  authorName: string
  metaTitle: string
  metaDescription: string
  readingTimeMinutes: string
}

function emptyDraft(): Draft {
  return {
    slug: '',
    title: '',
    excerpt: '',
    content: '',
    coverImageUrl: '',
    category: 'actualite',
    tags: '',
    publishedAt: new Date().toISOString().slice(0, 10),
    authorName: 'Équipe LIVEINBLACK',
    metaTitle: '',
    metaDescription: '',
    readingTimeMinutes: '4',
  }
}

function toDraft(p: Post): Draft {
  return {
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    content: p.content,
    coverImageUrl: p.coverImageUrl || '',
    category: p.category,
    tags: (p.tags || []).join(', '),
    publishedAt: p.publishedAt ? p.publishedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    authorName: p.authorName,
    metaTitle: p.metaTitle,
    metaDescription: p.metaDescription,
    readingTimeMinutes: String(p.readingTimeMinutes || 4),
  }
}

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
}

export default function AgentBlogClient() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [activeFormTab, setActiveFormTab] = useState<'content' | 'seo' | 'media'>('content')

  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const [nowTimestamp] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoaded(false)
      setLoadError(false)
      try {
        const res = await fetch('/api/agent/blog')
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error('load_failed')
        if (!cancelled) setPosts(data.posts ?? [])
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredPosts = useMemo(() => {
    return posts
      .filter((p) => {
        const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter
        const q = searchQuery.trim().toLowerCase()
        const matchesQuery =
          !q ||
          p.title.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          (p.authorName && p.authorName.toLowerCase().includes(q))
        return matchesCategory && matchesQuery
      })
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
  }, [posts, categoryFilter, searchQuery])

  const stats = useMemo(() => {
    const published = posts.filter((p) => new Date(p.publishedAt).getTime() <= nowTimestamp).length
    const scheduled = posts.filter((p) => new Date(p.publishedAt).getTime() > nowTimestamp).length
    return { total: posts.length, published, scheduled }
  }, [posts, nowTimestamp])

  function openCreate() {
    setEditingId(null)
    setDraft(emptyDraft())
    setFormError(null)
    setActiveFormTab('content')
    setModalOpen(true)
  }

  function openEdit(p: Post) {
    setEditingId(p.id)
    setDraft(toDraft(p))
    setFormError(null)
    setActiveFormTab('content')
    setModalOpen(true)
  }

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  function handleTitleChange(newTitle: string) {
    patch({
      title: newTitle,
      // Met à jour le slug et metaTitle automatiquement si c'est une création
      ...(editingId ? {} : {
        slug: draft.slug ? draft.slug : generateSlug(newTitle),
        metaTitle: draft.metaTitle ? draft.metaTitle : newTitle,
      }),
    })
  }

  async function onSave() {
    setFormError(null)
    const readingTimeMinutes = Number(draft.readingTimeMinutes)
    if (
      !draft.slug.trim() ||
      !draft.title.trim() ||
      !draft.excerpt.trim() ||
      !draft.content.trim() ||
      !draft.authorName.trim()
    ) {
      setFormError('Le titre, le slug, l’extrait, le contenu et l’auteur sont indispensables.')
      return
    }
    if (!Number.isFinite(readingTimeMinutes) || readingTimeMinutes < 1) {
      setFormError('Veuillez indiquer un temps de lecture valide (ex: 4).')
      return
    }

    setSaving(true)
    try {
      const body = {
        slug: draft.slug.trim(),
        title: draft.title.trim(),
        excerpt: draft.excerpt.trim(),
        content: draft.content,
        coverImageUrl: draft.coverImageUrl.trim(),
        category: draft.category,
        tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean),
        publishedAt: draft.publishedAt,
        authorName: draft.authorName.trim(),
        metaTitle: draft.metaTitle.trim() || draft.title.trim(),
        metaDescription: draft.metaDescription.trim() || draft.excerpt.trim(),
        readingTimeMinutes,
      }
      const res = await fetch(editingId ? `/api/agent/blog/${editingId}` : '/api/agent/blog', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setFormError(
          data.error === 'invalid_body'
            ? 'Format invalide — vérifiez que le slug est uniquement composé de lettres minuscules, chiffres et tirets.'
            : "Échec de l'enregistrement."
        )
        return
      }
      setPosts((cur) => {
        if (editingId) return cur.map((p) => (p.id === editingId ? data.post : p))
        return [data.post, ...cur]
      })
      setModalOpen(false)
    } catch {
      setFormError("Une erreur est survenue lors de l'enregistrement.")
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/agent/blog/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.ok) setPosts((cur) => cur.filter((p) => p.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  if (!loaded) {
    return (
      <main className="lb-dashboard-page">
        <DashboardPageHeader
          eyebrow="Gestion éditoriale"
          title="Articles de Blog"
          description="Chargement des articles..."
        />
        <div style={{ display: 'grid', gap: 12 }}>
          <Skeleton width="100%" height={80} radius={16} />
          <Skeleton width="100%" height={80} radius={16} />
          <Skeleton width="100%" height={80} radius={16} />
        </div>
      </main>
    )
  }

  return (
    <main className="lb-dashboard-page">
      <DashboardPageHeader
        eyebrow="Gestion éditoriale"
        title="Articles de Blog"
        description="Créez, rédigez et planifiez facilement les articles, guides et actualités visibles sur le site public."
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Link href="/blog" target="_blank" style={{ textDecoration: 'none' }}>
              <Button variant="secondary" icon={<Eye size={16} aria-hidden="true" />}>
                Voir le blog en direct
              </Button>
            </Link>
            <Button variant="primary" onClick={openCreate} icon={<Plus size={16} aria-hidden="true" />}>
              Nouvel article
            </Button>
          </div>
        }
      />

      {/* Cartes métriques simples */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <Card accent="var(--primary-a35)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: 'var(--radius-pill)', display: 'grid', placeItems: 'center', background: 'var(--primary-a14)', color: 'var(--primary)' }}>
              <BookOpen size={18} />
            </span>
            <div>
              <strong style={{ display: 'block', fontSize: 'var(--font-size-title-3)', lineHeight: 1 }}>{stats.total}</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>Articles au total</span>
            </div>
          </div>
        </Card>

        <Card accent="var(--primary-a35)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: 'var(--radius-pill)', display: 'grid', placeItems: 'center', background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>
              <FileText size={18} />
            </span>
            <div>
              <strong style={{ display: 'block', fontSize: 'var(--font-size-title-3)', lineHeight: 1 }}>{stats.published}</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>En ligne</span>
            </div>
          </div>
        </Card>

        <Card accent="var(--primary-a35)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: 'var(--radius-pill)', display: 'grid', placeItems: 'center', background: 'rgba(234, 179, 8, 0.15)', color: 'var(--warning)' }}>
              <Calendar size={18} />
            </span>
            <div>
              <strong style={{ display: 'block', fontSize: 'var(--font-size-title-3)', lineHeight: 1 }}>{stats.scheduled}</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-footnote-lg)' }}>Programmés</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Barre de recherche et filtres */}
      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px' }}>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par titre, slug ou auteur..."
              leftIcon={<Search size={16} />}
            />
          </div>
          <div style={{ width: 220 }}>
            <Select
              value={categoryFilter}
              onChange={(val) => setCategoryFilter(val)}
              options={[
                { value: 'all', label: 'Toutes les catégories' },
                ...BLOG_CATEGORY_IDS.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
              ]}
              aria-label="Filtrer par catégorie"
            />
          </div>
        </div>
      </Card>

      {/* Affichage des erreurs si besoin */}
      {loadError && (
        <Card accent="var(--danger)" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, color: 'var(--text)' }}>
            Impossible de charger les articles. Veuillez rafraîchir la page.
          </p>
        </Card>
      )}

      {/* Liste des articles */}
      {filteredPosts.length === 0 ? (
        <Card>
          <EmptyState
            title={searchQuery || categoryFilter !== 'all' ? 'Aucun article trouvé' : 'Aucun article pour le moment'}
            description={
              searchQuery || categoryFilter !== 'all'
                ? 'Essayez de modifier votre recherche ou votre filtre.'
                : 'Créez votre tout premier article pour alimenter le blog public.'
            }
          />
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filteredPosts.map((p) => {
            const isScheduled = new Date(p.publishedAt).getTime() > nowTimestamp
            return (
              <Card key={p.id} style={{ padding: '16px 20px', transition: 'border-color .15s ease' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  {/* Vignette couverture si dispo */}
                  {p.coverImageUrl ? (
                    <div
                      style={{
                        width: 80,
                        height: 60,
                        borderRadius: 8,
                        background: `url(${p.coverImageUrl}) center/cover no-repeat`,
                        flexShrink: 0,
                        border: '1px solid var(--border)',
                      }}
                    />
                  ) : null}

                  {/* Infos article */}
                  <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 'var(--font-size-subhead)', fontWeight: 700, color: 'var(--text)' }}>
                        {p.title}
                      </span>
                      <Badge tone={isScheduled ? 'gold' : 'teal'}>
                        {isScheduled ? 'Programmé' : 'Publié'}
                      </Badge>
                      <Badge tone="neutral">
                        {CATEGORY_LABELS[p.category] || p.category}
                      </Badge>
                    </div>

                    <p style={{ margin: '0 0 6px', color: 'var(--text-muted)', fontSize: 'var(--font-size-caption)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.excerpt || 'Aucun extrait'}
                    </p>

                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', color: 'var(--text-faint)', fontSize: 'var(--font-size-caption)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={13} /> {new Date(p.publishedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={13} /> ~{p.readingTimeMinutes || 4} min
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <User size={13} /> {p.authorName}
                      </span>
                      <span style={{ color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>
                        /blog/{p.slug}
                      </span>
                    </div>
                  </div>

                  {/* Boutons d'actions */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                    <Link href={`/blog/${p.slug}`} target="_blank" style={{ textDecoration: 'none' }}>
                      <Button variant="ghost" size="sm" icon={<ExternalLink size={15} />}>
                        Aperçu
                      </Button>
                    </Link>
                    <Button variant="secondary" size="sm" onClick={() => openEdit(p)} icon={<Pencil size={15} />}>
                      Modifier
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDeleteId(p.id)}
                      disabled={deletingId === p.id}
                      icon={<Trash2 size={15} color="var(--danger)" />}
                    />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Tiroir d'édition / création ergonomique */}
      {modalOpen && (
        <SlideOverModal
          onClose={() => setModalOpen(false)}
          ariaLabel={editingId ? 'Modifier l’article' : 'Créer un article'}
          title={editingId ? 'Modifier l’article' : 'Créer un article'}
          subtitle="Renseignez le contenu, la catégorie et les paramètres de référencement."
          padded
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Onglets dans le tiroir pour ne pas surcharger */}
            <div style={{ display: 'flex', gap: 6, background: 'var(--surface-2)', padding: 4, borderRadius: 10, border: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => setActiveFormTab('content')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 7,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 'var(--font-size-caption)',
                  background: activeFormTab === 'content' ? 'var(--primary)' : 'transparent',
                  color: activeFormTab === 'content' ? '#fff' : 'var(--text-muted)',
                  transition: 'all .15s ease',
                }}
              >
                1. Contenu principal
              </button>
              <button
                type="button"
                onClick={() => setActiveFormTab('media')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 7,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 'var(--font-size-caption)',
                  background: activeFormTab === 'media' ? 'var(--primary)' : 'transparent',
                  color: activeFormTab === 'media' ? '#fff' : 'var(--text-muted)',
                  transition: 'all .15s ease',
                }}
              >
                2. Médias & Publication
              </button>
              <button
                type="button"
                onClick={() => setActiveFormTab('seo')}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 7,
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 'var(--font-size-caption)',
                  background: activeFormTab === 'seo' ? 'var(--primary)' : 'transparent',
                  color: activeFormTab === 'seo' ? '#fff' : 'var(--text-muted)',
                  transition: 'all .15s ease',
                }}
              >
                3. SEO & Référencement
              </button>
            </div>

            {/* TAB 1: CONTENU */}
            {activeFormTab === 'content' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 'var(--font-size-body-sm)' }}>
                    Titre de l'article <span style={{ color: 'var(--primary)' }}>*</span>
                  </label>
                  <Input
                    value={draft.title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Ex: Les meilleurs festivals à ne pas rater à Cotonou"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 'var(--font-size-body-sm)' }}>
                    Lien / Slug (URL simplifiée) <span style={{ color: 'var(--primary)' }}>*</span>
                  </label>
                  <Input
                    value={draft.slug}
                    onChange={(e) => patch({ slug: generateSlug(e.target.value) })}
                    placeholder="ex: meilleurs-festivals-cotonou"
                  />
                  <span style={{ fontSize: 'var(--font-size-caption)', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                    Adresse : https://liveinblack.com/blog/{draft.slug || 'mon-article'}
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 'var(--font-size-body-sm)' }}>
                    Catégorie <span style={{ color: 'var(--primary)' }}>*</span>
                  </label>
                  <Select
                    value={draft.category}
                    onChange={(v) => patch({ category: v as BlogCategoryId })}
                    options={BLOG_CATEGORY_IDS.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 'var(--font-size-body-sm)' }}>
                    Extrait / Résumé court <span style={{ color: 'var(--primary)' }}>*</span>
                  </label>
                  <Textarea
                    value={draft.excerpt}
                    onChange={(e) => patch({ excerpt: e.target.value })}
                    rows={2}
                    placeholder="Un aperçu en deux phrases pour accrocher les lecteurs..."
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontWeight: 600, fontSize: 'var(--font-size-body-sm)' }}>
                      Corps de l'article <span style={{ color: 'var(--primary)' }}>*</span>
                    </label>
                    <span style={{ fontSize: 'var(--font-size-caption)', color: 'var(--text-muted)' }}>
                      Supporte le HTML (&lt;p&gt;, &lt;h2&gt;, &lt;strong&gt;, etc.)
                    </span>
                  </div>
                  <Textarea
                    value={draft.content}
                    onChange={(e) => patch({ content: e.target.value })}
                    rows={10}
                    placeholder="<p>Rédigez ou collez le texte de votre article ici...</p>"
                  />
                </div>
              </div>
            ) : null}

            {/* TAB 2: MÉDIAS & PUBLICATION */}
            {activeFormTab === 'media' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 'var(--font-size-body-sm)' }}>
                    Image de couverture (URL)
                  </label>
                  <Input
                    value={draft.coverImageUrl}
                    onChange={(e) => patch({ coverImageUrl: e.target.value })}
                    placeholder="https://images.unsplash.com/... ou Cloudinary"
                  />
                  {draft.coverImageUrl ? (
                    <div style={{ marginTop: 10, borderRadius: 8, overflow: 'hidden', height: 160, border: '1px solid var(--border)', background: `url(${draft.coverImageUrl}) center/cover no-repeat` }} />
                  ) : null}
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 'var(--font-size-body-sm)' }}>
                    Mots-clés / Tags (séparés par des virgules)
                  </label>
                  <Input
                    value={draft.tags}
                    onChange={(e) => patch({ tags: e.target.value })}
                    placeholder="festival, musique, guide, afrobeats"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 'var(--font-size-body-sm)' }}>
                      Date de parution
                    </label>
                    <Input
                      type="date"
                      value={draft.publishedAt}
                      onChange={(e) => patch({ publishedAt: e.target.value })}
                    />
                    <span style={{ fontSize: 'var(--font-size-caption)', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                      Une date future programme l'article automatiquement.
                    </span>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 'var(--font-size-body-sm)' }}>
                      Temps de lecture
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={draft.readingTimeMinutes}
                      onChange={(e) => patch({ readingTimeMinutes: e.target.value })}
                    />
                    <span style={{ fontSize: 'var(--font-size-caption)', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                      En minutes (ex: 4)
                    </span>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 'var(--font-size-body-sm)' }}>
                    Nom de l'auteur
                  </label>
                  <Input
                    value={draft.authorName}
                    onChange={(e) => patch({ authorName: e.target.value })}
                    placeholder="Équipe LIVEINBLACK"
                  />
                </div>
              </div>
            ) : null}

            {/* TAB 3: SEO */}
            {activeFormTab === 'seo' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 'var(--font-size-body-sm)' }}>
                    Titre SEO (apparaît sur Google)
                  </label>
                  <Input
                    value={draft.metaTitle}
                    onChange={(e) => patch({ metaTitle: e.target.value })}
                    placeholder="Laisser vide pour utiliser le titre standard"
                  />
                  <span style={{ fontSize: 'var(--font-size-caption)', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                    Recommandé : 50 à 60 caractères max.
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 'var(--font-size-body-sm)' }}>
                    Description Google (Meta description)
                  </label>
                  <Textarea
                    value={draft.metaDescription}
                    onChange={(e) => patch({ metaDescription: e.target.value })}
                    rows={3}
                    placeholder="Description attrayante pour le moteur de recherche Google..."
                  />
                  <span style={{ fontSize: 'var(--font-size-caption)', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                    Recommandé : ~150 caractères.
                  </span>
                </div>

                {/* Aperçu Google Search */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--surface-subtle)' }}>
                  <span style={{ fontSize: 'var(--font-size-caption)', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                    Aperçu dans les résultats Google :
                  </span>
                  <span style={{ color: '#38bdf8', fontSize: '15px', fontWeight: 600, display: 'block' }}>
                    {draft.metaTitle || draft.title || 'Titre de mon article'} — LIVEINBLACK
                  </span>
                  <span style={{ color: '#22c55e', fontSize: '12px', display: 'block', margin: '2px 0 4px' }}>
                    https://liveinblack.com/blog/{draft.slug || 'mon-article'}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.4, display: 'block' }}>
                    {draft.metaDescription || draft.excerpt || 'Aucune description fournie.'}
                  </span>
                </div>
              </div>
            ) : null}

            {formError && (
              <p style={{ fontSize: 'var(--font-size-footnote-lg)', fontWeight: 600, color: 'var(--danger)', margin: 0 }}>
                {formError}
              </p>
            )}

            {/* Boutons footer du tiroir */}
            <div style={{ display: 'flex', gap: 10, marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <Button
                variant="primary"
                onClick={onSave}
                disabled={saving}
                loading={saving}
                loadingText="Enregistrement..."
                style={{ flex: 1 }}
              >
                {editingId ? 'Enregistrer les modifications' : 'Créer l’article'}
              </Button>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Annuler
              </Button>
            </div>
          </div>
        </SlideOverModal>
      )}

      {/* Dialogue de confirmation de suppression */}
      {confirmDeleteId && (
        <Modal
          onClose={() => setConfirmDeleteId(null)}
          ariaLabel="Supprimer l’article"
          title="Supprimer cet article"
          actions={
            <>
              <Button variant="secondary" onClick={() => setConfirmDeleteId(null)} disabled={deletingId === confirmDeleteId}>
                Annuler
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const id = confirmDeleteId
                  setConfirmDeleteId(null)
                  void onDelete(id)
                }}
                disabled={deletingId === confirmDeleteId}
                loading={deletingId === confirmDeleteId}
                loadingText="Suppression…"
              >
                Supprimer définitivement
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6, fontSize: 'var(--font-size-body-sm)' }}>
            Cet article sera définitivement retiré du blog public et de l'index des moteurs de recherche. Cette action est irréversible.
          </p>
        </Modal>
      )}
    </main>
  )
}
