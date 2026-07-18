// src/pages/PolitiqueConfidentialitePage.jsx
// Conforme RGPD (UE 2016/679) + Loi Informatique et Libertés (France)
import LegalPageLayout from '../components/LegalPageLayout'
import { LEGAL } from '../data/legal'

export default function PolitiqueConfidentialitePage() {
  const sections = [
    {
      n: '01',
      title: 'Responsable du traitement',
      body: `Le responsable du traitement des données personnelles collectées sur ${LEGAL.domain} est ${LEGAL.brand}.

Pour toute question relative à vos données personnelles, vous pouvez nous contacter à : ${LEGAL.contactEmail}`,
    },
    {
      n: '02',
      title: 'Données collectées',
      body: 'Dans le cadre de l\'utilisation de la plateforme, nous collectons les catégories de données suivantes :',
      list: [
        { label: "Données d'identification", value: 'nom, prénom, email, mot de passe (chiffré), date de naissance, photo de profil' },
        { label: 'Données de connexion', value: 'adresse IP, type de navigateur, date et heure de connexion' },
        { label: 'Données de transaction', value: 'historique des achats de billets, montants, moyens de paiement (via Stripe — nous ne stockons jamais vos numéros de carte)' },
        { label: 'Données de candidature (organisateurs / prestataires)', value: 'documents d\'identité, justificatifs, informations professionnelles' },
        { label: 'Données de communication', value: 'messages échangés sur la plateforme, photos et fichiers partagés' },
        { label: 'Données de localisation', value: 'région d\'intervention déclarée par les prestataires (jamais de géolocalisation en temps réel)' },
      ],
    },
    {
      n: '03',
      title: 'Finalités et base légale',
      body: 'Vos données sont traitées pour les finalités suivantes :',
      list: [
        { label: "Création et gestion du compte utilisateur", value: 'base : exécution du contrat (art. 6.1.b RGPD)' },
        { label: "Traitement des réservations et paiements", value: 'base : exécution du contrat' },
        { label: "Communication entre utilisateurs (messagerie)", value: 'base : exécution du contrat' },
        { label: "Validation des candidatures organisateur/prestataire", value: 'base : intérêt légitime (sécurité des transactions)' },
        { label: "Sécurité de la plateforme et lutte contre la fraude", value: 'base : intérêt légitime' },
        { label: "Réponse aux obligations légales (comptabilité, demandes des autorités)", value: 'base : obligation légale' },
      ],
    },
    {
      n: '04',
      title: 'Durée de conservation',
      body: null,
      list: [
        { label: 'Données de compte actif', value: 'tant que le compte est actif + 1 an après dernière connexion' },
        { label: 'Données de transaction (factures)', value: '10 ans (obligation comptable)' },
        { label: 'Documents de candidature', value: '5 ans après refus ou désactivation' },
        { label: 'Logs techniques', value: '12 mois maximum' },
        { label: 'Cookies analytiques', value: '13 mois maximum (recommandation CNIL)' },
      ],
    },
    {
      n: '05',
      title: 'Destinataires et sous-traitants',
      body: 'Vos données ne sont jamais vendues. Elles peuvent être communiquées à nos sous-traitants techniques, qui interviennent uniquement sur instruction et dans le respect d\'un accord de traitement (DPA) :',
      list: LEGAL.subprocessors.map(sp => ({
        label: sp.name,
        value: `${sp.purpose} — ${sp.country}`,
      })),
    },
    {
      n: '06',
      title: 'Transferts hors UE',
      body: `Certains de nos sous-traitants (notamment Vercel, Google et Stripe) sont basés aux États-Unis. Ces transferts sont encadrés par les clauses contractuelles types (CCT) approuvées par la Commission européenne et par la certification au Data Privacy Framework lorsque applicable.`,
    },
    {
      n: '07',
      title: 'Vos droits',
      body: 'Conformément aux articles 15 à 22 du RGPD, vous disposez des droits suivants :',
      list: [
        { label: "Droit d'accès", value: "obtenir la confirmation que vos données sont traitées et en recevoir une copie" },
        { label: 'Droit de rectification', value: 'corriger des données inexactes ou incomplètes' },
        { label: "Droit à l'effacement (« droit à l'oubli »)", value: "demander la suppression de vos données" },
        { label: 'Droit à la limitation', value: 'demander de geler temporairement le traitement' },
        { label: 'Droit à la portabilité', value: 'recevoir vos données dans un format lisible et les transférer' },
        { label: "Droit d'opposition", value: 'vous opposer au traitement pour motifs légitimes' },
        { label: 'Droit de retirer votre consentement', value: 'à tout moment, sans affecter la licéité passée' },
        { label: 'Droit de définir des directives post-mortem', value: 'sur le sort de vos données après votre décès' },
      ],
    },
    {
      n: '08',
      title: 'Comment exercer vos droits',
      body: `Pour exercer vos droits, écrivez-nous à : ${LEGAL.contactEmail}

Nous nous engageons à répondre sous 1 mois maximum (prolongeable de 2 mois en cas de demande complexe).

Pour des raisons de sécurité, nous pouvons vous demander un justificatif d'identité.

Si vous estimez, après nous avoir contactés, que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la ${LEGAL.authority.name} :
${LEGAL.authority.address}
${LEGAL.authority.url}`,
    },
    {
      n: '09',
      title: 'Sécurité',
      body: `Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données contre la perte, l'accès non autorisé, la divulgation ou la destruction :

• Chiffrement des données en transit (HTTPS/TLS)
• Mots de passe stockés sous forme chiffrée et non réversible
• Authentification Firebase avec contrôles d'accès stricts
• Paiements via Stripe (certifié PCI-DSS niveau 1)
• Sauvegardes régulières

En cas de violation de données susceptible d'engendrer un risque pour vos droits et libertés, nous vous en informerons sous 72 heures conformément à l'article 34 du RGPD.`,
    },
    {
      n: '10',
      title: 'Cookies',
      body: 'Pour le détail de notre utilisation des cookies (cookies essentiels, mesure d\'audience, etc.), consultez notre Politique de cookies accessible depuis le pied de page.',
    },
    {
      n: '11',
      title: 'Modification de la politique',
      body: `Cette politique peut être modifiée à tout moment pour refléter les évolutions législatives ou les changements de nos pratiques. La date de dernière mise à jour figure en haut du document.

En cas de modification substantielle, nous vous en informerons par notification dans l'application ou par email.`,
    },
  ]

  return (
    <LegalPageLayout
      title="Politique de confidentialité"
      lastUpdate={LEGAL.lastUpdate}
      sections={sections}
      footerNotice="Politique conforme au RGPD et à la loi française Informatique et Libertés modifiée. Document susceptible de validation finale par un DPO ou un juriste."
    />
  )
}
