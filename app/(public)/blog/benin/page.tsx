import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, CalendarDays, MapPin, Search, Sparkles, Ticket, UsersRound } from 'lucide-react'
import styles from './benin.module.css'

const SITE = process.env.PUBLIC_SITE_URL || 'https://liveinblack.com'

const cityGuides = [
  { city: 'Cotonou', href: '/blog/sortir-week-end-cotonou-benin', label: 'Sortir ce week-end à Cotonou' },
  { city: 'Abomey-Calavi', href: '/blog/billetterie-abomey-calavi-benin', label: 'Billetterie en ligne à Abomey-Calavi' },
  { city: 'Porto-Novo', href: '/blog/choisir-lieu-porto-novo-benin', label: 'Choisir un lieu à Porto-Novo' },
  { city: 'Ouidah', href: '/blog/concert-ouidah-benin', label: 'Produire un concert à Ouidah' },
  { city: 'Parakou', href: '/blog/evenement-entreprise-parakou-benin', label: 'Événement d’entreprise à Parakou' },
  { city: 'Grand-Popo', href: '/blog/mariage-grand-popo-benin', label: 'Organiser un mariage à Grand-Popo' },
]

const strategicGuides = [
  { intent: 'Sorties', href: '/blog/sortir-week-end-porto-novo-benin', title: 'Sortir à Porto-Novo', text: 'Comparer les ambiances, dates, trajets et budgets avant de réserver.' },
  { intent: 'Billetterie', href: '/blog/billetterie-cotonou-benin', title: 'Billetterie en ligne à Cotonou', text: 'Structurer ses tarifs, suivre les ventes et scanner plus vite à l’entrée.' },
  { intent: 'Prestataires', href: '/blog/choisir-dj-cotonou-benin', title: 'Choisir un DJ à Cotonou', text: 'Évaluer style, matériel, expérience et conditions avant de confirmer.' },
  { intent: 'Lieux', href: '/blog/choisir-lieu-abomey-calavi-benin', title: 'Choisir un lieu à Abomey-Calavi', text: 'Capacité, accès, sécurité et contraintes techniques à vérifier.' },
  { intent: 'Concerts', href: '/blog/concert-parakou-benin', title: 'Produire un concert à Parakou', text: 'Sécuriser artistes, fiche technique, billetterie et accueil public.' },
  { intent: 'Sécurité', href: '/blog/securite-cotonou-benin', title: 'Sécurité événementielle à Cotonou', text: 'Préparer les accès, équipes, procédures et risques d’affluence.' },
  { intent: 'Mariage', href: '/blog/mariage-ouidah-benin', title: 'Organiser un mariage à Ouidah', text: 'Coordonner lieu, musique, décoration, invités et météo.' },
  { intent: 'Entreprise', href: '/blog/evenement-entreprise-cotonou-benin', title: 'Événement d’entreprise à Cotonou', text: 'Transformer un objectif business en expérience claire et mesurable.' },
  { intent: 'Anniversaire', href: '/blog/anniversaire-abomey-benin', title: 'Préparer un anniversaire à Abomey', text: 'Maîtriser invités, animation, restauration et budget.' },
  { intent: 'Nord Bénin', href: '/blog/sortir-week-end-natitingou-benin', title: 'Sortir à Natitingou', text: 'Repérer les événements et préparer les déplacements dans l’Atacora.' },
  { intent: 'Culture', href: '/blog/concert-ouidah-benin', title: 'Concert et culture à Ouidah', text: 'Construire une expérience locale forte autour du public et du lieu.' },
  { intent: 'Budget', href: '/blog/organiser-soiree-bohicon-benin', title: 'Organiser une soirée à Bohicon', text: 'Prévoir un budget prudent, des ventes lisibles et une équipe prête.' },
]

const seoClusters = [
  { icon: CalendarDays, title: 'Trouver des événements', text: 'Concerts, soirées, festivals, expériences culturelles et sorties du week-end.', href: '/events', cta: 'Voir les événements' },
  { icon: Ticket, title: 'Réserver ses billets', text: 'Billetterie en ligne, billets numériques, paiement et accès plus fluide le jour J.', href: '/events', cta: 'Réserver maintenant' },
  { icon: UsersRound, title: 'Choisir un organisateur', text: 'Profils publics, événements passés, communauté et crédibilité locale.', href: '/organizers', cta: 'Découvrir les organisateurs' },
  { icon: Sparkles, title: 'Trouver un prestataire', text: 'DJ, photographes, lieux, traiteurs, technique, sécurité et équipes terrain.', href: '/providers', cta: 'Comparer les prestataires' },
]

