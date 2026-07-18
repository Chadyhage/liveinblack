// src/pages/MentionsLegalesPage.jsx
// Obligatoires en France : LCEN art. 6.III + Code de la consommation L221-1 et suivants
import LegalPageLayout from '../components/LegalPageLayout'
import { LEGAL, LEGAL_DISPLAY } from '../data/legal'

export default function MentionsLegalesPage() {
  const sections = [
    {
      n: '01',
      title: "Éditeur du site",
      body: `${LEGAL_DISPLAY.companyDisplay}
${LEGAL.legalForm ? `Forme juridique : ${LEGAL.legalForm}` : 'Forme juridique : en cours de constitution'}
${LEGAL.capital ? `Capital social : ${LEGAL.capital}` : ''}
${LEGAL_DISPLAY.sirenDisplay !== "SIREN en cours d'attribution" ? `SIREN : ${LEGAL.siren}` : 'Numéro SIREN : en cours d\'attribution'}
${LEGAL.rcs || ''}
${LEGAL.vatNumber ? `N° TVA intracommunautaire : ${LEGAL.vatNumber}` : ''}

Adresse : ${LEGAL_DISPLAY.addressDisplay}

${LEGAL.director.role} : ${LEGAL.director.name}
Directeur de la publication : ${LEGAL.director.name}`.replace(/\n\n+/g, '\n\n').trim(),
    },
    {
      n: '02',
      title: "Coordonnées",
      body: null,
      list: [
        { label: 'Email', value: LEGAL.contactEmail },
        { label: 'Site web', value: LEGAL.url },
        ...(LEGAL.phone ? [{ label: 'Téléphone', value: LEGAL.phone }] : []),
      ],
    },
    {
      n: '03',
      title: "Hébergeur",
      body: `${LEGAL.host.name}
${LEGAL.host.address}
${LEGAL.host.website}`,
    },
    {
      n: '04',
      title: "Propriété intellectuelle",
      body: `L'ensemble des éléments composant le site ${LEGAL.domain} (textes, graphismes, logos, icônes, images, vidéos, photographies, marques, code source) est la propriété exclusive de ${LEGAL.brand} ou de ses partenaires, et est protégé par le droit d'auteur, le droit des marques et le droit des bases de données.

Toute reproduction, représentation, modification, publication ou adaptation, totale ou partielle, sans autorisation écrite préalable est interdite et constituerait une contrefaçon sanctionnée par les articles L.335-2 et suivants du Code de la propriété intellectuelle.`,
    },
    {
      n: '05',
      title: "Conditions d'utilisation",
      body: `L'utilisation du site implique l'acceptation pleine et entière des Conditions Générales d'Utilisation accessibles depuis le pied de page. Ces conditions sont susceptibles d'être modifiées à tout moment.

L'éditeur se réserve le droit de modifier sans préavis le contenu du site, ainsi que d'en suspendre temporairement ou définitivement l'accès.`,
    },
    {
      n: '06',
      title: "Données personnelles",
      body: `Conformément au Règlement (UE) 2016/679 (RGPD) et à la loi Informatique et Libertés modifiée, vous disposez d'un droit d'accès, de rectification, de suppression, de portabilité, d'opposition et de limitation concernant vos données personnelles.

Pour en savoir plus, consultez notre Politique de confidentialité.

Pour exercer vos droits : ${LEGAL.contactEmail}`,
    },
    {
      n: '07',
      title: "Médiateur de la consommation",
      body: `Conformément aux articles L.611-1 et suivants du Code de la consommation, l'utilisateur peut recourir gratuitement à un médiateur de la consommation pour le règlement amiable d'un litige avec ${LEGAL.brand}.

Plateforme de règlement en ligne des litiges (Commission européenne) :
https://ec.europa.eu/consumers/odr`,
    },
    {
      n: '08',
      title: "Droit applicable",
      body: "Les présentes mentions légales sont régies par le droit français. Tout litige relatif à leur interprétation ou à leur exécution relèvera de la compétence exclusive des tribunaux français.",
    },
  ]

  return (
    <LegalPageLayout
      title="Mentions légales"
      lastUpdate={LEGAL.lastUpdate}
      sections={sections}
      footerNotice="Document à valeur informative — la version définitive sera validée par un juriste avant le lancement commercial."
    />
  )
}
