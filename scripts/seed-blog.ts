// Seed des 5 articles de lancement du blog LIVEINBLACK. Idempotent (upsert
// par slug, `npm run seed:blog` peut être relancé sans dupliquer). Pattern
// calqué sur scripts/seed-dev.ts : connexion via lib/db/mongoose.ts,
// MONGODB_URI chargé par le flag Node --env-file (voir le script npm), pas en
// code ici (imports ES modules hoistés — capturerait MONGODB_URI à undefined).
import { getDb } from '../lib/db/mongoose'
import BlogPost from '../lib/models/BlogPost'

function readingTime(html: string): number {
  const words = html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length
  return Math.max(2, Math.round(words / 200))
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
}

interface SeedPost {
  slug: string
  title: string
  excerpt: string
  content: string
  coverImageUrl: string
  category: string
  tags: string[]
  authorName: string
  metaTitle: string
  metaDescription: string
  publishedAt: Date
}

const posts: SeedPost[] = [
  {
    slug: 'meilleurs-evenements-nuit-lome-2026',
    title: 'Les meilleurs événements de nuit à Lomé en 2026',
    excerpt: "Rooftop, clubs, soirées afrobeat en plein air : voici où sortir à Lomé cette année, et comment ne jamais rater le bon événement.",
    coverImageUrl: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=80',
    category: 'togo',
    tags: ['Lomé', 'Togo', 'sorties', 'afrobeat'],
    authorName: 'La rédaction LIVEINBLACK',
    metaTitle: 'Meilleures soirées et événements à Lomé en 2026 | LIVEINBLACK',
    metaDescription: "Panorama des lieux et types de soirées qui font vibrer Lomé en 2026 : rooftops, clubs, plein air, et conseils pour réserver sa place à temps.",
    publishedAt: daysAgo(21),
    content: `
<p>Lomé n'a jamais autant bougé la nuit. Entre les rooftops du quartier des ambassades, les clubs historiques du centre-ville et les soirées en plein air qui fleurissent à chaque saison sèche, la capitale togolaise est devenue l'une des scènes nightlife les plus dynamiques d'Afrique de l'Ouest. Voici un tour d'horizon de ce qui fait vibrer la ville en 2026, et quelques conseils pratiques pour ne rien manquer.</p>

<h2>Les rooftops, nouvelle valeur sûre</h2>
<p>Depuis deux ou trois ans, les rooftops se sont imposés comme le format préféré des jeunes actifs lomékains. Vue sur la lagune ou sur les toits du centre, cocktails soignés et programmation DJ pointue : ces lieux misent sur une ambiance plus feutrée en début de soirée avant de monter progressivement en intensité. Ils sont particulièrement prisés pour les after-works du vendredi qui se prolongent souvent bien après minuit.</p>

<h2>Les clubs, toujours au cœur de l'action</h2>
<p>Impossible de parler de nuit lomékaine sans évoquer les clubs emblématiques de la ville, où l'afrobeat, l'amapiano et le coupé-décalé se mélangent sur les mêmes pistes. Le samedi reste la soirée reine, avec des line-up qui alternent DJ résidents et artistes invités venus du Ghana, du Nigeria ou de Côte d'Ivoire. Les soirées à thème (all-white, années 2000, spéciales indépendance) rythment le calendrier et attirent souvent un public plus large que les soirées classiques.</p>

<h2>Les événements en plein air, l'expérience qui monte</h2>
<p>La saison sèche est propice aux grands rassemblements en extérieur : plages aménagées, jardins privés, esplanades. Ces événements demandent une organisation plus lourde (sonorisation, sécurité, restauration) mais offrent une expérience que les salles fermées ne peuvent pas égaler. Beaucoup d'organisateurs togolais y voient aujourd'hui le format le plus porteur pour les grosses soirées annuelles.</p>

<h2>Comment ne rien rater</h2>
<p>Avec autant d'options, le vrai défi n'est plus de trouver une soirée, mais de savoir laquelle correspond à ses envies et, surtout, d'avoir sa place avant que les meilleures catégories de billets ne partent. C'est exactement pour ça que la billetterie en ligne de LIVEINBLACK existe : chaque organisateur y publie ses événements avec les tarifs, les places disponibles en temps réel et parfois des offres VIP ou des tables réservées. Plus besoin de compter sur le bouche-à-oreille ou de faire la queue à l'entrée en espérant qu'il reste des places.</p>

<p>Si tu es plutôt du genre à préparer ta soirée à l'avance, pense aussi à suivre directement les organisateurs qui publient régulièrement sur la plateforme : tu seras averti dès qu'un nouvel événement est mis en ligne, souvent plusieurs semaines avant la date, quand les meilleurs tarifs sont encore disponibles.</p>

<h2>En résumé</h2>
<p>Lomé en 2026, c'est une scène nightlife à trois vitesses : des rooftops pour commencer la soirée en douceur, des clubs pour la faire vivre jusqu'au bout de la nuit, et des événements en plein air pour les grands rendez-vous. Quel que soit ton style, l'essentiel est de t'y prendre tôt pour sécuriser ta place aux meilleures conditions.</p>
`,
  },
  {
    slug: 'guide-organiser-soiree-reussie-togo',
    title: 'Guide : comment organiser une soirée réussie au Togo',
    excerpt: "Budget, lieu, sécurité, billetterie : les étapes concrètes pour monter un événement nightlife qui marche, du premier brief au jour J.",
    coverImageUrl: 'https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?auto=format&fit=crop&w=1200&q=80',
    category: 'guide',
    tags: ['organisation', 'événementiel', 'Togo', 'billetterie'],
    authorName: 'La rédaction LIVEINBLACK',
    metaTitle: 'Organiser une soirée réussie au Togo : le guide complet | LIVEINBLACK',
    metaDescription: "Les étapes essentielles pour organiser un événement nightlife au Togo : budget, lieu, prestataires, sécurité et billetterie en ligne.",
    publishedAt: daysAgo(18),
    content: `
<p>Organiser une soirée qui marque les esprits ne relève pas de la chance : c'est avant tout une question de méthode. Que tu prépares ton premier événement ou que tu cherches à professionnaliser ta façon de faire, voici les étapes clés pour partir sur de bonnes bases.</p>

<h2>1. Définir un concept clair avant tout le reste</h2>
<p>Avant de penser au lieu ou au budget, il faut savoir précisément quel type de soirée tu veux proposer et à qui elle s'adresse. Une soirée afrobeat grand public n'a ni le même budget, ni le même lieu, ni la même communication qu'une soirée house plus confidentielle. Ce choix conditionne toutes les décisions qui suivent.</p>

<h2>2. Construire un budget réaliste</h2>
<p>Le budget d'une soirée se répartit généralement entre la location du lieu, la sonorisation et l'éclairage, le cachet des artistes ou DJ, la sécurité, la communication et une marge de sécurité pour les imprévus (souvent sous-estimée par les débutants). Une règle simple : ne jamais engager de dépenses fixes importantes tant que la billetterie n'a pas confirmé un minimum de ventes.</p>

<h2>3. Choisir le bon lieu et sécuriser les autorisations</h2>
<p>Au Togo comme ailleurs, un lieu adapté au nombre d'invités attendus, à l'accessibilité (parking, transport) et aux nuisances sonores évite bien des complications le jour J. Les autorisations administratives et l'accord écrit du propriétaire des lieux sont à obtenir en amont, jamais à la dernière minute.</p>

<h2>4. S'entourer des bons prestataires</h2>
<p>DJ, traiteur, sécurité, photographe : la qualité de ces prestataires fait souvent la différence entre une bonne soirée et une soirée mémorable. C'est là que l'annuaire de prestataires de LIVEINBLACK devient utile : tu peux comparer plusieurs profils, voir leurs réalisations précédentes et échanger directement avec eux via la messagerie de la plateforme, sans passer par des intermédiaires.</p>

<h2>5. Mettre en place une billetterie en ligne dès le départ</h2>
<p>Vendre ses places uniquement en cash ou via des réservations WhatsApp devient vite ingérable dès que l'événement grandit : suivi des stocks approximatif, risque de fraude, aucune visibilité sur les ventes en temps réel. En créant ton événement sur LIVEINBLACK, tu gères tes catégories de billets (standard, VIP, tables groupe), tu suis les ventes en direct et tes invités reçoivent un billet numérique infalsifiable, scanné à l'entrée. Le paiement mobile money est directement intégré, ce qui colle aux habitudes de paiement locales.</p>

<h2>6. Communiquer en continu, pas seulement la dernière semaine</h2>
<p>Les soirées qui affichent complet sont rarement celles qui communiquent seulement dans les 48 heures précédentes. Publier l'événement tôt, mettre en avant des tarifs préférentiels de lancement et relancer régulièrement sur les réseaux crée un effet d'entraînement bien plus efficace qu'une annonce unique de dernière minute.</p>

<h2>7. Le jour J : anticiper plutôt que gérer dans l'urgence</h2>
<p>Une bonne organisation le jour même repose sur des rôles clairement répartis (accueil, scan des billets, sécurité, régie technique) et un plan B pour les imprévus les plus fréquents : retard d'un prestataire, météo, affluence plus forte que prévu. Le scan des billets à l'entrée, en particulier, doit être fluide pour éviter les files d'attente qui gâchent la première impression de la soirée.</p>

<p>Avec une préparation méthodique et les bons outils, la marge entre une soirée moyenne et une soirée dont on parle encore des semaines après se réduit considérablement.</p>
`,
  },
  {
    slug: 'top-styles-musicaux-afrique-ouest',
    title: 'Top des styles musicaux qui cartonnent en Afrique de l’Ouest (Afrobeat, Amapiano, Coupé-décalé)',
    excerpt: "Afrobeat, amapiano, coupé-décalé : panorama des styles qui dominent les pistes de danse ouest-africaines et comment ils transforment les soirées.",
    coverImageUrl: 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?auto=format&fit=crop&w=1200&q=80',
    category: 'actualite',
    tags: ['musique', 'afrobeat', 'amapiano', 'coupé-décalé'],
    authorName: 'La rédaction LIVEINBLACK',
    metaTitle: 'Afrobeat, Amapiano, Coupé-décalé : les styles qui dominent les soirées | LIVEINBLACK',
    metaDescription: "Découvre les styles musicaux qui font danser l'Afrique de l'Ouest aujourd'hui et comment ils influencent la programmation des soirées.",
    publishedAt: daysAgo(14),
    content: `
<p>La scène nightlife ouest-africaine vit une période particulièrement riche musicalement. Trois styles se partagent aujourd'hui la majorité des pistes de danse, chacun avec son ambiance propre. Voici un état des lieux pour comprendre ce qui fait vibrer les soirées en ce moment.</p>

<h2>L'afrobeat, toujours dominant</h2>
<p>Porté par des artistes nigérians devenus des références mondiales, l'afrobeat reste le socle de la majorité des soirées de la région. Rythmes chaloupés, basses profondes et refrains immédiatement mémorisables : c'est le style qui fait le lien entre les générations sur une piste de danse. Les DJ résidents l'utilisent souvent comme fil conducteur de la soirée, entre les temps forts amapiano et coupé-décalé.</p>

<h2>L'amapiano, la vague qui ne faiblit pas</h2>
<p>Venu d'Afrique du Sud, l'amapiano s'est imposé en quelques années comme l'un des styles les plus demandés dans les clubs ouest-africains. Ses lignes de basse profondes, ses percussions log drum reconnaissables entre mille et son tempo légèrement plus lent que l'afrobeat créent une ambiance particulière, souvent réservée à un moment précis de la soirée où l'énergie change de registre. De nombreux DJ locaux se sont spécialisés dans ce style, au point d'en faire leur signature.</p>

<h2>Le coupé-décalé, l'identité ivoirienne qui rayonne</h2>
<p>Né en Côte d'Ivoire au début des années 2000, le coupé-décalé garde une place à part dans les soirées francophones. Son énergie festive, ses codes de danse reconnaissables et ses refrains scandés en font un style qui déclenche systématiquement une réaction du public, souvent utilisé par les DJ pour relancer une piste qui commence à se vider.</p>

<h2>Ce que ça change pour les organisateurs</h2>
<p>Cette diversité musicale a une conséquence directe sur la façon dont les soirées sont programmées : de plus en plus d'organisateurs annoncent désormais clairement le style dominant de leur événement (soirée afrobeat, soirée amapiano, soirée coupé-décalé) plutôt qu'une programmation généraliste. Cette précision aide les visiteurs à choisir l'événement qui correspond exactement à leurs goûts, et c'est une information qu'on retrouve systématiquement dans les descriptions d'événements publiées par les organisateurs sur LIVEINBLACK.</p>

<p>Pour les DJ eux-mêmes, cette spécialisation devient aussi un vrai argument de visibilité : sur l'annuaire des prestataires, beaucoup indiquent désormais leurs styles de prédilection, ce qui permet aux organisateurs de composer un line-up cohérent avec l'identité musicale recherchée pour leur soirée.</p>

<h2>Et demain ?</h2>
<p>D'autres influences continuent d'émerger, notamment en provenance d'Afrique centrale et d'Afrique de l'Est, mais afrobeat, amapiano et coupé-décalé restent, pour l'instant, le trio qui structure la grande majorité des soirées de la région. Une chose est sûre : la scène ouest-africaine continue d'exporter sa musique bien au-delà de ses frontières.</p>
`,
  },
  {
    slug: 'devenir-prestataire-liveinblack',
    title: 'Comment devenir prestataire événementiel sur LIVEINBLACK',
    excerpt: "DJ, traiteur, lieu de réception, sécurité : le parcours complet pour créer ton profil prestataire, publier ton catalogue et être contacté par des organisateurs.",
    coverImageUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=80',
    category: 'guide',
    tags: ['prestataire', 'inscription', 'annuaire', 'DJ'],
    authorName: 'La rédaction LIVEINBLACK',
    metaTitle: 'Devenir prestataire événementiel sur LIVEINBLACK : mode d’emploi',
    metaDescription: "Le parcours pour créer ton profil prestataire sur LIVEINBLACK : candidature, validation, catalogue et mise en relation avec les organisateurs.",
    publishedAt: daysAgo(9),
    content: `
<p>Que tu sois DJ, traiteur, propriétaire d'une salle de réception, technicien son et lumière ou agent de sécurité événementiel, la marketplace LIVEINBLACK te permet de te faire connaître directement auprès des organisateurs qui recherchent des prestataires fiables. Voici comment ça fonctionne, étape par étape.</p>

<h2>1. Déposer sa candidature</h2>
<p>Tout commence par un formulaire de candidature accessible depuis la page « Devenir prestataire » du site. On te demande les informations de base : ton activité, ta zone d'intervention, une description de ton offre et, selon ton secteur, quelques justificatifs. Cette étape permet à l'équipe LIVEINBLACK de vérifier le sérieux de chaque profil avant sa mise en ligne, dans l'intérêt de tous les prestataires déjà présents sur la plateforme.</p>

<h2>2. La validation du dossier</h2>
<p>Une fois la candidature soumise, elle est étudiée par l'équipe de modération. Ce délai de vérification, généralement court, garantit que l'annuaire public reste composé de prestataires réels et actifs, ce qui profite directement à ta crédibilité une fois ton profil publié : les organisateurs savent qu'ils s'adressent à des professionnels vérifiés.</p>

<h2>3. Construire un profil qui donne envie de te contacter</h2>
<p>Une fois validé, ton profil public devient ta vitrine. Photo de profil, description claire de ton activité, zones d'intervention, et surtout des visuels de qualité de tes précédentes prestations : c'est souvent ce qui fait la différence au moment où un organisateur compare plusieurs profils. Un catalogue précis (types de prestations, tarifs indicatifs) évite aussi les allers-retours inutiles avant qu'une discussion sérieuse ne démarre.</p>

<h2>4. Être trouvé et contacté</h2>
<p>Ton profil apparaît dans l'annuaire public des prestataires, filtrable par catégorie et par région, ce qui te rend visible auprès d'organisateurs qui ne te connaissaient pas forcément. Quand un organisateur s'intéresse à ton profil, il peut t'écrire directement via la messagerie intégrée à la plateforme, sans passer par des numéros personnels échangés au hasard des recommandations.</p>

<h2>5. Faire grandir sa réputation</h2>
<p>Après chaque prestation, les organisateurs peuvent laisser un avis sur ton profil. Ces avis, cumulés au fil du temps, deviennent un vrai levier de confiance pour les futurs clients qui hésitent entre plusieurs prestataires de la même catégorie. Un profil actif, réactif dans ses réponses et régulièrement mis à jour a naturellement plus de chances d'être sollicité.</p>

<h2>En résumé</h2>
<p>Créer un profil prestataire sur LIVEINBLACK, c'est se donner un accès direct à un vivier d'organisateurs qui cherchent activement des partenaires fiables pour leurs événements, sans dépendre uniquement du bouche-à-oreille. La qualité du profil et la rapidité de réponse aux messages restent, comme dans tout secteur de service, les meilleurs leviers pour transformer les contacts en contrats.</p>
`,
  },
  {
    slug: 'conseils-choisir-dj-evenement',
    title: '5 conseils pour bien choisir son DJ pour un événement',
    excerpt: "Style musical, expérience du public, matériel, tarifs : les critères concrets pour sélectionner le DJ qui fera vraiment vivre ta soirée.",
    // Id remplacé — l'original (1571266028243-e4bb35fd2ca6) est un 404 Unsplash
    // (vérifié en navigateur), repris ici du set vetted de lib/shared/placeholderImage.ts.
    coverImageUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1200&q=80',
    category: 'guide',
    tags: ['DJ', 'prestataire', 'conseils', 'organisation'],
    authorName: 'La rédaction LIVEINBLACK',
    metaTitle: 'Comment bien choisir son DJ pour un événement : 5 conseils pratiques',
    metaDescription: "Les critères essentiels pour choisir le bon DJ pour ta soirée : style, expérience, matériel, avis clients et négociation du tarif.",
    publishedAt: daysAgo(4),
    content: `
<p>Le DJ est souvent l'élément qui fait ou défait l'ambiance d'une soirée. Pourtant, beaucoup d'organisateurs le choisissent encore un peu au hasard, sur une simple recommandation. Voici cinq critères concrets pour faire un choix éclairé.</p>

<h2>1. Vérifier que son style correspond vraiment à ta soirée</h2>
<p>Un excellent DJ afrobeat n'est pas forcément le bon choix pour une soirée amapiano ou un mariage plus classique. Avant tout contact, écoute plusieurs sets récents du DJ (souvent disponibles sur ses réseaux) pour t'assurer que son univers musical colle réellement à l'ambiance que tu recherches, plutôt que de te fier uniquement à sa réputation générale.</p>

<h2>2. Regarder son expérience avec le type de public visé</h2>
<p>Un DJ habitué aux clubs n'a pas forcément les mêmes réflexes qu'un DJ habitué aux événements privés ou aux mariages, où la lecture du public et l'adaptation en temps réel comptent différemment. Demande-lui explicitement s'il a déjà animé des événements similaires au tien en taille et en style de public.</p>

<h2>3. S'assurer de la qualité et de la compatibilité du matériel</h2>
<p>Certains DJ viennent avec leur propre matériel (platines, console, parfois sonorisation), d'autres s'attendent à utiliser celui déjà présent sur place. Clarifier ce point en amont évite les mauvaises surprises le jour J : matériel incompatible, câbles manquants, ou sonorisation insuffisante pour la taille du lieu.</p>

<h2>4. Consulter les avis d'organisateurs précédents</h2>
<p>Les retours d'autres organisateurs sont souvent plus fiables qu'une simple présentation commerciale. Sur l'annuaire des prestataires de LIVEINBLACK, chaque profil DJ affiche les avis laissés par les organisateurs qui ont déjà travaillé avec lui, ce qui donne une idée concrète de son professionnalisme, de sa ponctualité et de sa capacité à faire danser une salle.</p>

<h2>5. Clarifier le tarif et ce qu'il inclut réellement</h2>
<p>Le tarif d'un DJ peut couvrir des prestations très différentes selon les cas : durée du set, déplacement, matériel inclus ou non, possibilité de prolongation. Avant de t'engager, fais préciser noir sur blanc ce que couvre exactement le montant annoncé, pour éviter les frais additionnels de dernière minute.</p>

<h2>Le bon réflexe : centraliser la recherche et les échanges</h2>
<p>Plutôt que de multiplier les contacts épars sur les réseaux sociaux, comparer plusieurs profils DJ au même endroit permet de gagner un temps précieux. C'est exactement ce que propose l'annuaire de prestataires LIVEINBLACK : filtrer par catégorie et par région, consulter le catalogue de chaque DJ, ses avis, et échanger directement via la messagerie intégrée pour poser toutes tes questions avant de te décider.</p>

<p>Un bon DJ ne se choisit jamais uniquement sur sa réputation ou son prix : c'est la combinaison du style, de l'expérience, du matériel et des retours d'autres organisateurs qui garantit une soirée réussie.</p>
`,
  },
]

async function main() {
  await getDb()

  let created = 0
  let updated = 0

  for (const post of posts) {
    const readingTimeMinutes = readingTime(post.content)
    const existed = (await BlogPost.exists({ slug: post.slug })) != null
    await BlogPost.findOneAndUpdate(
      { slug: post.slug },
      {
        $set: {
          title: post.title,
          excerpt: post.excerpt,
          content: post.content.trim(),
          coverImageUrl: post.coverImageUrl,
          category: post.category,
          tags: post.tags,
          authorName: post.authorName,
          metaTitle: post.metaTitle,
          metaDescription: post.metaDescription,
          publishedAt: post.publishedAt,
          readingTimeMinutes,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    )
    if (existed) updated += 1
    else created += 1
  }

  const total = await BlogPost.countDocuments({})
  console.log(`Seed blog OK — ${created} article(s) créé(s), ${updated} mis à jour, ${total} au total en base.`)
  console.log('Slugs:', posts.map((p) => p.slug).join(', '))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
