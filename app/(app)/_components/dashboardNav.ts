import type { LucideIcon } from 'lucide-react'
import { MessageCircle, User, Ticket, Heart, Users2, CalendarDays, Store, FileText, CreditCard, LayoutDashboard, UserPlus, Briefcase } from 'lucide-react'
import type { Role } from '@/lib/server/permissions'

export interface DashboardNavItem {
  label: string
  href: string
  icon: LucideIcon
}

// Config pure (pas de JSX) pilotant la sidebar de app/(app)/_components/DashboardShell.tsx.
// Réutilise uniquement des routes déjà existantes — aucune nouvelle page créée
// pour ce module. "Commun" apparaît pour tous les rôles, complété par le bloc
// spécifique à `activeRole`.
export const COMMON_NAV: DashboardNavItem[] = [
  { label: 'Messages', href: '/messages', icon: MessageCircle },
  { label: 'Mon profil', href: '/profile', icon: User },
  { label: 'Mes soirées (équipe)', href: '/my-shifts', icon: Users2 },
]

export const ROLE_NAV: Record<Role, DashboardNavItem[]> = {
  client: [
    { label: 'Mes billets', href: '/profile?panel=billets', icon: Ticket },
    { label: 'Événements intéressés', href: '/profile/interested-events', icon: Heart },
    { label: 'Organisateurs suivis', href: '/profile/followed-organizers', icon: Users2 },
  ],
  organisateur: [
    { label: 'Mes événements', href: '/my-events', icon: CalendarDays },
    { label: 'Ma page publique', href: '/organizer-studio', icon: LayoutDashboard },
    { label: 'Mon dossier', href: '/my-application', icon: FileText },
  ],
  prestataire: [
    { label: 'Mon espace', href: '/offer-services', icon: Store },
    { label: 'Mon abonnement', href: '/my-subscription', icon: CreditCard },
    { label: 'Mon dossier', href: '/my-application', icon: FileText },
  ],
  agent: [{ label: 'Tableau de bord', href: '/agent', icon: Briefcase }],
}

// CTA de bas de sidebar, client uniquement — upsell vers les deux wizards
// d'inscription existants (déjà utilisés par le site public).
export const CLIENT_UPSELL: DashboardNavItem[] = [
  { label: 'Devenir organisateur', href: '/onboarding-organizer', icon: UserPlus },
  { label: 'Devenir prestataire', href: '/onboarding-provider', icon: UserPlus },
]

// Routes immersives (plein écran, sans sidebar) — même esprit que HIDE_ON
// dans app/components/AmbientMusicPlayer.tsx : la sidebar gênerait un flux
// caméra/chat/wizard qui a besoin de tout l'écran.
export const HIDE_SIDEBAR_PREFIXES = ['/messages', '/scanner', '/playlist', '/order', '/agent-sales', '/onboarding-organizer', '/onboarding-provider']
