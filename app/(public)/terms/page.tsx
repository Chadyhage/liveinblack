import type { Metadata } from 'next'
import LegalPageLayout, { type LegalSection } from '@/app/components/layout/LegalPageLayout'
import { LEGAL } from '@/lib/shared/legal'

export const metadata: Metadata = {
  title: `Conditions Générales d'Utilisation et de Vente — ${LEGAL.brand}`,
  description: "Conditions Générales d'Utilisation et de Vente (CGU/CGV) de LIVEINBLACK.",
  alternates: { canonical: '/terms' },
}

// CGU + CGV — marketplace billetterie & services événementiels. Les règles
// billetterie du lancement Bénin suivent le document fonctionnel
// annulation/report/remboursement du 31/08/2026.
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
      body: `Pour le lancement billetterie au Bénin, les paiements sont encaissés en francs CFA (XOF) via FedaPay Marketplace, qui répartit les montants entre ${LEGAL.brand} et l'organisateur vendeur. Pour les autres services ou zones maintenus hors de ce périmètre, d'autres rails de paiement peuvent exister selon la devise et le pays. ${LEGAL.brand} agit comme mandataire technique d'encaissement : les sommes correspondant au prix de la prestation appartiennent au vendeur et lui sont reversées selon le parcours applicable.

${LEGAL.brand} n'est pas partie au contrat de vente conclu entre l'acheteur et le vendeur. La responsabilité de la fourniture du billet, de l'accès à l'événement ou de l'exécution du service incombe exclusivement au vendeur.`,
    },
    {
      n: '05',
      title: 'Prix, frais de service et commission',
      body: `Le prix des billets et des prestations est fixé librement par l'organisateur ou le prestataire. Pour la billetterie XOF du lancement Bénin, les frais de service ${LEGAL.brand} sont de 5 % du prix facial, avec un minimum de 200 FCFA et un plafond de 1 500 FCFA par entrée payante. L'option d'annulation volontaire, lorsqu'elle est activée par l'organisateur sur une catégorie éligible, coûte 10 % du prix facial et reste plafonnée à 5 000 FCFA ; elle n'est proposée que pour les billets d'au moins 5 000 FCFA. Les frais de service, options et frais techniques de paiement sont affichés avant validation.

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
      body: `En cas d'annulation d'un événement par l'organisateur ou de report refusé dans le délai affiché, le dossier de remboursement est créé dans ${LEGAL.brand}. Le parcours par défaut est un retrait en espèces au point de remboursement attribué, avec un code unique. Si l'acheteur confirme qu'il ne peut pas se déplacer, ce choix est irréversible : le code est annulé et le dossier bascule vers un remboursement individuel à effectuer par l'organisateur.

Pour une annulation d'événement ou un report refusé dans les 24 heures suivant la notification, le montant suivi par ${LEGAL.brand} comprend le prix facial, les frais de service et les options achetées ; les frais techniques de paiement ne sont remboursés que s'ils sont effectivement récupérables. Pour une annulation volontaire couverte par l'option d'annulation, seul le prix facial est remboursé individuellement par l'organisateur. Aucun remboursement n'est exécuté par FedaPay : FedaPay intervient uniquement pour l'encaissement initial et la répartition Marketplace.

Toute demande de remboursement, contestation ou litige relatif à un événement ou à une prestation doit être adressée en priorité au vendeur concerné. ${LEGAL.brand} peut intervenir à titre de facilitateur mais n'est pas garant du remboursement dû par un vendeur défaillant.`,
    },
    {
      n: '08',
      title: 'Obligations des organisateurs et prestataires',
      body: `Les organisateurs et prestataires s'engagent à : fournir des informations exactes sur leurs offres ; respecter l'ensemble des obligations légales et réglementaires applicables à leur activité (autorisations, sécurité, capacité d'accueil, licences, vente d'alcool, fiscalité, droits d'auteur) ; honorer les réservations confirmées ; et s'acquitter des commissions dues. Ils garantissent ${LEGAL.brand} contre toute réclamation de tiers liée à leur activité.`,
    },
    {
      n: '09',
      title: 'Billets de groupe achetés sans compte (vente sur place par un agent)',
      body: `Lorsqu'un lot de billets de groupe est acheté sur place auprès d'un agent ${LEGAL.brand}, en espèces ou par mobile money, sans que chaque participant ne dispose d'un compte sur la plateforme, l'ensemble des billets du groupe est remis au premier participant nommé lors de la vente, qui a la qualité d'hôte du groupe. L'hôte est seul responsable de la transmission de ces billets aux autres participants.

Faute de compte associé à chaque participant, ${LEGAL.brand} n'est techniquement pas en mesure d'invalider ou de faire réémettre un billet déjà transmis par l'hôte à un tiers, y compris en cas de perte, de vol, de transmission par erreur ou de litige entre l'hôte et les participants. L'hôte reconnaît et accepte ce risque au moment de l'achat sur place et demeure seul responsable de la diffusion de ces billets.`,
    },
    {
      n: '10',
      title: 'Reversements aux vendeurs',
      body: `Dans le parcours billetterie Bénin, la part vendeur est répartie dès le paiement par FedaPay Marketplace : ${LEGAL.brand} ne conserve pas l'argent de l'organisateur jusqu'à la fin de l'événement. L'organisateur reste donc responsable de conserver une trésorerie suffisante pour financer les remboursements dus en cas d'annulation, de report ou d'option d'annulation valable. Pour les autres services ou zones, les reversements suivent le rail de paiement applicable. Le vendeur est responsable de l'exactitude de ses coordonnées de paiement et de ses obligations fiscales et déclaratives.`,
    },
    {
      n: '11',
      title: 'Comportement et contenus',
      body: `L'utilisateur s'interdit de publier des contenus illicites, trompeurs, diffamatoires, haineux ou portant atteinte aux droits de tiers, ainsi que d'utiliser la plateforme à des fins frauduleuses ou de contourner les mécanismes de paiement et de commission. ${LEGAL.brand} peut retirer tout contenu et suspendre tout compte en cas de manquement.`,
    },
    {
      n: '12',
      title: 'Propriété intellectuelle',
      body: `L'ensemble des éléments de la plateforme (marque ${LEGAL.brand}, logos, textes, visuels, code source) est protégé par le droit de la propriété intellectuelle. Toute reproduction ou utilisation sans autorisation écrite préalable est interdite. Les contenus publiés par les utilisateurs restent leur propriété, ${LEGAL.brand} bénéficiant d'une licence d'utilisation aux seules fins d'exploitation de la plateforme.`,
    },
    {
      n: '13',
      title: 'Responsabilité',
      body: `${LEGAL.brand} fournit la plateforme « en l'état » et met en œuvre les moyens raisonnables pour en assurer la disponibilité et la sécurité, sans garantie d'absence totale d'interruption ou d'erreur. En sa qualité d'intermédiaire, ${LEGAL.brand} ne saurait être tenu responsable de l'inexécution ou de la mauvaise exécution des prestations vendues par les organisateurs et prestataires, ni des informations qu'ils publient.`,
    },
    {
      n: '14',
      title: 'Données personnelles',
      body: `Le traitement des données personnelles est décrit dans la Politique de confidentialité accessible depuis le pied de page, conforme au RGPD. L'utilisateur y dispose notamment de droits d'accès, de rectification et de suppression.`,
    },
    {
      n: '15',
      title: 'Modification des conditions',
      body: `${LEGAL.brand} peut modifier les présentes CGU/CGV à tout moment, notamment pour refléter une évolution légale ou de ses services (dont les taux de frais et commissions). Les utilisateurs sont informés des modifications par notification dans l'application. La poursuite de l'utilisation vaut acceptation des nouvelles conditions.`,
    },
    {
      n: '16',
      title: 'Droit applicable, médiation et litiges',
      body: `Les présentes sont régies par le droit français. Conformément aux articles L.611-1 et suivants du Code de la consommation, le consommateur peut recourir gratuitement à un médiateur de la consommation. La plateforme européenne de règlement en ligne des litiges est accessible à : https://ec.europa.eu/consumers/odr. À défaut de résolution amiable, les tribunaux français sont compétents.`,
    },
    {
      n: '17',
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
