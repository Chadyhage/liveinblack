import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { Banknote, BriefcaseBusiness, CalendarDays, ClipboardCheck, CreditCard, FileCheck2, Heart, Mail, MessageCircle, Newspaper, RefreshCcw, Repeat2, ShieldAlert, ShieldCheck, Star, TicketCheck, UserRoundCheck, UsersRound } from 'lucide-react'

const icons = {
  'banknote': Banknote,
  'briefcase-business': BriefcaseBusiness,
  'calendar-days': CalendarDays,
  'clipboard-check': ClipboardCheck,
  'credit-card': CreditCard,
  'file-check-2': FileCheck2,
  'heart': Heart,
  'mail': Mail,
  'message-circle': MessageCircle,
  'newspaper': Newspaper,
  'refresh-ccw': RefreshCcw,
  'repeat-2': Repeat2,
  'shield-alert': ShieldAlert,
  'shield-check': ShieldCheck,
  'star': Star,
  'ticket-check': TicketCheck,
  'user-round-check': UserRoundCheck,
  'users-round': UsersRound,
} as const

async function main() {
  const output = resolve(process.cwd(), 'public/images/email-icons')
  await mkdir(output, { recursive: true })
  await Promise.all(Object.entries(icons).map(async ([name, Icon]) => {
    const svg = renderToStaticMarkup(<Icon xmlns="http://www.w3.org/2000/svg" size={64} stroke="#b8f34a" strokeWidth={2.1} fill="none" aria-hidden="true" />)
    await sharp(Buffer.from(svg)).resize(64, 64).png().toFile(resolve(output, `${name}.png`))
  }))
  console.log(`${Object.keys(icons).length} icônes e-mail générées dans ${output}.`)
}

void main()
