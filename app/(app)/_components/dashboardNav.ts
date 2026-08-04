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
  Trash2,
  Flag,
  Star,
  Newspaper,
  BookOpen,
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
// navigation. Ordre pensé pour mettre les actions fréquentes en premier
// (Paramètres, Mes billets) et l'Aide en dernier (rarement consultée).
// Le portefeuille de billets n'est pas spécifique au rôle client
// (n'importe quel compte peut avoir acheté des billets), donc commun à tous
// les rôles plutôt que dans ROLE_NAV.client.
//
// "Mes favoris" est un groupe séparé de "Mon profil" : suivre des
// événements/organisateurs est une action de découverte, pas de gestion de
// compte — les mélanger sous "Mon profil" les enterrait sans rapport
// conceptuel avec paramètres/billets/aide.
export const COMMON_NAV: DashboardNavItem[] = [
  { label: 'Messages', href: '/messages', icon: MessageCircle },
  {
    // Renommé de "Mon profil" → "Mon compte" (retour client) : "Mes billets"
    // ne doit pas donner l'impression de vivre dans un espace "profil
    // public" — ce groupe est en réalité la gestion de compte (paramètres +
    // billets), le label doit le dire plutôt que suggérer une vitrine
    // publique. La route reste /profile (page d'accueil du groupe, cartes
    // de raccourci), seul le libellé de nav change.
    label: 'Mon compte',
    href: '/profile',
    icon: User,
    children: [
      { label: 'Paramètres du compte', href: '/profile/parametres', icon: Settings },
      { label: 'Mes billets', href: '/profile/billets', icon: Ticket },
    ],
  },
  {
    label: 'Mes favoris',
    href: '/profile/interested-events',
    icon: Heart,
    children: [
      { label: 'Événements intéressés', href: '/profile/interested-events', icon: Heart },
      { label: 'Organisateurs suivis', href: '/profile/followed-organizers', icon: Users2 },
    ],
  },
  { label: 'Mes soirées (équipe)', href: '/my-shifts', icon: Users2 },
  { label: 'Aide & FAQ', href: '/help', icon: LifeBuoy },
]

export const ROLE_NAV: Record<Role, DashboardNavItem[]> = {
  client: [],
  // Labels pensés pour un utilisateur non-technique : "Mon dossier" (jargon
  // de revue agent) → "Mon inscription" ; "Ma page publique" ne disait pas
  // qu'elle contient aussi la config des encaissements (Stripe/Mobile Money).
  organisateur: [
    { label: 'Mes événements', href: '/my-events', icon: CalendarDays },
    { label: 'Ma page & paiements', href: '/organizer-studio', icon: LayoutDashboard },
    { label: 'Mon inscription', href: '/my-application', icon: FileText },
  ],
  prestataire: [
    { label: 'Mon espace', href: '/offer-services', icon: Store },
    // L'abonnement est un onglet de /offer-services : page publique,
    // catalogue, avis et facturation restent dans un seul espace métier.
    { label: 'Mon inscription', href: '/my-application', icon: FileText },
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
    // 'Boosts' n'a plus sa propre entrée — fusionné comme onglet dans
    // Paiements (vue lecture seule, sans file d'action propre, sa place
    // naturelle à côté des autres files financières).
    { label: 'Paiements', href: '/agent/paiements', icon: CreditCard },
    { label: 'Suppressions', href: '/agent/suppressions', icon: Trash2 },
    { label: 'Signalements', href: '/agent/signalements', icon: Flag },
    { label: 'Avis', href: '/agent/avis', icon: Star },
    { label: 'Actualité', href: '/agent/actualite', icon: Newspaper },
    // Nouvelle entrée (pas un port legacy) : gestion des articles de
    // lib/models/BlogPost.ts, jusqu'ici sans aucune UI (voir
    // app/(app)/agent/blog/page.tsx).
    { label: 'Blog', href: '/agent/blog', icon: BookOpen },
  ],
}

// CTA de bas de sidebar, client uniquement — upsell vers les deux wizards
// d'inscription existants (déjà utilisés par le site public).
export const CLIENT_UPSELL: DashboardNavItem[] = [
  { label: 'Devenir organisateur', href: '/organizer-signup', icon: UserPlus },
  { label: 'Devenir prestataire', href: '/provider-signup', icon: UserPlus },
]

// Routes immersives (plein écran, sans sidebar) — même esprit que HIDE_ON
// dans app/components/AmbientMusicPlayer.tsx : la sidebar gênerait un flux
// caméra/chat/wizard qui a besoin de tout l'écran. /messages n'en fait plus
// partie (le client veut la sidebar visible aussi sur Messages, voir
// FULL_BLEED_PREFIXES ci-dessous pour la mise en page 3 colonnes).
export const HIDE_SIDEBAR_PREFIXES = ['/scanner', '/playlist', '/order', '/on-site-sales']

// Routes où la sidebar reste visible mais la colonne de contenu ne doit PAS
// recevoir le padding standard de DashboardShell — MessagesClient.tsx gère
// déjà lui-même son propre layout plein écran à 2 colonnes (liste +
// conversation), la sidebar s'ajoute simplement comme 3e colonne à gauche
// sans toucher à ces 2 colonnes existantes.
export const FULL_BLEED_PREFIXES = ['/messages']
