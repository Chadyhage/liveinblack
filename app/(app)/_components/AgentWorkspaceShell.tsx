'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Bell, BookOpen, CalendarDays, CreditCard, FileText, Flag, Globe, LayoutDashboard, Menu, MessageCircle, Newspaper, Settings, Star, Trash2, UserRound, Users, X } from 'lucide-react'
import { Button, IconButton } from '@/app/components/ui'
import AccountMenu from '@/app/(public)/_components/AccountMenu'
import styles from './AgentWorkspaceShell.module.css'

const GROUPS = [
  { title: 'Pilotage', links: [{ href: '/agent', label: 'Centre de contrôle', icon: LayoutDashboard }] },
  { title: 'Opérations', links: [{ href: '/agent/comptes', label: 'Comptes', icon: Users }, { href: '/agent/evenements', label: 'Événements', icon: CalendarDays }, { href: '/agent/dossiers', label: 'Dossiers', icon: FileText }, { href: '/agent/paiements', label: 'Finance', icon: CreditCard }] },
  { title: 'Confiance', links: [{ href: '/agent/signalements', label: 'Signalements', icon: Flag }, { href: '/agent/avis', label: 'Avis', icon: Star }, { href: '/agent/suppressions', label: 'Suppressions', icon: Trash2 }] },
  { title: 'Publication', links: [{ href: '/agent/actualite', label: 'Accueil public', icon: Newspaper }, { href: '/agent/blog', label: 'Blog', icon: BookOpen }] },
  { title: 'Personnel', links: [{ href: '/notifications', label: 'Notifications', icon: Bell }, { href: '/messages', label: 'Messages', icon: MessageCircle }, { href: '/profile', label: 'Mon profil', icon: UserRound }, { href: '/profile/parametres', label: 'Paramètres', icon: Settings }] },
]

const AGENT_PAGE_TITLES: Record<string, string> = {
  '/agent': 'Centre de contrôle',
  '/agent/comptes': 'Comptes',
  '/agent/evenements': 'Événements',
  '/agent/dossiers': 'Dossiers',
  '/agent/paiements': 'Finance',
  '/agent/signalements': 'Signalements',
  '/agent/avis': 'Avis',
  '/agent/suppressions': 'Suppressions',
  '/agent/blog': 'Blog',
}

export default function AgentWorkspaceShell({ children, badges }: { children: React.ReactNode; badges: Partial<Record<string, number>> }) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const raf = requestAnimationFrame(() => drawerRef.current?.querySelector<HTMLElement>('a[href],button:not([disabled])')?.focus())
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        requestAnimationFrame(() => menuButtonRef.current?.focus())
        return
      }
      if (event.key !== 'Tab' || !drawerRef.current) return
      const controls = Array.from(drawerRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'))
      if (!controls.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])
  function closeDrawer() { setOpen(false); requestAnimationFrame(() => menuButtonRef.current?.focus()) }
  const fullBleed = pathname === '/messages' || pathname.startsWith('/messages/')
  const active = (href:string) => pathname === href || (!['/agent', '/profile'].includes(href) && pathname.startsWith(`${href}/`))
  const navigation = <>{GROUPS.map(group => <section key={group.title} className={styles.group}><p className={styles.groupTitle}>{group.title}</p><div className={styles.links}>{group.links.map(item => { const Icon=item.icon; const count=badges[item.href]; return <Link key={item.href} href={item.href} onClick={()=>setOpen(false)} className={`${styles.link}${active(item.href)?` ${styles.active}`:''}`} aria-current={active(item.href)?'page':undefined}><Icon size={18} strokeWidth={active(item.href)?2.2:1.8} aria-hidden="true"/><span>{item.label}</span>{count ? <span className={styles.badge}>{count}</span>:null}</Link>})}</div></section>)}</>
  return <div className={styles.root}>
    <aside className={styles.sidebar}><Link href="/agent" className={styles.brand}><Image src="/branding/liveinblack-logo-horizontal.png" alt="LIVEINBLACK" width={614} height={217} className={styles.brandLogo} priority /><span className={styles.brandText}><strong>LIVEINBLACK</strong><span>Console d’opérations</span></span></Link><nav className={styles.nav} aria-label="Administration">{navigation}</nav><div className={styles.sidebarFoot}>{session?.user ? <div className={styles.sidebarAccount}><AccountMenu user={session.user} menuDirection="auto" dashboardMode /></div> : null}<Link href="/home" className={styles.publicLink}><Globe size={17}/><span>Voir le site public</span></Link></div></aside>
    <div className={styles.mobileTrigger}><IconButton ref={menuButtonRef} label={open?'Fermer le menu':'Ouvrir le menu'} icon={open?<X size={19}/>:<Menu size={19}/>} onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-controls="agent-mobile-navigation" style={{border:'1px solid rgba(255,255,255,.13)',background:'rgba(22,23,27,.92)',color:'#fff'}}/></div>
    {open ? <><Button className={styles.backdrop} variant="ghost" aria-label="Fermer le menu" onClick={closeDrawer}/><nav ref={drawerRef} id="agent-mobile-navigation" className={styles.drawer} aria-label="Administration mobile">{session?.user ? <div className={styles.drawerAccount}><AccountMenu user={session.user} dashboardMode /></div> : null}{navigation}<Link href="/home" className={styles.publicLink}><Globe size={17}/><span>Voir le site public</span></Link></nav></>:null}
    <div className={`${styles.workspace}${fullBleed ? ` ${styles.workspaceFull}` : ''}`}>
      {AGENT_PAGE_TITLES[pathname] ? <h1 className={styles.screenReaderTitle}>{AGENT_PAGE_TITLES[pathname]}</h1> : null}
      {children}
    </div>
  </div>
}
