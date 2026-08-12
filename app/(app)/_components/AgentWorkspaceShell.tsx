'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { BookOpen, CalendarDays, CreditCard, FileText, Flag, Globe, LayoutDashboard, Menu, MessageCircle, Newspaper, Settings, ShieldCheck, Star, Trash2, Users, X } from 'lucide-react'
import { Button, IconButton } from '@/app/components/ui'
import AccountMenu from '@/app/(public)/_components/AccountMenu'
import styles from './AgentWorkspaceShell.module.css'

const GROUPS = [
  { title: 'Pilotage', links: [{ href: '/agent', label: 'Centre de contrôle', icon: LayoutDashboard }] },
  { title: 'Opérations', links: [{ href: '/agent/comptes', label: 'Comptes', icon: Users }, { href: '/agent/evenements', label: 'Événements', icon: CalendarDays }, { href: '/agent/dossiers', label: 'Dossiers', icon: FileText }, { href: '/agent/paiements', label: 'Finance', icon: CreditCard }] },
  { title: 'Confiance', links: [{ href: '/agent/signalements', label: 'Signalements', icon: Flag }, { href: '/agent/avis', label: 'Avis', icon: Star }, { href: '/agent/suppressions', label: 'Suppressions', icon: Trash2 }] },
  { title: 'Publication', links: [{ href: '/agent/actualite', label: 'Accueil public', icon: Newspaper }, { href: '/agent/blog', label: 'Blog', icon: BookOpen }] },
  { title: 'Personnel', links: [{ href: '/messages', label: 'Messages', icon: MessageCircle }, { href: '/profile/parametres', label: 'Paramètres', icon: Settings }] },
]

const PAGE_NAMES: Record<string,string> = {'/agent':'Centre de contrôle','/agent/comptes':'Comptes','/agent/evenements':'Événements','/agent/dossiers':'Dossiers','/agent/paiements':'Finance','/agent/signalements':'Signalements','/agent/avis':'Avis','/agent/suppressions':'Suppressions','/agent/actualite':'Accueil public','/agent/blog':'Blog'}

export default function AgentWorkspaceShell({ children, badges }: { children: React.ReactNode; badges: Partial<Record<string, number>> }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const fullBleed = pathname === '/messages' || pathname.startsWith('/messages/')
  const active = (href:string) => pathname === href || (href !== '/agent' && pathname.startsWith(`${href}/`))
  const navigation = <>{GROUPS.map(group => <section key={group.title} className={styles.group}><p className={styles.groupTitle}>{group.title}</p><div className={styles.links}>{group.links.map(item => { const Icon=item.icon; const count=badges[item.href]; return <Link key={item.href} href={item.href} onClick={()=>setOpen(false)} className={`${styles.link}${active(item.href)?` ${styles.active}`:''}`} aria-current={active(item.href)?'page':undefined}><Icon size={18} strokeWidth={active(item.href)?2.2:1.8} aria-hidden="true"/><span>{item.label}</span>{count ? <span className={styles.badge}>{count}</span>:null}</Link>})}</div></section>)}</>
  return <div className={styles.root}>
    <aside className={styles.sidebar}><Link href="/agent" className={styles.brand}><span className={styles.mark}>LB</span><span className={styles.brandText}><strong>LIVEINBLACK</strong><span>Console d’opérations</span></span></Link><nav className={styles.nav} aria-label="Administration">{navigation}</nav><div className={styles.sidebarFoot}><Link href="/home" className={styles.publicLink}><Globe size={17}/><span>Voir le site public</span></Link></div></aside>
    <header className={styles.topbar}><div className={styles.topActions}><span className={styles.mobileMenu}><IconButton label={open?'Fermer le menu':'Ouvrir le menu'} icon={open?<X size={19}/>:<Menu size={19}/>} onClick={()=>setOpen(v=>!v)} style={{border:'1px solid rgba(255,255,255,.13)',background:'rgba(255,255,255,.07)',color:'#fff'}}/></span><div className={styles.context}><small>Administration</small><strong>{PAGE_NAMES[pathname] || (pathname.startsWith('/messages') ? 'Messages' : pathname.startsWith('/profile/parametres') ? 'Paramètres' : 'Console d’opérations')}</strong></div></div>{session?.user?<AccountMenu user={session.user}/>:<ShieldCheck size={20}/>}</header>
    {open ? <><Button className={styles.backdrop} variant="ghost" aria-label="Fermer le menu" onClick={()=>setOpen(false)}/><nav className={styles.drawer} aria-label="Administration mobile">{navigation}<Link href="/home" className={styles.publicLink}><Globe size={17}/><span>Voir le site public</span></Link></nav></>:null}
    <div className={`${styles.workspace}${fullBleed ? ` ${styles.workspaceFull}` : ''}`}>{children}</div>
  </div>
}
