import { LegalPageLayout } from 'liveinblack-ui'

const SECTIONS = [
  {
    n: '1',
    title: 'Objet',
    body: "Les présentes conditions générales d'utilisation régissent l'accès et l'usage de la plateforme LIVEINBLACK, dédiée à la billetterie événementielle et à la mise en relation entre organisateurs, prestataires et clients.",
  },
  {
    n: '2',
    title: 'Données collectées',
    list: [
      { label: 'Identité', value: 'nom, prénom, date de naissance' },
      { label: 'Contact', value: 'email, numéro de téléphone' },
      { label: 'Paiement', value: 'traité par nos partenaires Stripe et FedaPay, jamais stocké par nos soins' },
    ],
  },
  {
    n: '3',
    title: 'Contact',
    body: 'Pour toute question relative à ces conditions :',
    contact: 'contact@liveinblack.com',
  },
]

export const Basic = () => (
  <LegalPageLayout
    title="Conditions générales d'utilisation"
    lastUpdate="Août 2026"
    sections={SECTIONS}
    footerNotice="LIVEINBLACK — plateforme événementielle et nightlife."
  />
)
