import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import styles from './AuthSplitLayout.module.css'

const HERO_IMG = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80'

export default function AuthSplitLayout({ children, tagline, heroImage, wide = false }: { children: ReactNode; tagline?: ReactNode; heroImage?: string; wide?: boolean }) {
  return (
    <main className={`lb-auth-split ${styles.shell}${wide ? ` lb-auth-split--wide ${styles.wide}` : ''}`}>
      <aside className={`lb-auth-split__visual ${styles.visual}`} aria-label="Live in Black">
        <div className={styles.imageFrame} aria-hidden="true">
          <Image src={heroImage || HERO_IMG} alt="" fill priority sizes="(max-width: 900px) 0px, 50vw" className={styles.image} />
        </div>
        <div className={styles.overlay} />
        <Link href="/home" className={styles.brand} aria-label="Live in Black — accueil">
          <Image src="/branding/liveinblack-logo-horizontal.png" alt="LIVEINBLACK" width={614} height={217} className={styles.brandLogo} priority />
        </Link>
        <div className={styles.story}>
          <span className={styles.eyebrow}>LIVE IN BLACK</span>
          <p className="font-display">{tagline || <>Toute la scène.<br /><span>Une seule expérience.</span></>}</p>
        </div>
      </aside>

      <section className={`lb-auth-split__form ${styles.form}`}>
        <div className={styles.topbar}>
          <Link href="/home" className={styles.back}>
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            Retour au site
          </Link>

        </div>
        <div className={styles.content}>{children}</div>
        <p className={styles.privacy}>LIVE IN BLACK protège tes informations et ne les partage jamais sans ton accord.</p>
      </section>
    </main>
  )
}
