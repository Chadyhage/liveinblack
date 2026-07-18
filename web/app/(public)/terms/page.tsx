import type { Metadata } from 'next'
import LegalPageLayout, { type LegalSection } from '@/app/components/LegalPageLayout'
import { LEGAL } from '@/lib/shared/legal'

export const metadata: Metadata = {
  title: `Conditions Générales d'Utilisation et de Vente — ${LEGAL.brand}`,
  description: "Conditions Générales d'Utilisation et de Vente (CGU/CGV) de LIVEINBLACK.",
}

// Port de src/pages/CGUPage.jsx — CGU + CGV — marketplace billetterie &
// services événementiels. Couvre le rôle d'intermédiaire technique
// d'encaissement, les frais de service, la commission, le droit de
// rétractation (exception billetterie L221-28 12°), les remboursements et
// les reversements vendeurs.
export default function CGUPage() {
  const sections: LegalSection[] = [
    {
      n: '01',
      title: 'Objet et présentation',
      body: `${LEGAL.brand} édite une marketplace événementielle qui met en relation des organisateurs d'événements, des prestataires de services (artistes, lieux, matériel, traiteurs) et des participants. La plateforme permet notamment la réservation de billets, la mise en relation avec des prestataires, la messagerie et la précommande de consommations.

${LEGAL.brand} agit en qualité d'intermédiaire technique. ${LEGAL.brand} n'est ni l'organisateur des événements, ni le prestataire des services proposés : ces derniers sont seuls responsables de leurs offres, de la tenue de leurs événements et de l'exécution de leurs prestations.`,
    },
    {
      n: '02',
      title: 'Acceptation des conditions',
      body: `En créant un compte ou en utilisant la plateforme ${LEGAL.domain}, l'utilisateur accepte sans réserve les présentes Conditions Générales d'Utilisation et de Vente (CGU/CGV). À défaut d'acceptation, il doit cesser toute utilisation de la plateforme.`,
    },
    {
      n: '03',
      title: 'Inscription et compte',
      body: `L'inscription est gratuite et réservée aux personnes physiques majeures (18 ans révolus) ou aux personnes morales dûment représentées. L'utilisateur s'engage à fournir des informations exactes et à jour, et demeure responsable de la confidentialité de ses identifiants. Tout compte créé avec des informations fausses pourra être suspendu.`,
    },
    {
      n: '04',
      title: 'Rôle de la plateforme et encaissement pour compte de tiers',
      body: `Pour les ventes réalisées via la plateforme (billets, services), ${LEGAL.brand} encaisse les paiements pour le compte de l'organisateur ou du prestataire vendeur, via ses prestataires de services de paiement : Stripe (zone euro) et FedaPay (zone FCFA — mobile money et cartes au Togo, Bénin et pays couverts). ${LEGAL.brand} agit comme mandataire d'encaissement : les sommes correspondant au prix de la prestation appartiennent au vendeur et lui sont reversées, déduction faite de la commission applicable.

${LEGAL.brand} n'est pas partie au contrat de vente conclu entre l'acheteur et le vendeur. La responsabilité de la fourniture du billet, de l'accès à l'événement ou de l'exécution du service incombe exclusivement au vendeur.`,
    },
    {
      n: '05',
      title: 'Prix, frais de service et commission',
      body: `Le prix des billets et des prestations est fixé librement par l'organisateur ou le prestataire. Des frais de service ${LEGAL.brand} sont ajoutés au prix et payés par l'acheteur : en zone euro, actuellement 5 % + 0,49 € par billet, plafonnés à 2,50 € par billet ; en zone FCFA, actuellement 5 % + 300 FCFA par billet, plafonnés à 1 500 FCFA par billet. Aucuns frais ne s'appliquent aux billets gratuits. Les frais de service sont affichés clairement avant la validation du paiement.

Pour les prestations de services réservées et payées via la plateforme, une commission (actuellement 10 %) est prélevée sur le montant dû au prestataire. Les options de mise en avant (« boosts », placements sponsorisés, abonnements) sont des services payants distincts, facturés directement par ${LEGAL.brand}. Les frais de service et commissions ne sont pas remboursables, sauf disposition légale impérative contraire.`,
    },
    {
      n: '06',
      title: 'Droit de rétractation',
      body: `Conformément à l'article L.221-28 12° du Code de la consommation, le droit de rétractation ne s'applique pas aux prestations de services de loisirs (billetterie d'événements, spectacles) fournies à une date ou selon une périodicité déterminée. L'achat d'un billet pour un événement daté est donc ferme et définitif dès sa confirmation, sous réserve des cas de remboursement ci-dessous.`,
    },
    {
      n: '07',
      title: 'Annulation et remboursement',
      body: `En cas d'annulation d'un événement par l'organisateur, l'acheteur est remboursé du prix du billet. Le remboursement est traité par l'organisateur via la plateforme ; ${LEGAL.brand} facilite l'opération sans en être le débiteur final.

Toute demande de remboursement, contestation ou litige relatif à un événement ou à une prestation doit être adressée en priorité au vendeur concerné. ${LEGAL.brand} peut intervenir à titre de facilitateur mais n'est pas garant du remboursement dû par un vendeur défaillant.`,
    },
    {
      n: '08',
      title: 'Obligations des organisateurs et prestataires',
      body: `Les organisateurs et prestataires s'engagent à : fournir des informations exactes sur leurs offres ; respecter l'ensemble des obligations légales et réglementaires applicables à leur activité (autorisations, sécurité, capacité d'accueil, licences, vente d'alcool, fiscalité, droits d'auteur) ; honorer les réservations confirmées ; et s'acquitter des commissions dues. Ils garantissent ${LEGAL.brand} contre toute réclamation de tiers liée à leur activité.`,
    },
    {
      n: '09',
      title: 'Reversements aux vendeurs',
      body: `Les sommes dues aux vendeurs (prix de la prestation, après commission) leur sont reversées sur le compte bancaire qu'ils ont renseigné. Pour les vendeurs situés dans un pays pris en charge par Stripe, le reversement est automatisé via Stripe Connect. Pour les vendeurs situés dans un pays non pris en charge par Stripe, ${LEGAL.brand} procède au reversement par un autre moyen (virement, paiement mobile) après réception de la demande, dans un délai raisonnable. Le vendeur est responsable de l'exactitude de ses coordonnées de paiement et de ses obligations fiscales et déclaratives.`,
    },
    {
      n: '10',
      title: 'Comportement et contenus',
      body: `L'utilisateur s'interdit de publier des contenus illicites, trompeurs, diffamatoires, haineux ou portant atteinte aux droits de tiers, ainsi que d'utiliser la plateforme à des fins frauduleuses ou de contourner les mécanismes de paiement et de commission. ${LEGAL.brand} peut retirer tout contenu et suspendre tout compte en cas de manquement.`,
    },
    {
      n: '11',
      title: 'Propriété intellectuelle',
      body: `L'ensemble des éléments de la plateforme (marque ${LEGAL.brand}, logos, textes, visuels, code source) est protégé par le droit de la propriété intellectuelle. Toute reproduction ou utilisation sans autorisation écrite préalable est interdite. Les contenus publiés par les utilisateurs restent leur propriété, ${LEGAL.brand} bénéficiant d'une licence d'utilisation aux seules fins d'exploitation de la plateforme.`,
    },
    {
      n: '12',
      title: 'Responsabilité',
      body: `${LEGAL.brand} fournit la plateforme « en l'état » et met en œuvre les moyens raisonnables pour en assurer la disponibilité et la sécurité, sans garantie d'absence totale d'interruption ou d'erreur. En sa qualité d'intermédiaire, ${LEGAL.brand} ne saurait être tenu responsable de l'inexécution ou de la mauvaise exécution des prestations vendues par les organisateurs et prestataires, ni des informations qu'ils publient.`,
    },
    {
      n: '13',
      title: 'Données personnelles',
      body: `Le traitement des données personnelles est décrit dans la Politique de confidentialité accessible depuis le pied de page, conforme au RGPD. L'utilisateur y dispose notamment de droits d'accès, de rectification et de suppression.`,
    },
    {
      n: '14',
      title: 'Modification des conditions',
      body: `${LEGAL.brand} peut modifier les présentes CGU/CGV à tout moment, notamment pour refléter une évolution légale ou de ses services (dont les taux de frais et commissions). Les utilisateurs sont informés des modifications par notification dans l'application. La poursuite de l'utilisation vaut acceptation des nouvelles conditions.`,
    },
    {
      n: '15',
      title: 'Droit applicable, médiation et litiges',
      body: `Les présentes sont régies par le droit français. Conformément aux articles L.611-1 et suivants du Code de la consommation, le consommateur peut recourir gratuitement à un médiateur de la consommation. La plateforme européenne de règlement en ligne des litiges est accessible à : https://ec.europa.eu/consumers/odr. À défaut de résolution amiable, les tribunaux français sont compétents.`,
    },
    {
      n: '16',
      title: 'Contact',
      body: 'Pour toute question relative aux présentes CGU/CGV :',
      contact: LEGAL.contactEmail,
    },
  ]

  return (
    <LegalPageLayout
      title="Conditions Générales d'Utilisation et de Vente"
      lastUpdate={LEGAL.lastUpdate}
      sections={sections}
      footerNotice="Document provisoire à valeur informative — la version définitive devra être validée par un juriste avant le lancement commercial, notamment sur le statut d'intermédiaire de paiement et les obligations associées."
    />
  )
}
