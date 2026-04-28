// src/data/legal.js — Infos légales centralisées (mentions, contact, hébergeur)
// MAJ ce fichier dès que la société sera immatriculée (SIREN, adresse, etc.)

export const LEGAL = {
  brand: 'LIVEINBLACK',
  // À remplir une fois la structure juridique créée :
  legalForm: '',          // ex: 'SAS', 'SARL', 'Auto-entrepreneur'
  companyName: '',        // ex: 'LIVEINBLACK SAS'
  siren: '',              // 9 chiffres
  rcs: '',                // ex: 'RCS Paris B 123 456 789'
  capital: '',            // ex: '10 000 €'
  vatNumber: '',          // ex: 'FR12345678901'
  // Adresse du siège — à remplir
  address: {
    street: '',
    zip: '',
    city: '',
    country: 'France',
  },
  // Représentant légal
  director: {
    role: 'Représentant légal',
    name: 'Chady Hage',
  },
  // Contact
  contactEmail: 'hagechady@liveinblack.com',
  supportEmail: 'hagechady@liveinblack.com',
  phone: '',              // optionnel
  // Site
  domain: 'liveinblack.com',
  url: 'https://liveinblack.com',
  // Hébergeur
  host: {
    name: 'Vercel Inc.',
    address: '440 N Barranca Ave #4133, Covina, CA 91723, USA',
    website: 'https://vercel.com',
  },
  // Sous-processeurs (RGPD)
  subprocessors: [
    { name: 'Vercel Inc.', purpose: 'Hébergement', country: 'USA', dpa: 'https://vercel.com/legal/dpa' },
    { name: 'Google LLC (Firebase)', purpose: 'Authentification, base de données, stockage', country: 'USA / UE', dpa: 'https://firebase.google.com/terms/data-processing-terms' },
    { name: 'Stripe Inc.', purpose: 'Paiements en ligne', country: 'USA / Irlande', dpa: 'https://stripe.com/legal/dpa' },
  ],
  // DPO
  dpo: null, // ex: { name: 'XX', email: 'dpo@liveinblack.com' }
  // Autorité de contrôle
  authority: {
    name: 'CNIL',
    url: 'https://www.cnil.fr',
    address: '3 Place de Fontenoy, TSA 80715, 75334 Paris Cedex 07',
  },
  lastUpdate: 'Avril 2026',
}

// Helper d'affichage : retourne soit la valeur, soit un placeholder
export const LEGAL_DISPLAY = {
  ...LEGAL,
  companyDisplay: LEGAL.companyName || `${LEGAL.brand} — projet en cours d'immatriculation`,
  addressDisplay: [LEGAL.address.street, LEGAL.address.zip, LEGAL.address.city, LEGAL.address.country]
    .filter(Boolean).join(', ') || 'Adresse en cours de communication',
  sirenDisplay: LEGAL.siren || 'SIREN en cours d\'attribution',
}