const supplyCtas = [
  {
    href: '/organizer-signup',
    target: 'organizer_signup',
    title: 'Publier un événement',
    text: 'Crée ton profil organisateur, mets tes billets en ligne et suis tes ventes depuis un seul espace.',
  },
  {
    href: '/provider-signup',
    target: 'provider_signup',
    title: 'Proposer un service',
    text: 'Présente ton activité événementielle, gagne en visibilité et reçois de nouvelles demandes au Bénin.',
  },
]

const faqItems = [
  {
    question: 'Où trouver des événements au Bénin ?',
    answer: 'LIVEINBLACK regroupe les événements publics, concerts, soirées, festivals et expériences culturelles au Bénin, avec une recherche par ville et des pages de détail pour réserver ou s’informer.',
  },
  {
    question: 'Comment vendre des billets en ligne au Bénin ?',
    answer: 'Un organisateur peut publier son événement, structurer ses tarifs, suivre les ventes et utiliser les billets numériques afin de fluidifier l’entrée le jour J.',
  },
  {
    question: 'Comment choisir un prestataire événementiel à Cotonou ?',
    answer: 'Compare le type de service, les références, la zone d’intervention, les photos, les avis et les conditions. LIVEINBLACK met en avant les prestataires utiles pour DJ, photo, lieux, traiteurs, sécurité et technique.',
  },
  {
    question: 'Pourquoi créer un guide dédié aux événements au Bénin ?',
    answer: 'Un hub dédié relie les recherches locales aux pages utiles : événements, organisateurs, prestataires et guides par ville. Cela aide les utilisateurs à décider plus vite et renforce la compréhension SEO du site.',
  },
]

export const metadata: Metadata = {
  title: 'Événements au Bénin : guides, billets et prestataires — LIVEINBLACK',
  description: 'Le hub LIVEINBLACK pour sortir, organiser, réserver et trouver des prestataires événementiels au Bénin : Cotonou, Porto-Novo, Abomey-Calavi, Parakou et plus.',
  alternates: { canonical: '/blog/benin' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Événements au Bénin : guides, billets et prestataires',
    description: 'Guides pratiques LIVEINBLACK pour la scène événementielle du Bénin.',
    type: 'website',
    url: '/blog/benin',
    locale: 'fr_BJ',
    siteName: 'LIVEINBLACK',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Événements au Bénin — LIVEINBLACK',
    description: 'Guides, billets et prestataires pour vivre et organiser les meilleurs événements au Bénin.',
  },
}

