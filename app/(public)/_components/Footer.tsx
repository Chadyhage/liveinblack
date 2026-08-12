'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LEGAL } from '@/lib/shared/legal'

type FooterLink = { href: string; label: string }
type FooterColumn = { title: string; links: FooterLink[] }

const COLUMNS: FooterColumn[] = [
  {
    title: 'Découvrir',
    links: [
      { href: '/events', label: 'Événements' },
      { href: '/providers', label: 'Prestataires' },
      { href: '/organizers', label: 'Organisateurs' },
      { href: '/about', label: "C'est quoi" },
    ],
  },
  {
    title: 'Compte',
    links: [
      { href: '/login', label: 'Connexion' },
      { href: '/login?mode=register', label: 'Créer un compte' },
      { href: '/organizer-signup', label: 'Devenir organisateur' },
      { href: '/provider-signup', label: 'Devenir prestataire' },
    ],
  },
  {
    title: 'Légal',
    links: [
      { href: '/legal-notice', label: 'Mentions légales' },
      { href: '/terms', label: 'CGU' },
      { href: '/privacy', label: 'Confidentialité' },
      { href: '/cookies', label: 'Cookies' },
    ],
  },
  {
    title: 'Contact',
    links: [{ href: '/contact', label: 'Nous contacter' }],
  },
]

// Pages légales déjà auto-suffisantes (sommaire interne, liens croisés,
// thème clair "papier" distinct) : le footer sombre standard n'y est pas
// affiché pour éviter tout conflit visuel avec FiligraneRoseBg. Ces pages
// restent atteignables depuis le footer affiché sur toutes les autres pages
// publiques (home, providers, organizers, about, events, search, login…).
const HIDE_ON = ['/legal-notice', '/terms', '/privacy', '/cookies', '/contact']

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
        padding: 'clamp(40px, 6vw, 64px) clamp(20px, 3vw, 48px) clamp(24px, 3vw, 32px)',
      }}
    >
      <div style={{ maxWidth: 1800, margin: '0 auto' }}>
        <div className="lb-footer-grid">
          <div className="lb-footer-brand">
            <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text)' }}>
              L<span style={{ color: 'var(--text)' }}>|</span>VE IN{' '}
              <span style={{ color: 'var(--teal)' }}>BLACK</span>
            </span>
            <p style={{ marginTop: 12, marginBottom: 0, maxWidth: 320, fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>
              La plateforme qui connecte organisateurs, prestataires et publics autour d'événements d'exception.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} className="lb-footer-col" aria-label={col.title}>
              <p style={{ margin: '0 0 14px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)' }}>
                {col.title}
              </p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="lb-footer-link" style={{ minHeight: 36, display: 'inline-flex', alignItems: 'center', fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div style={{ marginTop: 'clamp(28px, 4vw, 40px)', paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: 0 }}>© {new Date().getFullYear()} {LEGAL.brand}. Tous droits réservés.</p>
        </div>
      </div>

      <style>{`
        .lb-footer-link { transition: color 150ms ease; }
        .lb-footer-link:hover, .lb-footer-link:focus-visible { color: var(--teal); }
        .lb-footer-grid {
          display: grid;
          grid-template-columns: minmax(200px, 1.4fr) repeat(4, 1fr);
          gap: 32px;
        }
        @media (max-width: 900px) {
          .lb-footer-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 28px 20px;
          }
          .lb-footer-brand { grid-column: 1 / -1; }
        }
        @media (max-width: 560px) {
          .lb-footer-grid {
            grid-template-columns: 1fr;
            gap: 28px;
          }
          .lb-footer-brand { grid-column: auto; }
        }
      `}</style>
    </footer>
  )
}
