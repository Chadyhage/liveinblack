import { useNavigate } from 'react-router-dom'

// ─── Design tokens ────────────────────────────────────────────────────────
const CARD = {
  background: 'rgba(8,10,20,0.55)',
  backdropFilter: 'blur(22px) saturate(1.6)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 12,
}

const FONTS = {
  display: "'Cormorant Garamond', Georgia, serif",
  mono: "'DM Mono', 'Fira Mono', monospace",
}

const COLORS = {
  gold: '#c8a96e',
  muted: 'rgba(255,255,255,0.42)',
  dim: 'rgba(255,255,255,0.22)',
}

const SECTIONS = [
  {
    n: '01',
    title: 'Présentation de la plateforme',
    body: "LIVEINBLACK est une marketplace événementielle qui met en relation des organisateurs d'événements, des prestataires de services et des participants. La plateforme permet la réservation de billets, la gestion de playlists interactives et la précommande de consommations.",
  },
  {
    n: '02',
    title: "Acceptation des conditions",
    body: "En utilisant la plateforme LIVEINBLACK, l'utilisateur accepte sans réserve les présentes Conditions Générales d'Utilisation. Si l'utilisateur n'accepte pas ces conditions, il doit cesser toute utilisation de la plateforme.",
  },
  {
    n: '03',
    title: "Inscription et compte utilisateur",
    body: "L'inscription à LIVEINBLACK est gratuite et ouverte à toute personne physique majeure. L'utilisateur s'engage à fournir des informations exactes et à jour lors de son inscription. Chaque utilisateur est responsable de la confidentialité de ses identifiants de connexion.",
  },
  {
    n: '04',
    title: "Billetterie et réservations",
    body: "Les réservations effectuées sur la plateforme sont fermes et définitives. Aucun remboursement ne sera accordé sauf en cas d'annulation de l'événement par l'organisateur. Les billets sont strictement personnels et non transmissibles sans autorisation préalable.",
  },
  {
    n: '05',
    title: "Données personnelles",
    body: "LIVEINBLACK collecte et traite les données personnelles des utilisateurs conformément au RGPD. Les données sont utilisées exclusivement pour la gestion des comptes et des transactions. L'utilisateur dispose d'un droit d'accès, de rectification et de suppression de ses données.",
  },
  {
    n: '07',
    title: "Propriété intellectuelle",
    body: "L'ensemble des contenus présents sur LIVEINBLACK (logos, textes, visuels, code source) sont protégés par le droit de la propriété intellectuelle. Toute reproduction ou utilisation sans autorisation est strictement interdite.",
  },
  {
    n: '08',
    title: "Responsabilité",
    body: "LIVEINBLACK ne saurait être tenu responsable des dommages directs ou indirects résultant de l'utilisation de la plateforme. Les informations publiées sur les événements sont sous la responsabilité exclusive des organisateurs concernés.",
  },
  {
    n: '09',
    title: "Modification des CGU",
    body: "LIVEINBLACK se réserve le droit de modifier les présentes CGU à tout moment. Les utilisateurs seront informés des modifications par notification dans l'application. La poursuite de l'utilisation après modification vaut acceptation des nouvelles conditions.",
  },
  {
    n: '10',
    title: "Contact",
    body: null,
    contact: 'hagechady@liveinblack.com',
  },
]

export default function CGUPage() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh', position: 'relative', zIndex: 1,
      padding: '20px 16px 48px',
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: COLORS.muted, fontSize: 18, lineHeight: 1,
            }}>
            ‹
          </button>
          <div>
            <h1 style={{
              fontFamily: FONTS.display, fontWeight: 300,
              fontSize: 26, color: '#fff', margin: 0,
              letterSpacing: '0.04em',
            }}>
              Conditions Générales d'Utilisation
            </h1>
            <p style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.dim, margin: '4px 0 0', letterSpacing: '0.06em' }}>
              Dernière mise à jour : Janvier 2026
            </p>
          </div>
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {SECTIONS.map((s) => (
            <div key={s.n} style={{
              ...CARD,
              padding: '20px 20px',
              marginBottom: 0,
            }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {/* Gold section number */}
                <span style={{
                  fontFamily: FONTS.mono, fontSize: 11, color: COLORS.gold,
                  letterSpacing: '0.08em', flexShrink: 0, marginTop: 2, minWidth: 24,
                }}>
                  {s.n}
                </span>
                <div style={{ flex: 1 }}>
                  <h2 style={{
                    fontFamily: FONTS.display, fontWeight: 400,
                    fontSize: 18, color: '#fff', margin: '0 0 10px',
                    letterSpacing: '0.02em',
                  }}>
                    {s.title}
                  </h2>
                  {s.body && (
                    <p style={{
                      fontFamily: FONTS.mono, fontSize: 12,
                      color: COLORS.muted, margin: 0,
                      lineHeight: 1.8, letterSpacing: '0.01em',
                    }}>
                      {s.body}
                    </p>
                  )}
                  {s.contact && (
                    <p style={{
                      fontFamily: FONTS.mono, fontSize: 12,
                      color: COLORS.muted, margin: 0, lineHeight: 1.8,
                    }}>
                      Pour toute question relative aux présentes CGU, contactez notre équipe à :{' '}
                      <span style={{ color: COLORS.gold }}>{s.contact}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer notice */}
        <div style={{
          ...CARD,
          borderColor: 'rgba(255,255,255,0.06)',
          padding: '14px 18px', marginTop: 16,
        }}>
          <p style={{
            fontFamily: FONTS.mono, fontSize: 10,
            color: 'rgba(255,255,255,0.22)', textAlign: 'center', margin: 0,
            lineHeight: 1.6, letterSpacing: '0.04em',
          }}>
            Document provisoire — La version définitive sera rédigée par un juriste avant le lancement commercial.
          </p>
        </div>
      </div>
    </div>
  )
}