export default function BeninEditorialHubPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${SITE}/blog/benin#collection`,
        url: `${SITE}/blog/benin`,
        name: 'Événements au Bénin — guides LIVEINBLACK',
        description: metadata.description,
        inLanguage: 'fr-BJ',
        isPartOf: { '@id': `${SITE}/#website` },
        about: [
          { '@type': 'Thing', name: 'événements au Bénin' },
          { '@type': 'Thing', name: 'billetterie en ligne au Bénin' },
          { '@type': 'Thing', name: 'prestataires événementiels au Bénin' },
          { '@type': 'Place', name: 'Cotonou' },
        ],
      },
      {
        '@type': 'ItemList',
        '@id': `${SITE}/blog/benin#guides`,
        name: 'Guides événementiels par ville au Bénin',
        numberOfItems: cityGuides.length,
        itemListElement: cityGuides.map((guide, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: guide.label,
          url: `${SITE}${guide.href}`,
        })),
      },
      {
        '@type': 'ItemList',
        '@id': `${SITE}/blog/benin#strategic-guides`,
        name: 'Guides stratégiques pour sortir et organiser au Bénin',
        numberOfItems: strategicGuides.length,
        itemListElement: strategicGuides.map((guide, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: guide.title,
          url: `${SITE}${guide.href}`,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${SITE}/blog/benin#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE}/home` },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog` },
          { '@type': 'ListItem', position: 3, name: 'Bénin', item: `${SITE}/blog/benin` },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE}/blog/benin#faq`,
        inLanguage: 'fr-BJ',
        mainEntity: faqItems.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      },
    ],
  }

  return (
    <main className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Guides Bénin · LIVEINBLACK</p>
        <h1>Événements au Bénin : sortir, réserver et organiser mieux.</h1>
        <p>
          Le point d’entrée pour découvrir les sorties, préparer une soirée, choisir des prestataires et utiliser une billetterie fiable à Cotonou,
          Porto-Novo, Abomey-Calavi, Parakou et partout au Bénin.
        </p>
        <div className={styles.heroActions}>
          <Link href="/events" data-growth-event="cta_click" data-growth-surface="blog_benin_hero" data-growth-target="events">Voir les événements <ArrowRight size={16} aria-hidden="true" /></Link>
          <Link href="/search" data-growth-event="cta_click" data-growth-surface="blog_benin_hero" data-growth-target="search">Rechercher sur LIVEINBLACK <Search size={16} aria-hidden="true" /></Link>
        </div>
      </section>

      <section className={styles.grid} aria-label="Accès rapides événementiels au Bénin">
        {seoClusters.map((cluster) => {
          const Icon = cluster.icon
          return (
            <Link key={cluster.title} href={cluster.href} className={styles.cluster} data-growth-event="cta_click" data-growth-surface="blog_benin_cluster" data-growth-target={cluster.href.replace('/', '') || 'home'}>
              <Icon size={20} aria-hidden="true" />
              <h2>{cluster.title}</h2>
              <p>{cluster.text}</p>
              <span>{cluster.cta} <ArrowRight size={15} aria-hidden="true" /></span>
            </Link>
          )
        })}
      </section>

      <section className={styles.guides} aria-labelledby="guides-benin-title">
        <div className={styles.sectionTitle}>
          <p><MapPin size={16} aria-hidden="true" /> Maillage local</p>
          <h2 id="guides-benin-title">Guides par ville et intention de recherche</h2>
        </div>
        <div className={styles.guideGrid}>
          {cityGuides.map((guide) => (
            <Link key={guide.href} href={guide.href} className={styles.guideCard} data-growth-event="cta_click" data-growth-surface="blog_benin_city_guides" data-growth-target={guide.city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')}>
              <span>{guide.city}</span>
              <strong>{guide.label}</strong>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.intentions} aria-labelledby="intentions-benin-title">
        <div className={styles.sectionTitle}>
          <p><Ticket size={16} aria-hidden="true" /> Intentions fortes</p>
          <h2 id="intentions-benin-title">Guides SEO pour les recherches qui convertissent</h2>
        </div>
        <div className={styles.intentGrid}>
          {strategicGuides.map((guide) => (
            <Link
              key={guide.href}
              href={guide.href}
              className={styles.intentCard}
              data-growth-event="cta_click"
              data-growth-surface="blog_benin_strategic_guides"
              data-growth-target={guide.intent.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')}
            >
              <span>{guide.intent}</span>
              <strong>{guide.title}</strong>
              <p>{guide.text}</p>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.copy} aria-label="Pourquoi LIVEINBLACK au Bénin">
        <h2>Pourquoi cette page aide le référencement LIVEINBLACK ?</h2>
        <p>
          Elle relie les recherches locales les plus importantes — événements au Bénin, sortir à Cotonou, billetterie en ligne, prestataires
          événementiels — aux pages qui convertissent vraiment : événements, organisateurs, prestataires et guides détaillés.
        </p>
        <p>
          Pour les utilisateurs, le parcours devient plus simple : comprendre, comparer, réserver ou publier. Pour les moteurs, le site expose une
          architecture claire autour du marché prioritaire : le Bénin.
        </p>
      </section>

      <section className={styles.faq} aria-labelledby="faq-benin-title">
        <div className={styles.sectionTitle}>
          <p><Search size={16} aria-hidden="true" /> Questions fréquentes</p>
          <h2 id="faq-benin-title">Réponses rapides pour sortir et organiser au Bénin</h2>
        </div>
        <div className={styles.faqGrid}>
          {faqItems.map((item) => (
            <article key={item.question} className={styles.faqCard}>
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.supply} aria-labelledby="supply-benin-title">
        <div>
          <p className={styles.eyebrow}>Développer l’écosystème</p>
          <h2 id="supply-benin-title">Organisateurs et prestataires : rejoignez la scène LIVEINBLACK.</h2>
        </div>
        <div className={styles.supplyActions}>
          {supplyCtas.map((cta) => (
            <Link key={cta.href} href={cta.href} data-growth-event="cta_click" data-growth-surface="blog_benin_supply" data-growth-target={cta.target}>
              <strong>{cta.title}</strong>
              <span>{cta.text}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
