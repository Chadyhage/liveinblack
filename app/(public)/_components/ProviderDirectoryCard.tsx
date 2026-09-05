import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, MapPin, Package, Star } from 'lucide-react'
import type { PublicProvider } from '@/lib/server/provider/providers'
import { getProviderCategories, getProviderCategory } from '@/lib/shared/providerCategories'
import { reliablePhotoUrl } from '@/lib/shared/placeholderImage'
import styles from './ProviderDirectoryCard.module.css'

function firstCatalogImage(catalog: PublicProvider['catalog']): string | null {
  for (const item of catalog || []) {
    if (item.available === false) continue
    const image = item.media?.find((media) => media.url && media.type !== 'video')
    if (image?.url) return image.url
  }
  return null
}

export default function ProviderDirectoryCard({ provider, eager = false }: { provider: PublicProvider; eager?: boolean }) {
  const categories = getProviderCategories(provider)
  const primaryCategory = categories[0] || getProviderCategory(provider.prestataireType)
  const availableOffers = (provider.catalog || []).filter((item) => item.available !== false)
  const coverImage = reliablePhotoUrl(provider.coverUrl || firstCatalogImage(provider.catalog), provider.userId, 900, 560)
  const location = [provider.city || provider.location, provider.country].filter(Boolean).join(' · ')

  return (
    <Link href={`/providers/${encodeURIComponent(provider.userId)}`} className={styles.card}>
      <div className={styles.visual} style={{ background: 'var(--surface-2)' }}>
        <Image
          src={coverImage}
          alt=""
          fill
          loading={eager ? 'eager' : undefined}
          className={styles.cover}
          sizes="(max-width: 680px) calc(100vw - 40px), (max-width: 1020px) 46vw, (max-width: 1440px) 24vw, 210px"
        />
        <div className={styles.scrim} aria-hidden="true" />
        <span className={styles.categoryBadge} style={{ borderColor: primaryCategory.color }}>
          {primaryCategory.label}{categories.length > 1 ? ` +${categories.length - 1}` : ''}
        </span>
        <div className={styles.identity} style={{ borderColor: primaryCategory.color }}>
          {provider.photoUrl ? (
            <Image src={provider.photoUrl} alt="" fill className={styles.avatar} sizes="44px" />
          ) : (
            <span aria-hidden="true">{provider.name?.[0]?.toUpperCase()}</span>
          )}
        </div>
      </div>

      <div className={styles.content}>
        <p className={styles.category}>{primaryCategory.label}</p>
        <h3>{provider.name}</h3>
        <div className={styles.meta}>
          {location && <span><MapPin size={18} aria-hidden="true" />{location}</span>}
          <span><Package size={18} aria-hidden="true" />{availableOffers.length > 0 ? `${availableOffers.length} offre${availableOffers.length > 1 ? 's' : ''}` : 'Profil actif'}</span>
        </div>
        <div className={styles.footer}>
          <span className={styles.footerText}>
            {(provider.ratingCount || 0) > 0 ? (
              <span className={styles.rating}><Star size={15} fill="currentColor" aria-hidden="true" />{(provider.ratingAvg || 0).toFixed(1)}</span>
            ) : (
              provider.headline || 'Prestataire'
            )}
          </span>
          <span className={styles.discover}>Découvrir <ArrowUpRight size={18} aria-hidden="true" /></span>
        </div>
      </div>
    </Link>
  )
}
