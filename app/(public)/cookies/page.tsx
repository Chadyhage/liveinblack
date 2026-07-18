import type { Metadata } from 'next'
import LegalPageLayout, { type LegalSection } from '@/app/components/LegalPageLayout'
import ResetCookieConsentButton from '@/app/components/ResetCookieConsentButton'
import { LEGAL } from '@/lib/shared/legal'

export const metadata: Metadata = {
  title: `Politique de cookies — ${LEGAL.brand}`,
  description: `Politique de cookies de ${LEGAL.brand}.`,
}

// Port de src/pages/PolitiqueCookiesPage.jsx — conforme directive ePrivacy +
// recommandations CNIL sur les cookies.
export default function PolitiqueCookiesPage() {
  const sections: LegalSection[] = [
    {
      n: '01',
      title: "Qu'est-ce qu'un cookie ?",
      body: `Un cookie est un petit fichier texte déposé sur votre terminal (ordinateur, mobile, tablette) lorsque vous visitez un site web. Les cookies permettent au site de reconnaître votre navigateur lors de visites ultérieures et de mémoriser certaines informations vous concernant.

Sur ${LEGAL.domain}, nous utilisons à la fois des "cookies" classiques et des technologies similaires (localStorage, sessionStorage). Pour simplifier, nous parlerons globalement de "cookies" dans ce document.`,
    },
    {
      n: '02',
      title: 'Cookies strictement nécessaires',
      body: 'Ces cookies sont indispensables au fonctionnement du site et ne peuvent pas être désactivés. Ils sont déposés automatiquement, sans consentement préalable, conformément à la directive ePrivacy.',
      list: [
        { label: 'lib_user', value: 'session de connexion (Firebase Auth)' },
        { label: 'lib_bookings', value: 'historique de vos billets (stockage local)' },
        { label: 'lib_conversations', value: 'cache de vos conversations (stockage local)' },
        { label: 'lib_cookie_consent', value: 'mémorise votre choix de consentement aux cookies' },
        { label: 'firebase auth tokens', value: 'jetons de sécurité pour votre authentification' },
      ],
    },
    {
      n: '03',
      title: 'Cookies de fonctionnement',
      body: "Ces préférences ne sont mémorisées que si vous les acceptez dans le bandeau. Elles améliorent votre navigation mais ne sont jamais utilisées pour le suivi publicitaire, le profilage ou la mesure d'audience.",
      list: [
        { label: 'lib_music_disc', value: 'mémorise votre ambiance musicale choisie' },
        { label: 'lib_music_volume', value: 'mémorise le volume du lecteur d’ambiance' },
      ],
    },
    {
      n: '04',
      title: 'Cookies de paiement',
      body: `Lorsque vous effectuez un paiement, vous êtes redirigé vers le prestataire adapté à la devise : Stripe pour les paiements en euros, ou FedaPay pour les paiements en FCFA. Ces prestataires peuvent déposer leurs propres cookies pour sécuriser la transaction et lutter contre la fraude. Nous ne contrôlons pas ces cookies.

Politique cookies de Stripe : https://stripe.com/cookies-policy/legal
Politique de confidentialité FedaPay : https://www.fedapay.com/privacy-policies`,
    },
    {
      n: '05',
      title: "Cookies de mesure d'audience",
      body: `Actuellement, nous n'utilisons aucun outil de mesure d'audience tiers (pas de Google Analytics, pas de Meta Pixel, etc.).

Si nous décidons d'en intégrer à l'avenir, nous mettrons à jour cette politique et vous demanderons votre consentement explicite avant tout dépôt.`,
    },
    {
      n: '06',
      title: 'Durée de conservation',
      body: `La plupart de nos cookies sont des cookies de session ou ont une durée limitée à 13 mois maximum, conformément aux recommandations de la CNIL.

Vous pouvez supprimer tous les cookies à tout moment via les paramètres de votre navigateur.`,
    },
    {
      n: '07',
      title: 'Gérer votre consentement',
      body: `Au premier accès au site, un bandeau vous permet d'accepter ou de refuser les cookies non essentiels. Vous pouvez modifier votre choix à tout moment.

Vous pouvez également configurer votre navigateur pour refuser les cookies :`,
      list: [
        { label: 'Google Chrome', value: 'support.google.com/chrome → Effacer les cookies' },
        { label: 'Mozilla Firefox', value: 'support.mozilla.org → Cookies' },
        { label: 'Safari', value: 'support.apple.com → Gérer les cookies' },
        { label: 'Microsoft Edge', value: 'support.microsoft.com → Cookies' },
      ],
    },
    {
      n: '08',
      title: 'Contact',
      body: 'Pour toute question relative à notre politique de cookies, écrivez-nous à :',
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
        <ResetCookieConsentButton />
      </div>
    </div>
  )
}
