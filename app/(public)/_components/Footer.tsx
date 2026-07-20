'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LEGAL } from '@/lib/shared/legal'

const LEGAL_LINKS = [
  { href: '/legal-notice', label: 'Mentions légales' },
  { href: '/terms', label: 'CGU' },
  { href: '/privacy', label: 'Confidentialité' },
  { href: '/cookies', label: 'Cookies' },
]

// Pages légales déjà auto-suffisantes (sommaire interne, liens croisés,
// thème clair "papier" distinct) : le footer sombre standard n'y est pas
// affiché pour éviter tout conflit visuel avec FiligraneRoseBg. Ces pages
// restent atteignables depuis le footer affiché sur toutes les autres pages
// publiques (home, providers, organizers, about, events, search, login…).
const HIDE_ON = ['/legal-notice', '/terms', '/privacy', '/cookies']

// Footer public partagé — jusqu'ici absent de (public)/layout.tsx, ce qui
// rendait /legal-notice, /terms, /privacy et /cookies injoignables depuis
// l'UI (uniquement par URL directe ou lien enfoui ailleurs).
export default function Footer() {
  const pathname = usePathname()
  if (HIDE_ON.some((p) => pathname?.startsWith(p))) return null

  return (
    <footer
      style={{
        borderTop: '1px solid var(--border)',
        padding: '20px 22px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {LEGAL_LINKS.map((link) => (
          <Link key={link.href} href={link.href} style={{ fontSize: 12.5, color: 'var(--text-muted)', textDecoration: 'none' }}>
            {link.label}
          </Link>
        ))}
        <a href={`mailto:${LEGAL.contactEmail}`} style={{ fontSize: 12.5, color: 'var(--text-muted)', textDecoration: 'none' }}>
          Contact
        </a>
      </nav>
      <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0 }}>© {new Date().getFullYear()} {LEGAL.brand}</p>
    </footer>
  )
}
