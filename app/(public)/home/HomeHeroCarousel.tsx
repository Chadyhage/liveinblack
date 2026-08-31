'use client'

import Image from 'next/image'
import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import styles from './home.module.css'

const SLIDES = [
  {
    label: 'DJ en club',
    poster: '/images/live-in-black/videos/nightclub-vip-entrance-poster.png',
    video: '/videos/live-in-black/nightclub-vip-entrance.mp4',
  },
  {
    label: 'DJ et foule',
    poster: '/images/live-in-black/videos/nightclub-dancefloor-poster.png',
    video: '/videos/live-in-black/nightclub-dancefloor.mp4',
  },
  {
    label: 'soirée en club',
    poster: '/images/live-in-black/videos/nightclub-dj-booth-poster.png',
    video: '/videos/live-in-black/nightclub-dj-booth.mp4',
  },
  {
    label: 'lumières de club',
    poster: '/images/live-in-black/videos/nightclub-rooftop-lounge-poster.png',
    video: '/videos/live-in-black/nightclub-rooftop-lounge.mp4',
  },
]

const heroBackgroundStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: -3,
  pointerEvents: 'none',
}

const heroMediaStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: '58% 42%',
  display: 'block',
  transition: 'opacity 700ms ease',
}

export default function HomeHeroCarousel() {
  const [active, setActive] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncMotionPreference = () => setReduceMotion(motionPreference.matches)

    syncMotionPreference()
    motionPreference.addEventListener('change', syncMotionPreference)

    return () => motionPreference.removeEventListener('change', syncMotionPreference)
  }, [])

  useEffect(() => {
    if (reduceMotion) return

    const timer = window.setInterval(() => setActive((current) => (current + 1) % SLIDES.length), 7000)
    return () => window.clearInterval(timer)
  }, [reduceMotion])

  return (
    <>
      <div className={styles.heroSlides} aria-hidden="true" style={heroBackgroundStyle}>
        {SLIDES.map((slide, index) => (
          reduceMotion ? (
            <Image
              key={slide.poster}
              src={slide.poster}
              alt=""
              fill
              priority={index === 0}
              unoptimized
              sizes="100vw"
              className={`${styles.heroMedia} ${index === active ? styles.heroMediaActive : ''}`}
              style={{ ...heroMediaStyle, opacity: index === active ? 1 : 0 }}
            />
          ) : (
            <video
              key={slide.video}
              className={`${styles.heroMedia} ${index === active ? styles.heroMediaActive : ''}`}
              style={{ ...heroMediaStyle, opacity: index === active ? 1 : 0 }}
              autoPlay
              muted
              loop
              playsInline
              preload={index === 0 ? 'auto' : 'metadata'}
              poster={slide.poster}
            >
              <source src={slide.video} type="video/mp4" />
            </video>
          )
        ))}
      </div>
      <div className={styles.heroCarouselControls} role="group" aria-label="Choisir la vidéo du carrousel">
        {SLIDES.map((slide, index) => (
          <button
            key={slide.video}
            type="button"
            className={index === active ? styles.heroCarouselDotActive : styles.heroCarouselDot}
            aria-label={`Afficher la vidéo ${index + 1} : ${slide.label}`}
            aria-pressed={index === active}
            onClick={() => setActive(index)}
          />
        ))}
      </div>
    </>
  )
}
