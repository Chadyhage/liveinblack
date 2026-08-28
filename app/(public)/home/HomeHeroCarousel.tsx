'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import styles from './home.module.css'

const SLIDES = [
  '/images/live-in-black/home-hero-cotonou-nightlife.png',
  '/images/live-in-black/home-hero-rooftop-arrival.png',
  '/images/live-in-black/home-hero-live-entry.png',
]

export default function HomeHeroCarousel() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => setActive((current) => (current + 1) % SLIDES.length), 6000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <>
      <div className={styles.heroSlides} aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: -3 }}>
        {SLIDES.map((src, index) => (
          <Image key={src} src={src} alt="" fill priority={index === 0} unoptimized sizes="100vw" className={`${styles.heroImage} ${index === active ? styles.heroImageActive : ''}`} />
        ))}
      </div>
      <div className={styles.heroCarouselControls} role="group" aria-label="Choisir l’image du carrousel">
        {SLIDES.map((src, index) => (
          <button key={src} type="button" className={index === active ? styles.heroCarouselDotActive : styles.heroCarouselDot} aria-label={`Afficher l’image ${index + 1}`} aria-pressed={index === active} onClick={() => setActive(index)} />
        ))}
      </div>
    </>
  )
}
