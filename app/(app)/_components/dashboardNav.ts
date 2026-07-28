import type { LucideIcon } from 'lucide-react'
import {
  MessageCircle,
  User,
  Ticket,
  Heart,
  Users2,
  CalendarDays,
  Store,
  FileText,
  CreditCard,
  LayoutDashboard,
  UserPlus,
  Briefcase,
  Users,
  Zap,
  Trash2,
  Flag,
  Star,
  Newspaper,
  Settings,
  LifeBuoy,
} from 'lucide-react'
import type { Role } from '@/lib/server/permissions'

export interface DashboardNavItem {
  label: string
  href: string
  icon: LucideIcon
  children?: DashboardNavItem[]
}

// Config pure (pas de JSX) pilotant la sidebar de app/(app)/_components/DashboardShell.tsx.
// Réutilise uniquement des routes déjà existantes — aucune nouvelle page créée
// pour ce module. "Commun" apparaît pour tous les rôles, complété par le bloc
// spécifique à `activeRole`.
//
// "Mon profil" porte un sous-menu (`children`) — les items qui vivaient
// auparavant DANS le rendu de /profile (menu interne de ProfilClient.tsx,
// panneaux Mes billets/Paramètres/Support en state local `?panel=`) sont
// maintenant de vraies routes listées ici, la sidebar est l'unique
// navigation. Le portefeuille de billets/événements suivis n'est pas
// spécifique au rôle client (n'importe quel compte peut avoir acheté des
// billets), donc commun à tous les rôles plutôt que dans ROLE_NAV.client.
export const COMMON_NAV: DashboardNavItem[] = [
  { label: 'Messages', href: '/messages', icon: MessageCircle },
  {
    label: 'Mon profil',
    href: '/profile',
    icon: User,
    children: [
      { label: 'Mes billets', href: '/profile/billets', icon: Ticket },
      { label: 'Paramètres du compte', href: '/profile/parametres', icon: Settings },
      { label: 'Support / Aide', href: '/profile/aide', icon: LifeBuoy },
      { label: 'Événements intéressés', href: '/profile/interested-events', icon: Heart },
      { label: 'Organisateurs suivis', href: '/profile/followed-organizers', icon: Users2 },
    ],
  },
  { label: 'Mes soirées (équipe)', href: '/my-shifts', icon: Users2 },
]

export const ROLE_NAV: Record<Role, DashboardNavItem[]> = {
  client: [],
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
  // Reprend l'intégralité des onglets qui vivaient auparavant dans la barre
  // horizontale interne d'AgentShell.tsx (#107, supprimé) — chaque section a
  // maintenant sa PROPRE route sous app/(app)/agent/, plus de query param
  // `?tab=X` pour la navigation principale (liens de sidebar = vraies URLs).
  agent: [
    { label: 'Tableau de bord', href: '/agent', icon: Briefcase },
    { label: 'Comptes', href: '/agent/comptes', icon: Users },
    { label: 'Événements', href: '/agent/evenements', icon: CalendarDays },
    { label: 'Dossiers', href: '/agent/dossiers', icon: FileText },
    { label: 'Boosts', href: '/agent/boosts', icon: Zap },
    { label: 'Paiements', href: '/agent/paiements', icon: CreditCard },
    { label: 'Suppressions', href: '/agent/suppressions', icon: Trash2 },
    { label: 'Signalements', href: '/agent/signalements', icon: Flag },
    { label: 'Avis', href: '/agent/avis', icon: Star },
    { label: 'Actualité', href: '/agent/actualite', icon: Newspaper },
  ],
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
