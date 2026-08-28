export type BeninCampaignPost = {
  slug: string
  title: string
  excerpt: string
  content: string
  coverImageUrl: string
  category: 'benin' | 'guide'
  tags: string[]
  authorName: string
  metaTitle: string
  metaDescription: string
  publishedAt: Date
  readingTimeMinutes: number
}

type City = { name: string; slug: string; department: string; identity: string; practical: string }
type Topic = { slug: string; title: (city: string) => string; keyword: (city: string) => string; promise: string; angle: string; steps: string[] }

const cities: City[] = [
  { name: 'Cotonou', slug: 'cotonou', department: 'Littoral', identity: 'capitale économique, entre quartiers animés, plages et grands axes', practical: 'anticiper les déplacements aux heures de pointe et vérifier les possibilités de stationnement' },
  { name: 'Porto-Novo', slug: 'porto-novo', department: 'Ouémé', identity: 'ville patrimoniale où les lieux culturels et les espaces de réception composent une scène singulière', practical: 'préciser le quartier et partager un repère facile à reconnaître avec les invités' },
  { name: 'Abomey-Calavi', slug: 'abomey-calavi', department: 'Atlantique', identity: 'territoire étudiant et résidentiel en pleine croissance, relié à Cotonou', practical: 'tenir compte du trafic sur l’axe Cotonou-Calavi et proposer un horaire d’arrivée réaliste' },
  { name: 'Ouidah', slug: 'ouidah', department: 'Atlantique', identity: 'destination historique et balnéaire adaptée aux expériences culturelles et aux événements en plein air', practical: 'prévoir une solution météo et organiser le retour des participants venant de Cotonou' },
  { name: 'Parakou', slug: 'parakou', department: 'Borgou', identity: 'grand carrefour du Nord avec un public jeune, familial et professionnel', practical: 'communiquer tôt auprès des communautés locales et confirmer la disponibilité du matériel technique' },
  { name: 'Bohicon', slug: 'bohicon', department: 'Zou', identity: 'ville-carrefour au cœur du pays, pratique pour réunir des publics venant de plusieurs communes', practical: 'indiquer clairement les accès routiers et coordonner les arrivées de groupes' },
  { name: 'Abomey', slug: 'abomey', department: 'Zou', identity: 'cité royale au patrimoine fort, propice aux rendez-vous culturels et cérémoniels', practical: 'respecter le contexte du lieu et vérifier les autorisations nécessaires pour le son et l’occupation' },
  { name: 'Natitingou', slug: 'natitingou', department: 'Atacora', identity: 'porte d’entrée de l’Atacora, appréciée pour ses paysages et son identité culturelle', practical: 'anticiper la saison, les distances et l’hébergement des intervenants extérieurs' },
  { name: 'Grand-Popo', slug: 'grand-popo', department: 'Mono', identity: 'destination côtière idéale pour les week-ends, festivals et célébrations face à l’océan', practical: 'sécuriser les installations extérieures et prévoir transport, hébergement et solution météo' },
  { name: 'Djougou', slug: 'djougou', department: 'Donga', identity: 'carrefour commercial et culturel du Nord-Ouest, capable de rassembler un large bassin de public', practical: 'adapter la communication aux habitudes locales et confirmer les solutions techniques disponibles sur place' },
]

