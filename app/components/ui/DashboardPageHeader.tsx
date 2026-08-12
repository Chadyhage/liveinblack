import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './DashboardPageHeader.module.css'

export interface DashboardPageHeaderProps {
  eyebrow?: string
  title: string
  description?: ReactNode
  backHref?: string
  backLabel?: string
  actions?: ReactNode
}

export default function DashboardPageHeader({ eyebrow, title, description, backHref, backLabel = 'Retour', actions }: DashboardPageHeaderProps) {
  return (
    <header className={styles.root}>
      <div className={styles.copy}>
        {backHref ? <Link href={backHref} className={styles.back}><ArrowLeft size={17} aria-hidden="true" />{backLabel}</Link> : null}
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h1 className={`lb-dashboard-title ${styles.title}`}>{title}</h1>
        {description ? <p className={`lb-dashboard-description ${styles.description}`}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  )
}
