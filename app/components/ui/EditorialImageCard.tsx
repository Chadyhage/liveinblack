import Image from 'next/image'
import type { ReactNode } from 'react'

export interface EditorialImageCardProps {
  src: string
  alt: string
  eyebrow?: string
  title: string
  description: string
  badge?: ReactNode
  priority?: boolean
}

/** Carte éditoriale image + contenu, utilisée pour expliquer les parcours publics sans recréer le même patron sur chaque page. */
export default function EditorialImageCard({ src, alt, eyebrow, title, description, badge, priority = false }: EditorialImageCardProps) {
  return (
    <article className="lb-editorial-card">
      <div className="lb-editorial-card__media" data-contrast-on-image="true">
        <Image src={src} alt={alt} fill priority={priority} sizes="(max-width: 720px) calc(100vw - 40px), (max-width: 1100px) 46vw, 31vw" />
        <div className="lb-editorial-card__scrim" />
        {badge ? <span className="lb-editorial-card__badge">{badge}</span> : null}
      </div>
      <div className="lb-editorial-card__body">
        {eyebrow ? <p>{eyebrow}</p> : null}
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </article>
  )
}