const topics: Topic[] = [
  { slug: 'sortir-week-end', title: (city) => `Où sortir ce week-end à ${city} : le guide pratique`, keyword: (city) => `sortir à ${city}`, promise: 'repérer les bons événements, comparer les ambiances et réserver sans stress', angle: 'Une sortie réussie commence par un choix adapté au groupe, au budget et au temps disponible.', steps: ['Définir l’ambiance recherchée', 'Comparer date, lieu et tarif', 'Réserver avant les dernières places', 'Préparer le trajet et le retour'] },
  { slug: 'organiser-soiree', title: (city) => `Organiser une soirée réussie à ${city} : méthode complète`, keyword: (city) => `organiser une soirée à ${city}`, promise: 'transformer une idée en événement maîtrisé, rentable et mémorable', angle: 'Le concept, le budget et l’expérience d’entrée doivent être pensés ensemble dès le départ.', steps: ['Écrire un concept clair', 'Construire un budget prudent', 'Choisir un lieu cohérent', 'Piloter les ventes et le jour J'] },
  { slug: 'choisir-dj', title: (city) => `Comment choisir un DJ à ${city} pour son événement`, keyword: (city) => `DJ événement ${city}`, promise: 'évaluer le style, l’expérience, le matériel et les conditions du prestataire', angle: 'Le meilleur DJ n’est pas le plus connu, mais celui qui comprend le public et le déroulé attendu.', steps: ['Écouter plusieurs prestations récentes', 'Vérifier l’expérience du public visé', 'Clarifier le matériel inclus', 'Formaliser horaires et tarif'] },
  { slug: 'choisir-lieu', title: (city) => `Choisir un lieu événementiel à ${city} : 8 critères`, keyword: (city) => `lieu événementiel ${city}`, promise: 'comparer capacité, accès, sécurité et contraintes techniques avant de signer', angle: 'Un lieu séduisant en photo peut devenir coûteux s’il impose trop de matériel ou complique l’accès.', steps: ['Fixer la capacité réaliste', 'Tester les accès', 'Auditer son, énergie et sécurité', 'Confirmer les conditions par écrit'] },
  { slug: 'mariage', title: (city) => `Organiser un mariage à ${city} : budget et prestataires`, keyword: (city) => `mariage à ${city}`, promise: 'coordonner réception, musique, décoration et invités avec un calendrier fiable', angle: 'Le confort des invités et la coordination des prestataires comptent davantage que l’accumulation d’options.', steps: ['Prioriser les postes essentiels', 'Réserver les prestataires structurants', 'Prévoir un conducteur détaillé', 'Désigner un responsable le jour J'] },
  { slug: 'concert', title: (city) => `Produire un concert à ${city} : checklist de l’organisateur`, keyword: (city) => `concert à ${city}`, promise: 'sécuriser la technique, les artistes, la billetterie et l’accueil du public', angle: 'Un concert associe une promesse artistique et une mécanique opérationnelle qui ne tolère pas l’improvisation.', steps: ['Valider la fiche technique', 'Contractualiser les artistes', 'Dimensionner sécurité et accueil', 'Suivre les ventes quotidiennement'] },
  { slug: 'evenement-entreprise', title: (city) => `Réussir un événement d’entreprise à ${city}`, keyword: (city) => `événement entreprise ${city}`, promise: 'concevoir un rendez-vous utile, fluide et cohérent avec l’image de l’organisation', angle: 'Chaque choix doit servir un objectif précis : informer, remercier, lancer ou renforcer une équipe.', steps: ['Formuler un objectif mesurable', 'Choisir le format adapté', 'Soigner accueil et ponctualité', 'Mesurer les retours'] },
  { slug: 'anniversaire', title: (city) => `Préparer un anniversaire mémorable à ${city}`, keyword: (city) => `anniversaire à ${city}`, promise: 'maîtriser invités, ambiance, restauration et animations sans dépasser le budget', angle: 'Une célébration personnelle réussie repose sur quelques temps forts bien exécutés.', steps: ['Définir le nombre d’invités', 'Choisir un thème simple', 'Répartir le budget', 'Prévoir musique et surprises'] },
  { slug: 'securite', title: (city) => `Sécurité événementielle à ${city} : guide essentiel`, keyword: (city) => `sécurité événementielle ${city}`, promise: 'réduire les risques liés à l’affluence, aux accès, à la météo et aux incidents', angle: 'La sécurité se prépare avec des responsabilités claires, des contrôles proportionnés et un plan de réaction.', steps: ['Évaluer les risques du site', 'Dimensionner l’équipe', 'Séparer entrées et sorties', 'Préparer les procédures d’urgence'] },
  { slug: 'billetterie', title: (city) => `Billetterie en ligne à ${city} : vendre plus efficacement`, keyword: (city) => `billetterie en ligne ${city}`, promise: 'structurer les tarifs, suivre les ventes et accélérer l’entrée grâce aux billets numériques', angle: 'La billetterie devient un tableau de bord commercial, pas seulement un moyen d’encaisser.', steps: ['Créer des catégories lisibles', 'Lancer un tarif anticipé', 'Suivre les conversions', 'Scanner les billets à l’entrée'] },
]

