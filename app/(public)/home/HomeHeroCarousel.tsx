'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import styles from './home.module.css'

const SLIDES = [
  'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1920&q=80',
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1920&q=80',
  'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1920&q=80',
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
