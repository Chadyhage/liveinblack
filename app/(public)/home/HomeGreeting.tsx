'use client'

import { useState } from 'react'

// Client component pour lire l'heure LOCALE du visiteur (new Date() côté
// serveur utiliserait la région du serveur Vercel, pas forcément celle de
// l'utilisateur — le rendu serveur passerait à côté de l'intention de la
// salutation "selon l'heure"). Reprend la logique de l'ancien HeroGooeyText
// (old/src/pages/HomePage.jsx) : Bonjour / Bon après-midi / Bonsoir / Bonne
// nuit, sans porter la lib de morphing (nouvelle dépendance interdite) —
// remplacée par un simple fade-in CSS, voir globals.css `lbHomeGreetingFadeIn`.
function getTimeGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'Bonjour'
  if (h >= 12 && h < 18) return 'Bon après-midi'
  if (h >= 18 && h < 22) return 'Bonsoir'
  return 'Bonne nuit'
}

export default function HomeGreeting({ firstName }: { firstName: string }) {
  // `typeof window` est undefined pendant le rendu serveur (HTML vide pour
  // ce composant) et défini dès le premier rendu client, qui calcule alors
  // la vraie salutation avec l'heure LOCALE du visiteur — jamais de mismatch
  // d'hydratation à gérer, contrairement à un calcul fait dans un effect.
  const [greeting] = useState(() => (typeof window !== 'undefined' ? getTimeGreeting() : ''))

  if (!greeting) return null

  return (
    <p
      className="lb-home-greeting"
      style={{
        fontSize: 'clamp(15px, 3.4vw, 19px)',
        fontWeight: 700,
        letterSpacing: '.02em',
        color: 'var(--teal)',
        margin: '20px 0 0',
      }}
    >
      {greeting}
      {firstName ? `, ${firstName}` : ''}
    </p>
  )
}
