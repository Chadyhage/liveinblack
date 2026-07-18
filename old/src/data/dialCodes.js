// Indicatifs téléphoniques internationaux — source unique partagée par tous les
// formulaires (connexion, onboarding organisateur, onboarding prestataire).
//
// `iso` = clé unique (certains pays partagent un indicatif, ex. +1 pour US/Canada,
// donc on ne peut pas utiliser le dial comme clé React). Les alias `code` (= dial)
// et `label` (= name) sont fournis pour la compatibilité avec les <select>
// existants qui stockent l'indicatif comme valeur — aucun changement de données.
//
// Ordre : marchés prioritaires (France, Togo, Bénin) d'abord, puis Afrique
// francophone, reste de l'Afrique, Europe, Maghreb/Moyen-Orient, Amériques,
// Asie, Océanie — alphabétique à l'intérieur de chaque bloc.

const RAW = [
  // ── Marchés prioritaires ──
  ['FR', '+33',  '🇫🇷', 'France'],
  ['TG', '+228', '🇹🇬', 'Togo'],
  ['BJ', '+229', '🇧🇯', 'Bénin'],

  // ── Afrique francophone & de l'Ouest ──
  ['CI', '+225', '🇨🇮', "Côte d'Ivoire"],
  ['SN', '+221', '🇸🇳', 'Sénégal'],
  ['ML', '+223', '🇲🇱', 'Mali'],
  ['BF', '+226', '🇧🇫', 'Burkina Faso'],
  ['NE', '+227', '🇳🇪', 'Niger'],
  ['GN', '+224', '🇬🇳', 'Guinée'],
  ['GW', '+245', '🇬🇼', 'Guinée-Bissau'],
  ['CM', '+237', '🇨🇲', 'Cameroun'],
  ['GA', '+241', '🇬🇦', 'Gabon'],
  ['CG', '+242', '🇨🇬', 'Congo'],
  ['CD', '+243', '🇨🇩', 'RD Congo'],
  ['TD', '+235', '🇹🇩', 'Tchad'],
  ['CF', '+236', '🇨🇫', 'Centrafrique'],
  ['MR', '+222', '🇲🇷', 'Mauritanie'],
  ['MG', '+261', '🇲🇬', 'Madagascar'],
  ['GH', '+233', '🇬🇭', 'Ghana'],
  ['NG', '+234', '🇳🇬', 'Nigeria'],

  // ── Reste de l'Afrique ──
  ['ZA', '+27',  '🇿🇦', 'Afrique du Sud'],
  ['KE', '+254', '🇰🇪', 'Kenya'],
  ['ET', '+251', '🇪🇹', 'Éthiopie'],
  ['TZ', '+255', '🇹🇿', 'Tanzanie'],
  ['UG', '+256', '🇺🇬', 'Ouganda'],
  ['RW', '+250', '🇷🇼', 'Rwanda'],
  ['AO', '+244', '🇦🇴', 'Angola'],
  ['MZ', '+258', '🇲🇿', 'Mozambique'],
  ['ZM', '+260', '🇿🇲', 'Zambie'],
  ['ZW', '+263', '🇿🇼', 'Zimbabwe'],

  // ── Maghreb & Moyen-Orient ──
  ['MA', '+212', '🇲🇦', 'Maroc'],
  ['DZ', '+213', '🇩🇿', 'Algérie'],
  ['TN', '+216', '🇹🇳', 'Tunisie'],
  ['EG', '+20',  '🇪🇬', 'Égypte'],
  ['LB', '+961', '🇱🇧', 'Liban'],
  ['AE', '+971', '🇦🇪', 'Émirats arabes unis'],
  ['SA', '+966', '🇸🇦', 'Arabie saoudite'],
  ['QA', '+974', '🇶🇦', 'Qatar'],
  ['TR', '+90',  '🇹🇷', 'Turquie'],
  ['IL', '+972', '🇮🇱', 'Israël'],

  // ── Europe ──
  ['BE', '+32',  '🇧🇪', 'Belgique'],
  ['CH', '+41',  '🇨🇭', 'Suisse'],
  ['LU', '+352', '🇱🇺', 'Luxembourg'],
  ['MC', '+377', '🇲🇨', 'Monaco'],
  ['GB', '+44',  '🇬🇧', 'Royaume-Uni'],
  ['IE', '+353', '🇮🇪', 'Irlande'],
  ['DE', '+49',  '🇩🇪', 'Allemagne'],
  ['NL', '+31',  '🇳🇱', 'Pays-Bas'],
  ['ES', '+34',  '🇪🇸', 'Espagne'],
  ['PT', '+351', '🇵🇹', 'Portugal'],
  ['IT', '+39',  '🇮🇹', 'Italie'],
  ['AT', '+43',  '🇦🇹', 'Autriche'],
  ['SE', '+46',  '🇸🇪', 'Suède'],
  ['NO', '+47',  '🇳🇴', 'Norvège'],
  ['DK', '+45',  '🇩🇰', 'Danemark'],
  ['FI', '+358', '🇫🇮', 'Finlande'],
  ['PL', '+48',  '🇵🇱', 'Pologne'],
  ['GR', '+30',  '🇬🇷', 'Grèce'],
  ['RO', '+40',  '🇷🇴', 'Roumanie'],
  ['RU', '+7',   '🇷🇺', 'Russie'],
  ['UA', '+380', '🇺🇦', 'Ukraine'],

  // ── Amériques ──
  ['US', '+1',   '🇺🇸', 'États-Unis'],
  ['CA', '+1',   '🇨🇦', 'Canada'],
  ['BR', '+55',  '🇧🇷', 'Brésil'],
  ['MX', '+52',  '🇲🇽', 'Mexique'],
  ['AR', '+54',  '🇦🇷', 'Argentine'],
  ['CO', '+57',  '🇨🇴', 'Colombie'],
  ['CL', '+56',  '🇨🇱', 'Chili'],
  ['HT', '+509', '🇭🇹', 'Haïti'],
  ['GP', '+590', '🇬🇵', 'Guadeloupe'],
  ['MQ', '+596', '🇲🇶', 'Martinique'],
  ['GF', '+594', '🇬🇫', 'Guyane'],
  ['RE', '+262', '🇷🇪', 'La Réunion'],

  // ── Asie & Océanie ──
  ['CN', '+86',  '🇨🇳', 'Chine'],
  ['IN', '+91',  '🇮🇳', 'Inde'],
  ['JP', '+81',  '🇯🇵', 'Japon'],
  ['KR', '+82',  '🇰🇷', 'Corée du Sud'],
  ['ID', '+62',  '🇮🇩', 'Indonésie'],
  ['TH', '+66',  '🇹🇭', 'Thaïlande'],
  ['VN', '+84',  '🇻🇳', 'Viêt Nam'],
  ['PH', '+63',  '🇵🇭', 'Philippines'],
  ['AU', '+61',  '🇦🇺', 'Australie'],
  ['NZ', '+64',  '🇳🇿', 'Nouvelle-Zélande'],
]

export const DIAL_CODES = RAW.map(([iso, dial, flag, name]) => ({
  iso, dial, code: dial, flag, name, label: name,
}))
