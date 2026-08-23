'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button, Card, Input, Textarea, Select, Modal, Skeleton, EmptyState } from '@/app/components/ui'

// BLOG_CATEGORY_IDS n'est PAS importé depuis lib/models/BlogPost.ts ici :
// ce fichier est un composant client, et lib/models/BlogPost.ts importe
// mongoose (dépendance serveur uniquement, casse le bundle navigateur —
// "Can't resolve 'async_hooks'"). Liste dupliquée volontairement, tenue en
// synchronisation manuelle avec BLOG_CATEGORY_IDS côté serveur.
const BLOG_CATEGORY_IDS = ['togo', 'benin', 'cote-ivoire', 'senegal', 'burkina-faso', 'mali', 'niger', 'guinee-bissau', 'france', 'guide', 'actualite'] as const
type BlogCategoryId = (typeof BLOG_CATEGORY_IDS)[number]

// Comble une lacune de gestion : lib/models/BlogPost.ts existe et
// app/(public)/blog/ affiche les articles, mais rien ne permettait de les
// créer/modifier/supprimer via l'UI (uniquement en base directement). Suit
// le même pattern fetch-au-montage + guard requireAgent que les autres
// panneaux agent (voir AgentHomepageConfigClient.tsx).

const CATEGORY_LABELS: Record<BlogCategoryId, string> = {
  togo: 'Togo',
  benin: 'Bénin',
  'cote-ivoire': "Côte d'Ivoire",
  senegal: 'Sénégal',
  'burkina-faso': 'Burkina Faso',
  mali: 'Mali',
  niger: 'Niger',
  'guinee-bissau': 'Guinée-Bissau',
  france: 'France',
  guide: 'Guide',
  actualite: 'Actualité',
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

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 400, textTransform: 'uppercase', letterSpacing: '3.2px', color: 'var(--teal)', fontFamily: 'var(--font-display), sans-serif', marginBottom: 8 }

