import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getProviderByUserId } from '@/lib/server/providers'
import { getProviderCategories } from '@/lib/shared/providerCategories'
import { fmtMoney } from '@/lib/shared/money'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

const SOCIAL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  x: 'X',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const provider = await getProviderByUserId(id)
  if (!provider) return { title: 'Prestataire — LIVEINBLACK' }
  return { title: `${provider.name} — LIVEINBLACK`, description: provider.description?.slice(0, 160) }
}

// Port de src/pages/PublicPrestatairePage.jsx (lecture seule — la modale
// "Demander ce service" qui envoie un message est différée, la messagerie
// n'existe pas encore côté nouvelle stack).
export default async function PublicPrestatairePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const provider = await getProviderByUserId(id, session?.user ? { activeRole: session.user.activeRole, id: session.user.id } : null)
  if (!provider) notFound()

  const categories = getProviderCategories(provider)
  const visibleCatalog = (provider.catalog || []).filter((item) => item.available !== false)
  const socialEntries = Object.entries(provider.socialLinks || {}).filter(([key, value]) => key !== 'website' && value)

  return (
    <main style={{ maxWidth: 880, margin: '0 auto', padding: '0 0 60px', width: '100%' }}>
      <div style={{ position: 'relative', height: 180, margin: '14px 22px 0', borderRadius: 18, overflow: 'hidden', background: `linear-gradient(135deg, ${categories[0]?.color || '#8b5cf6'}33, var(--obsidian))` }}>
        {provider.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={provider.coverUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </div>

      <div style={{ padding: '0 22px', marginTop: -32, position: 'relative' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', border: '3px solid var(--obsidian)', overflow: 'hidden', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800 }}>
          {provider.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={provider.photoUrl} alt={provider.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            provider.name[0]?.toUpperCase()
          )}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '12px 0 0' }}>{provider.name}</h1>
        {provider.headline && <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0 0' }}>{provider.headline}</p>}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {categories.map((c) => (
            <span key={c.id} style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: `${c.color}cc`, padding: '4px 10px', borderRadius: 999 }}>
              {c.label}
            </span>
          ))}
        </div>

        {provider.description && (
          <Section title="À propos">
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{provider.description}</p>
          </Section>
        )}

        {socialEntries.length > 0 && (
          <Section title="Réseaux">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {socialEntries.map(([key, value]) => (
                <a key={key} href={value as string} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: 'var(--teal)', textDecoration: 'none', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '6px 14px' }}>
                  {SOCIAL_LABELS[key] || key}
                </a>
              ))}
            </div>
          </Section>
        )}

        <Section title="Coordonnées">
          <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: 0 }}>
            {[provider.city || provider.location, provider.country].filter(Boolean).join(', ')}
          </p>
          {provider.zonesIntervention?.length ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '4px 0 0' }}>Intervient : {provider.zonesIntervention.join(', ')}</p>
          ) : null}
          {provider.website && (
            <a href={provider.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--teal)', display: 'block', marginTop: 6, textDecoration: 'none' }}>
              {provider.website}
            </a>
          )}
          {provider.phone && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>{provider.phone}</p>}
        </Section>

        {visibleCatalog.length > 0 && (
          <Section title="Catalogue">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              {visibleCatalog.map((item) => (
                <div key={item.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
                  {item.media?.[0]?.url && (
                    <div style={{ aspectRatio: '4/3', position: 'relative' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.media[0].url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{item.name}</span>
                      {item.price != null && (
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)', whiteSpace: 'nowrap' }}>
                          {fmtMoney(item.price, item.currency || provider.catalogCurrency)}
                          {item.unit ? ` / ${item.unit}` : ''}
                        </span>
                      )}
                    </div>
                    {item.description && <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '6px 0 0' }}>{item.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 8px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h2>
      {children}
    </section>
  )
}
