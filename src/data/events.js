// Événements réels — à remplir via l'interface organisateur ou Firestore
export const events = []

export const topEvents = events.filter((e) => e.featured)

// Obtenir les événements filtrés par région
export function getEventsByRegion(regionName) {
  if (!regionName || regionName === 'Toutes') return events
  return events.filter((e) => e.region === regionName)
}

// Obtenir le top 3 pour une région
export function getTopEventsByRegion(regionName) {
  const filtered = getEventsByRegion(regionName)
  return filtered.slice(0, 3)
}

export const services = {
  salles: [
    {
      id: 1,
      name: "Le Loft Parisien",
      owner: "Marc D.",
      location: "Paris 10e",
      capacity: 300,
      price: "À partir de 800€/soir",
      rating: 4.8,
      tags: ["Industriel", "Rooftop", "Sono incluses"],
      description: "Loft industriel avec rooftop panoramique sur Paris. Parfait pour les soirées privées et events jusqu'à 300 personnes.",
    },
    {
      id: 2,
      name: "Entrepôt du Soleil",
      owner: "Sandra K.",
      location: "Lyon 7e",
      capacity: 500,
      price: "À partir de 1200€/soir",
      rating: 4.6,
      tags: ["Grande capacité", "Parking", "Cuisine pro"],
      description: "Ancien entrepôt reconverti, 800m², parking 200 places. Idéal pour soirées & événements d'envergure.",
    },
  ],
  prestations: [
    {
      id: 1,
      name: "FIRE CREW Marseille",
      type: "Cracheurs de feu & danseurs",
      price: "À partir de 400€",
      rating: 5.0,
      tags: ["Feu", "Acrobatie", "Show"],
    },
    {
      id: 2,
      name: "DJ Kass One",
      type: "DJ / Ambianceur",
      price: "À partir de 300€",
      rating: 4.9,
      tags: ["Afro", "Club", "Mariage"],
    },
    {
      id: 3,
      name: "VISION Films",
      type: "Équipe Caméra & Montage",
      price: "À partir de 600€",
      rating: 4.7,
      tags: ["Vidéo", "Photo", "Drone"],
    },
  ],
}
