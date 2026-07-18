import Link from 'next/link'

const NAV_LINKS = [
  { href: '/events', label: 'Événements' },
  { href: '/providers', label: 'Prestataires' },
  { href: '/organizers', label: 'Organisateurs' },
  { href: '/about', label: "C'est quoi" },
  { href: '/search', label: 'Recherche' },
]

// Nav publique partagée par toutes les pages non-authentifiées. Backdrop-blur
// toléré par le design system (CLAUDE.md) même si le contenu, lui, reste opaque.
export default function PublicNav() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 22px',
        background: 'rgba(4,4,11,0.72)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <Link
        href="/home"
        style={{
          fontSize: 18,
          letterSpacing: '0.08em',
          color: 'var(--text)',
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        L<span style={{ color: 'var(--text)' }}>|</span>VE IN{' '}
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontStyle: 'italic', fontWeight: 700 }}>BLACK</span>
      </Link>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="lb-navlink"
            style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 13.5, fontWeight: 600 }}
          >
            {link.label}
          </Link>
        ))}
        <Link
          href="/login"
          style={{
            padding: '9px 18px',
            borderRadius: 999,
            background: 'var(--teal-solid)',
            color: '#04120e',
            fontSize: 13,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Connexion
        </Link>
      </nav>
      <style>{`
        .lb-navlink { display: none }
        @media (min-width: 720px) { .lb-navlink { display: inline-block } }
      `}</style>
    </header>
  )
}
