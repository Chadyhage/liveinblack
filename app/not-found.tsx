import Link from 'next/link'

// Page 404 globale — jusqu'ici absente (aucun app/not-found.tsx), une URL
// inconnue (ex. /providers/<id-inexistant>) tombait donc sur la 404 anglaise
// par défaut de Next.js dans une app par ailleurs 100% en français.
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '24px',
        gap: 14,
      }}
    >
      <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--gold)', margin: 0, textTransform: 'uppercase' }}>Erreur 404</p>
      <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: 'var(--text)' }}>Cette page n&apos;existe pas</h1>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, maxWidth: 420 }}>
        Le lien est peut-être incorrect ou la page a été supprimée.
      </p>
      <Link
        href="/home"
        style={{
          marginTop: 10,
          padding: '11px 22px',
          borderRadius: 999,
          background: 'var(--teal-solid)',
          color: '#04120e',
          fontSize: 13.5,
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        Retour à l&apos;accueil
      </Link>
    </main>
  )
}
