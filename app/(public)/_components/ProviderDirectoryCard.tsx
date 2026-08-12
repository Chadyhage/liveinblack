import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, MapPin, Package, Star } from 'lucide-react'
import type { PublicProvider } from '@/lib/server/providers'
import { getProviderCategories, getProviderCategory } from '@/lib/shared/providerCategories'
import { placeholderPhotoUrl } from '@/lib/shared/placeholderImage'
import styles from './ProviderDirectoryCard.module.css'

function firstCatalogImage(catalog: PublicProvider['catalog']): string | null {
  for (const item of catalog || []) {
    if (item.available === false) continue
    const image = item.media?.find((media) => media.url && media.type !== 'video')
    if (image?.url) return image.url
  }
  return null
}

export default function ProviderDirectoryCard({ provider, eager = false, priority = false }: { provider: PublicProvider; eager?: boolean; priority?: boolean }) {
  const categories = getProviderCategories(provider)
  const primaryCategory = categories[0] || getProviderCategory(provider.prestataireType)
  const availableOffers = (provider.catalog || []).filter((item) => item.available !== false)
  const coverImage = provider.coverUrl || firstCatalogImage(provider.catalog) || placeholderPhotoUrl(provider.userId, 900, 620)
  const location = [provider.city || provider.location, provider.country].filter(Boolean).join(' · ')

  return (
    <Link href={`/providers/${encodeURIComponent(provider.userId)}`} className={styles.card}>
      <div className={styles.visual} style={{ background: `linear-gradient(135deg, ${primaryCategory.color}55, #161619)` }}>
        <Image
          src={coverImage}
          alt=""
          fill
          loading={eager ? 'eager' : undefined}
          priority={priority}
          className={styles.cover}
          sizes="(max-width: 680px) calc(100vw - 40px), (max-width: 1020px) 46vw, 30vw"
        />
        <div className={styles.scrim} aria-hidden="true" />
        <span className={styles.category} style={{ background: `${primaryCategory.color}e6` }}>
          {primaryCategory.label}{categories.length > 1 ? ` +${categories.length - 1}` : ''}
        </span>
        <div className={styles.identity} style={{ background: primaryCategory.color }}>
          {provider.photoUrl ? (
            <Image src={provider.photoUrl} alt="" fill className={styles.avatar} sizes="72px" />
          ) : (
            <span aria-hidden="true">{provider.name?.[0]?.toUpperCase()}</span>
          )}
        </div>
      </div>

      <div className={styles.content}>
        <h3>{provider.name}</h3>
        {provider.headline && <p className={styles.headline}>{provider.headline}</p>}
        {location && <p className={styles.location}><MapPin size={18} aria-hidden="true" />{location}</p>}
        {provider.description && <p className={styles.description}>{provider.description}</p>}

        <div className={styles.meta}>
          <span><Package size={18} aria-hidden="true" />{availableOffers.length > 0 ? `${availableOffers.length} offre${availableOffers.length > 1 ? 's' : ''}` : 'Voir le profil'}</span>
          {(provider.ratingCount || 0) > 0 && (
            <span className={styles.rating}><Star size={17} fill="currentColor" aria-hidden="true" />{(provider.ratingAvg || 0).toFixed(1)} <small>({provider.ratingCount})</small></span>
          )}
        </div>
        <div className={styles.discover}>Découvrir le profil <ArrowUpRight size={19} aria-hidden="true" /></div>
      </div>
    </Link>
  )
}