export default function AgentBlogClient() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [renderedAt] = useState(() => Date.now())

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

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

  const sorted = useMemo(() => [...posts].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()), [posts])

  function openCreate() {
    setEditingId(null)
    setDraft(emptyDraft())
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(p: Post) {
    setEditingId(p.id)
    setDraft(toDraft(p))
    setFormError(null)
    setModalOpen(true)
  }

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  async function onSave() {
    setFormError(null)
    const readingTimeMinutes = Number(draft.readingTimeMinutes)
    if (!draft.slug.trim() || !draft.title.trim() || !draft.excerpt.trim() || !draft.content.trim() || !draft.authorName.trim() || !draft.metaTitle.trim() || !draft.metaDescription.trim()) {
      setFormError('Tous les champs sont requis (sauf image de couverture et tags).')
      return
    }
    if (!Number.isFinite(readingTimeMinutes) || readingTimeMinutes < 1) {
      setFormError('Temps de lecture invalide.')
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
        metaTitle: draft.metaTitle.trim(),
        metaDescription: draft.metaDescription.trim(),
        readingTimeMinutes,
      }
      const res = await fetch(editingId ? `/api/agent/blog/${editingId}` : '/api/agent/blog', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setFormError(data.error === 'invalid_body' ? 'Champs invalides — vérifie le slug (minuscules, chiffres, tirets).' : "Échec de l'enregistrement.")
        return
      }
      setPosts((cur) => {
        if (editingId) return cur.map((p) => (p.id === editingId ? data.post : p))
        return [data.post, ...cur]
      })
      setModalOpen(false)
    } catch {
      setFormError("Échec de l'enregistrement — réessaie.")
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
      <main className="lb-dashboard-page lb-agent-screen lb-agent-screen--blog">
        <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Skeleton width="35%" height={16} />
          <Skeleton width="100%" height={44} radius={10} />
          <Skeleton width="100%" height={44} radius={10} />
        </Card>
      </main>
    )
  }

  return (
    <main className="lb-dashboard-page lb-agent-screen lb-agent-screen--blog">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 3, fontWeight: 500, fontSize: 13, textTransform: 'none', letterSpacing: 'normal' }}>
            <Plus size={16} /> Nouvel article
          </Button>
        </div>

        {loadError && (
          <Card style={{ border: '1px solid rgba(224,90,170,0.35)' }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Lecture impossible — recharge la page pour réessayer.</p>
          </Card>
        )}

        {sorted.length === 0 ? (
          <EmptyState title="Aucun article" description="Crée le premier article du blog." />
        ) : (
          <div className="lb-agent-blog-grid" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sorted.map((p) => {
              const scheduled = new Date(p.publishedAt).getTime() > renderedAt
              return (
                <Card key={p.id} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</span>
                      {scheduled && (
                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gold)', border: '1px solid rgba(200,169,110,0.4)', borderRadius: 6, padding: '2px 6px', flexShrink: 0 }}>
                          Programmé
                        </span>
                      )}
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--text-faint)', marginTop: 2 }}>
                      {CATEGORY_LABELS[p.category]} · {new Date(p.publishedAt).toLocaleDateString('fr-FR')} · /blog/{p.slug}
                    </span>
                  </span>
                  <Button variant="ghost" aria-label="Modifier" onClick={() => openEdit(p)} style={{ padding: 8, minHeight: 44, minWidth: 44 }}>
                    <Pencil size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label="Supprimer"
                    onClick={() => setConfirmDeleteId(p.id)}
                    disabled={deletingId === p.id}
                    style={{ padding: 8, minHeight: 44, minWidth: 44, color: '#ff9ed2' }}
                  >
                    <Trash2 size={15} />
                  </Button>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {modalOpen && (
      <Modal onClose={() => setModalOpen(false)} ariaLabel={editingId ? "Modifier l’article" : "Créer un article"}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#fff' }}>{editingId ? "Modifier l'article" : 'Nouvel article'}</h3>
          <div>
            <span style={labelStyle}>Titre</span>
            <Input value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Titre de l'article" />
          </div>
          <div>
            <span style={labelStyle}>Slug</span>
            <Input value={draft.slug} onChange={(e) => patch({ slug: e.target.value.toLowerCase() })} placeholder="mon-article" />
          </div>
          <div>
            <span style={labelStyle}>Catégorie</span>
            <Select
              value={draft.category}
              onChange={(v) => patch({ category: v as BlogCategoryId })}
              options={BLOG_CATEGORY_IDS.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
            />
          </div>
          <div>
            <span style={labelStyle}>Extrait</span>
            <Textarea value={draft.excerpt} onChange={(e) => patch({ excerpt: e.target.value })} rows={2} placeholder="Résumé court affiché dans la liste" />
          </div>
          <div>
            <span style={labelStyle}>Contenu (HTML)</span>
            <Textarea value={draft.content} onChange={(e) => patch({ content: e.target.value })} rows={8} placeholder="<p>Contenu de l'article…</p>" />
          </div>
          <div>
            <span style={labelStyle}>Image de couverture (URL)</span>
            <Input value={draft.coverImageUrl} onChange={(e) => patch({ coverImageUrl: e.target.value })} placeholder="https://res.cloudinary.com/…" />
          </div>
          <div>
            <span style={labelStyle}>Tags (séparés par des virgules)</span>
            <Input value={draft.tags} onChange={(e) => patch({ tags: e.target.value })} placeholder="soirée, guide, nouveauté" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <span style={labelStyle}>Date de publication</span>
              <Input type="date" value={draft.publishedAt} onChange={(e) => patch({ publishedAt: e.target.value })} />
            </div>
            <div style={{ width: 130 }}>
              <span style={labelStyle}>Lecture (min)</span>
              <Input type="number" min={1} value={draft.readingTimeMinutes} onChange={(e) => patch({ readingTimeMinutes: e.target.value })} />
            </div>
          </div>
          <div>
            <span style={labelStyle}>Auteur</span>
            <Input value={draft.authorName} onChange={(e) => patch({ authorName: e.target.value })} />
          </div>
          <div>
            <span style={labelStyle}>Meta titre (SEO)</span>
            <Input value={draft.metaTitle} onChange={(e) => patch({ metaTitle: e.target.value })} />
          </div>
          <div>
            <span style={labelStyle}>Meta description (SEO)</span>
            <Textarea value={draft.metaDescription} onChange={(e) => patch({ metaDescription: e.target.value })} rows={2} />
          </div>

          {formError && <p style={{ fontSize: 12.5, fontWeight: 600, color: '#ff9ed2', margin: 0 }}>{formError}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <Button
              variant="primary"
              onClick={onSave}
              disabled={saving}
              loading={saving}
              loadingText="Enregistrement…"
              style={{ padding: '10px 20px', borderRadius: 3, fontWeight: 500, fontSize: 13, textTransform: 'none', letterSpacing: 'normal' }}
            >
              Enregistrer
            </Button>
            <Button variant="ghost" onClick={() => setModalOpen(false)} style={{ padding: '10px 20px' }}>
              Annuler
            </Button>
          </div>
        </div>
      </Modal>
      )}

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
                Supprimer
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6, fontSize: 14 }}>
            L’article sera retiré définitivement du blog public.
          </p>
        </Modal>
      )}
    </main>
  )
}
