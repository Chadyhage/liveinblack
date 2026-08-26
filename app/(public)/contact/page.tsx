import type { Metadata } from 'next'
import { LEGAL } from '@/lib/shared/legal'
import ContactClient from './ContactClient'

export const metadata: Metadata = {
  title: `Contact — ${LEGAL.brand}`,
  description: `Contacte l'équipe ${LEGAL.brand} pour toute question, problème ou suggestion.`,
  alternates: { canonical: '/contact' },
}

export default function ContactPage() {
  return <ContactClient />
}