function words(html: string) { return html.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length }
function compact(value: string, max: number) { return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…` }

function content(city: City, topic: Topic) {
  const sections = topic.steps.map((step, index) => `<h2>${index + 1}. ${step}</h2><p>À ${city.name}, cette étape doit tenir compte du contexte local : ${city.identity}. Commence par noter les besoins indispensables, les personnes responsables et l’échéance de validation. Demande des offres comparables, vérifie ce qui est réellement inclus et conserve une marge pour les imprévus. Cette discipline évite les décisions tardives qui augmentent les coûts et fragilisent l’expérience du public.</p>`).join('\n')
  return `<p>Tu recherches comment ${topic.keyword(city.name).toLowerCase()} ? Ce guide LIVEINBLACK propose une méthode concrète pour ${topic.promise}. ${city.name}, dans le département du ${city.department}, possède ses propres rythmes et contraintes. ${topic.angle}</p>
<h2>Comprendre le contexte de ${city.name}</h2><p>${city.name} est une ${city.identity}. Avant toute réservation, observe les habitudes du public, les distances réelles et les horaires auxquels les invités peuvent se déplacer. Il est notamment utile de ${city.practical}. Un choix réaliste et bien communiqué réduit les retards, les annulations et les dépenses imprévues.</p>
${sections}
<h2>Budget : protéger l’essentiel</h2><p>Classe les dépenses en trois groupes : indispensables, améliorations et options. Le lieu, la sécurité, la technique et l’accueil doivent rester prioritaires. Demande toujours un devis détaillé, une date limite de confirmation et les conditions d’annulation. Pour les événements payants, établis plusieurs scénarios de fréquentation afin de connaître le seuil minimum de ventes avant d’engager les dépenses secondaires.</p>
<h2>Communication locale et réservation</h2><p>Une annonce efficace précise immédiatement la date, l’adresse, l’horaire, le prix et la promesse de l’événement. Répète ces informations sur chaque support et dirige le public vers une page unique. Sur LIVEINBLACK, les participants peuvent découvrir les événements, réserver un billet numérique et retrouver les informations pratiques sans dépendre de messages dispersés.</p>
<h2>La checklist finale</h2><p>À J-7, confirme tous les prestataires, teste les équipements, partage le conducteur et vérifie la liste des contacts. À J-1, contrôle le site, les accès, la signalétique et les moyens de paiement. Le jour J, organise un point d’équipe court avant l’ouverture. Après l’événement, collecte les chiffres et les retours pour améliorer la prochaine édition à ${city.name}.</p>
<p><strong>À retenir :</strong> pour ${topic.keyword(city.name).toLowerCase()}, la qualité vient d’une préparation simple, documentée et adaptée au terrain. Explore les événements et les prestataires vérifiés sur LIVEINBLACK afin de comparer les options disponibles près de toi.</p>`
}

export function buildBeninCampaign(referenceDate = new Date()): BeninCampaignPost[] {
  return cities.flatMap((city, cityIndex) => topics.map((topic, topicIndex) => {
    const title = topic.title(city.name)
    const html = content(city, topic)
    const keyword = topic.keyword(city.name)
    const publishedAt = new Date(referenceDate.getTime() - (cityIndex * topics.length + topicIndex + 1) * 86_400_000)
    return {
      slug: `${topic.slug}-${city.slug}-benin`,
      title,
      excerpt: compact(`${title}. Conseils locaux, budget, checklist et ressources pour prendre de meilleures décisions au Bénin.`, 190),
      content: html,
      coverImageUrl: '/images/live-in-black/blog/blog-editorial-benin-nightlife.png',
      category: topic.slug === 'sortir-week-end' ? 'benin' : 'guide',
      tags: [city.name, 'Bénin', topic.slug.replaceAll('-', ' '), 'LIVEINBLACK'],
      authorName: 'La rédaction LIVEINBLACK',
      metaTitle: compact(`${keyword} : guide pratique | LIVEINBLACK`, 60),
      metaDescription: compact(`Guide pour ${topic.promise} à ${city.name}, au Bénin : conseils locaux, budget, prestataires et checklist LIVEINBLACK.`, 155),
      publishedAt,
      readingTimeMinutes: Math.max(3, Math.round(words(html) / 200)),
    }
  }))
}
