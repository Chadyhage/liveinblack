import { Accordion } from 'liveinblack-ui'
import { Stage } from './_stage'

const FAQ = [
  { question: 'Puis-je me faire rembourser mon billet ?', answer: "Oui, si l'événement est annulé ou reporté, ou si tu as souscrit l'option d'annulation à l'achat. Le remboursement est automatique." },
  { question: 'Comment devenir organisateur sur LIVEINBLACK ?', answer: "Dépose ton dossier depuis ton profil. Notre équipe l'examine sous 48h ouvrées et t'informe par email." },
  { question: 'Le paiement Mobile Money est-il disponible ?', answer: 'Oui, via FedaPay pour les événements en Afrique de l\'Ouest (MTN, Moov) en plus du paiement par carte bancaire.' },
]

export const Basic = () => (
  <Stage style={{ maxWidth: 480 }}>
    <Accordion items={FAQ} />
  </Stage>
)
