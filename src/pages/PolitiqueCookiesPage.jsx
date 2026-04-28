// src/pages/PolitiqueCookiesPage.jsx
// Conforme directive ePrivacy + recommandations CNIL sur les cookies
import LegalPageLayout from '../components/LegalPageLayout'
import { LEGAL } from '../data/legal'

export default function PolitiqueCookiesPage() {
  // Permet à l'utilisateur de réinitialiser son choix de consentement
  function reopenConsent() {
    try {
      localStorage.removeItem('lib_cookie_consent')
      window.location.reload()
    } catch {}
  }

  const sections = [
    {
      n: '01',
      title: "Qu'est-ce qu'un cookie ?",
      body: `Un cookie est un petit fichier texte déposé sur votre terminal (ordinateur, mobile, tablette) lorsque vous visitez un site web. Les cookies permettent au site de reconnaître votre navigateur lors de visites ultérieures et de mémoriser certaines informations vous concernant.

Sur ${LEGAL.domain}, nous utilisons à la fois des "cookies" classiques et des technologies similaires (localStorage, sessionStorage). Pour simplifier, nous parlerons globalement de "cookies" dans ce document.`,
    },
    {
      n: '02',
      title: "Cookies strictement nécessaires",
      body: `Ces cookies sont indispensables au fonctionnement du site et ne peuvent pas être désactivés. Ils sont déposés automatiquement, sans consentement préalable, conformément à la directive ePrivacy.`,
      list: [
        { label: 'lib_user', value: 'session de connexion (Firebase Auth)' },
        { label: 'lib_bookings', value: 'historique de tes billets (stockage local)' },
        { label: 'lib_conversations', value: 'cache de tes messageries (stockage local)' },
        { label: 'lib_cookie_consent', value: 'mémorise ton choix de consentement aux cookies' },
        { label: 'firebase auth tokens', value: "jetons de sécurité pour ton authentification" },
      ],
    },
    {
      n: '03',
      title: "Cookies de fonctionnement",
      body: `Ces cookies améliorent ton expérience de navigation (préférences, brouillons, etc.). Ils ne contiennent pas de données personnelles identifiantes.`,
      list: [
        { label: 'lib_age_verified', value: 'évite de redemander la vérification d\'âge' },
        { label: 'lib_selected_region', value: 'région choisie pour filtrer les événements' },
        { label: 'lib_dismissed_*', value: 'masque les bandeaux que tu as fermés' },
      ],
    },
    {
      n: '04',
      title: "Cookies de paiement",
      body: `Lorsque tu effectues un paiement, tu es redirigé vers Stripe (notre prestataire de paiement). Stripe dépose ses propres cookies pour sécuriser la transaction et lutter contre la fraude. Nous ne contrôlons pas ces cookies.

Politique cookies de Stripe : https://stripe.com/cookies-policy/legal`,
    },
    {
      n: '05',
      title: "Cookies de mesure d'audience",
      body: `Actuellement, nous n'utilisons aucun outil de mesure d'audience tiers (pas de Google Analytics, pas de Meta Pixel, etc.).

Si nous décidons d'en intégrer à l'avenir, nous mettrons à jour cette politique et te demanderons ton consentement explicite avant tout dépôt.`,
    },
    {
      n: '06',
      title: "Durée de conservation",
      body: `La plupart de nos cookies sont des cookies de session ou ont une durée limitée à 13 mois maximum, conformément aux recommandations de la CNIL.

Tu peux supprimer tous les cookies à tout moment via les paramètres de ton navigateur.`,
    },
    {
      n: '07',
      title: "Gérer ton consentement",
      body: `Au premier accès au site, un bandeau te permet d'accepter ou de refuser les cookies non essentiels. Tu peux modifier ton choix à tout moment.

Tu peux également configurer ton navigateur pour refuser les cookies :`,
      list: [
        { label: 'Google Chrome', value: 'support.google.com/chrome → Effacer les cookies' },
        { label: 'Mozilla Firefox', value: 'support.mozilla.org → Cookies' },
        { label: 'Safari', value: 'support.apple.com → Gérer les cookies' },
        { label: 'Microsoft Edge', value: 'support.microsoft.com → Cookies' },
      ],
    },
    {
      n: '08',
      title: "Contact",
      body: `Pour toute question relative à notre politique cookies, écris-nous à :`,
      contact: LEGAL.contactEmail,
    },
  ]

  return (
    <div>
      <LegalPageLayout
        title="Politique de cookies"
        lastUpdate={LEGAL.lastUpdate}
        sections={sections}
        footerNotice="Politique conforme à la directive ePrivacy et aux recommandations de la CNIL."
      />
      {/* Bouton "rouvrir le consentement" — accessible depuis la page */}
      <div style={{ maxWidth: 720, margin: '-24px auto 48px', padding: '0 16px', textAlign: 'center' }}>
        <button
          onClick={reopenConsent}
          style={{
            fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: '#c8a96e',
            background: 'rgba(200,169,110,0.10)', border: '1px solid rgba(200,169,110,0.32)',
            borderRadius: 4, padding: '10px 18px', cursor: 'pointer',
          }}>
          Réinitialiser mes préférences cookies
        </button>
      </div>
    </div>
  )
}
