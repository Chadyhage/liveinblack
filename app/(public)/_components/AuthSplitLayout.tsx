import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import styles from './AuthSplitLayout.module.css'

const HERO_IMG = '/images/live-in-black/auth-client-login-entrance.png'

export default function AuthSplitLayout({ children, tagline, heroImage, wide = false }: { children: ReactNode; tagline?: ReactNode; heroImage?: string; wide?: boolean }) {
  return (
    <main className={`lb-auth-split ${styles.shell}${wide ? ` lb-auth-split--wide ${styles.wide}` : ''}`}>
      <aside className={`lb-auth-split__visual ${styles.visual}`} aria-label="Live in Black">
        <div className={styles.imageFrame} aria-hidden="true">
          <Image src={heroImage || HERO_IMG} alt="" fill priority sizes="(max-width: 900px) 0px, 50vw" className={styles.image} />
        </div>
        <div className={styles.overlay} />
        <Link href="/home" className={styles.brand} aria-label="Live in Black — accueil">
          LIVE<span>IN</span>BLACK
        </Link>
        <div className={styles.story}>
          <span className={styles.eyebrow}>LIVE IN BLACK</span>
          <p className="font-display">{tagline || <>Toute la scène.<br /><span>Une seule expérience.</span></>}</p>
          <div className={styles.trust}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-4" /></svg>
            <span>Accès sécurisé et données protégées</span>
          </div>
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
