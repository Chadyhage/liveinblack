'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'
import { LEGAL } from '@/lib/shared/legal'
import styles from './Footer.module.css'

const FOOTER_GROUPS = [
  {
    title: 'Découvrir',
    links: [
      { href: '/events', label: 'Événements' },
      { href: '/providers', label: 'Prestataires' },
      { href: '/organizers', label: 'Organisateurs' },
      { href: '/blog', label: 'Blog' },
      { href: '/about', label: "C'est quoi LIVEINBLACK ?" },
    ],
  },
  {
    title: 'Votre compte',
    links: [
      { href: '/login', label: 'Connexion' },
      { href: '/login?mode=register', label: 'Créer un compte' },
      { href: '/organizer-signup', label: 'Devenir organisateur' },
      { href: '/provider-signup', label: 'Devenir prestataire' },
    ],
  },
  {
    title: 'Aide et informations',
    links: [
      { href: '/contact', label: 'Nous contacter' },
      { href: '/legal-notice', label: 'Mentions légales' },
      { href: '/terms', label: "Conditions d'utilisation" },
      { href: '/privacy', label: 'Confidentialité' },
      { href: '/cookies', label: 'Cookies' },
    ],
  },
]

const NO_FOOTER_ROUTES = ['/login', '/organizer-signup', '/provider-signup', '/reset-password', '/verify-email', '/confirmer-email']

function shouldHideFooter(pathname: string) {
  return NO_FOOTER_ROUTES.includes(pathname)
    || pathname.startsWith('/providers/')
    || pathname.startsWith('/events/')
    || pathname.startsWith('/organizers/')
}

export default function Footer() {
  const pathname = usePathname()
  if (shouldHideFooter(pathname)) return null
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brandBlock}>
            <Link href="/home" className={styles.brand} aria-label="LIVEINBLACK, accueil">
              <Image src="/branding/liveinblack-logo-header.png" alt="LIVEINBLACK" width={1876} height={285} className={styles.brandLogo} />
            </Link>
            <p>La scène qui rassemble les publics, les artistes et les professionnels autour d’expériences mémorables.</p>
            <Link href="/events" className={styles.primaryLink}>
              Explorer les événements <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </div>

          <div className={styles.groups}>
            {FOOTER_GROUPS.map((group) => (
              <nav key={group.title} aria-label={group.title} className={styles.group}>
                <h2>{group.title}</h2>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className={styles.bottom}>
          <p>© {new Date().getFullYear()} {LEGAL.brand}. Tous droits réservés.</p>
          <p>Conçu pour rendre la culture plus proche.</p>
        </div>
      </div>
    </footer>
  )
}
